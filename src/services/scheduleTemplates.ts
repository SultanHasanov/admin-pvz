import type { PayMode } from '../entities/types'
import type { SchedulePattern } from '../entities/schedule'
import { client, organizationId } from './org'

export interface ScheduleTemplate {
  id:string
  name:string
  pattern:SchedulePattern
  employeeIds:string[]
  pickupPointId:string | null
  startsAt:string
  endsAt:string
  payMode:PayMode
}

interface TemplateRow {
  id:string; name:string; pattern:SchedulePattern & { v?:number }
  employee_ids:string[] | null; pickup_point_id:string | null
  starts_at:string; ends_at:string; pay_mode:PayMode
}
const columns = 'id,name,pattern,employee_ids,pickup_point_id,starts_at,ends_at,pay_mode'

/** Колонка time отдаёт «09:00:00», а пикеру нужно «09:00». */
const hhmm = (value:string) => value.slice(0, 5)

const toTemplate = (row:TemplateRow):ScheduleTemplate => ({
  id: row.id, name: row.name, pattern: row.pattern,
  employeeIds: row.employee_ids ?? [], pickupPointId: row.pickup_point_id,
  startsAt: hhmm(row.starts_at), endsAt: hhmm(row.ends_at), payMode: row.pay_mode,
})

/**
 * employee_ids — обычный массив без внешнего ключа, поэтому уволенный сотрудник
 * останется в шаблоне мусорным id. Отфильтровываем его здесь, а не падаем при применении.
 */
export async function listScheduleTemplates(knownEmployeeIds?:string[]):Promise<ScheduleTemplate[]> {
  const organization_id = await organizationId()
  const { data, error } = await client().from('shift_templates').select(columns)
    .eq('organization_id', organization_id).eq('active', true).order('name')
  if (error) throw error

  const templates = (data as TemplateRow[]).map(toTemplate)
  if (!knownEmployeeIds) return templates

  const alive = new Set(knownEmployeeIds)
  return templates.map(template => ({
    ...template,
    employeeIds: template.employeeIds.filter(id => alive.has(id)),
    pattern: prunePattern(template.pattern, alive),
  }))
}

function prunePattern(pattern:SchedulePattern, alive:Set<string>):SchedulePattern {
  if (pattern.kind === 'cycle') return { ...pattern, participants: pattern.participants.filter(p => alive.has(p.employeeId)) }
  const byEmployee = Object.fromEntries(Object.entries(pattern.byEmployee).filter(([id]) => alive.has(id)))
  return { ...pattern, byEmployee }
}

export interface ScheduleTemplateInput extends Omit<ScheduleTemplate, 'id'> { id?:string }

export async function saveScheduleTemplate(input:ScheduleTemplateInput) {
  const organization_id = await organizationId()
  const row = {
    organization_id, name: input.name.trim(),
    // Версия формата: шаблоны переживут изменение схемы графика без миграции базы.
    pattern: { ...input.pattern, v: 1 },
    employee_ids: input.employeeIds,
    pickup_point_id: input.pickupPointId,
    starts_at: input.startsAt, ends_at: input.endsAt, pay_mode: input.payMode,
    updated_at: new Date().toISOString(),
  }
  const query = input.id
    ? client().from('shift_templates').update(row).eq('id', input.id)
    : client().from('shift_templates').insert(row)
  const { error } = await query
  if (error) throw error.code === '23505' ? new Error('График с таким названием уже есть — придумайте другое.') : error
}

export async function deleteScheduleTemplate(id:string) {
  const { error } = await client().from('shift_templates').delete().eq('id', id)
  if (error) throw error
}
