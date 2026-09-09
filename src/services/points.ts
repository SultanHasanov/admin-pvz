import type { PickupPoint } from '../entities/types'
import { client, organizationId } from './org'

interface PointRow { id:string; name:string; address:string; timezone:string; archived_at:string | null }
const toPoint = (row:PointRow):PickupPoint => ({ id: row.id, name: row.name, address: row.address, timezone: row.timezone, archivedAt: row.archived_at })

export async function listPickupPoints(includeArchived = false):Promise<PickupPoint[]> {
  const organization_id = await organizationId()
  let query = client().from('pickup_points').select('id,name,address,timezone,archived_at').eq('organization_id', organization_id).order('name')
  if (!includeArchived) query = query.is('archived_at', null)
  const { data, error } = await query
  if (error) throw error
  return (data as PointRow[]).map(toPoint)
}

export async function createPickupPoint(input:{ name:string; address:string; timezone:string }) {
  const organization_id = await organizationId()
  const { data, error } = await client().from('pickup_points').insert({ organization_id, name: input.name.trim(), address: input.address.trim(), timezone: input.timezone }).select('id,name,address,timezone,archived_at').single()
  if (error) throw error
  return toPoint(data as PointRow)
}

export async function updatePickupPoint(id:string, input:{ name:string; address:string; timezone:string }) {
  const { error } = await client().from('pickup_points').update({ name: input.name.trim(), address: input.address.trim(), timezone: input.timezone, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function setPickupPointArchived(id:string, archived:boolean) {
  const { error } = await client().from('pickup_points').update({ archived_at: archived ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}
