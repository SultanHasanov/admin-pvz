import type { PickupPoint, SlotConfig, WorkingHours } from '../entities/types'
import { DEFAULT_SLOTS } from '../entities/slots'
import { client, organizationId } from './org'

interface PointRow { id:string; name:string; address:string; timezone:string; archived_at:string | null; slot_config:SlotConfig | null; working_hours:Partial<WorkingHours> | null }
const columns = 'id,name,address,timezone,archived_at,slot_config,working_hours'

/** Колонка jsonb с дефолтом `{}`: пустой объект — часы не заданы. */
const hoursOf = (value:Partial<WorkingHours> | null):WorkingHours | null =>
  value?.from && value.to ? { from: value.from, to: value.to } : null
const toPoint = (row:PointRow):PickupPoint => ({
  id: row.id, name: row.name, address: row.address, timezone: row.timezone, archivedAt: row.archived_at,
  slotConfig: row.slot_config ?? DEFAULT_SLOTS,
  hours: hoursOf(row.working_hours),
})

export async function listPickupPoints(includeArchived = false):Promise<PickupPoint[]> {
  const organization_id = await organizationId()
  let query = client().from('pickup_points').select(columns).eq('organization_id', organization_id).order('name')
  if (!includeArchived) query = query.is('archived_at', null)
  const { data, error } = await query
  if (error) throw error
  return (data as PointRow[]).map(toPoint)
}

export interface PointInput { name:string; address:string; timezone:string; hours?:WorkingHours | null }

export async function createPickupPoint(input:PointInput) {
  const organization_id = await organizationId()
  const { data, error } = await client().from('pickup_points').insert({
    organization_id, name: input.name.trim(), address: input.address.trim(), timezone: input.timezone,
    working_hours: input.hours ?? {},
  }).select(columns).single()
  if (error) throw error
  return toPoint(data as PointRow)
}

export async function updatePickupPoint(id:string, input:PointInput) {
  const { error } = await client().from('pickup_points').update({
    name: input.name.trim(), address: input.address.trim(), timezone: input.timezone,
    ...(input.hours !== undefined ? { working_hours: input.hours ?? {} } : {}),
    updated_at: new Date().toISOString(),
  }).eq('id', id)
  if (error) throw error
}

/**
 * Сколько человек выходит на точку в день. Пишем целиком, а не по ключам: настройка
 * маленькая, а частичное обновление jsonb в PostgREST требует отдельной функции.
 */
export async function setSlotConfig(id:string, config:SlotConfig) {
  const { error } = await client().from('pickup_points')
    .update({ slot_config: config, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function setPickupPointArchived(id:string, archived:boolean) {
  const { error } = await client().from('pickup_points').update({ archived_at: archived ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}
