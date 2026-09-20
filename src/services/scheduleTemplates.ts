import type { PayMode } from '../entities/types'
import type { SchedulePattern } from '../entities/schedule'
import type { SlotPlan } from '../entities/slots'
import { client, organizationId } from './org'

/**
 * Формат шаблона в базе.
 *
 * v1 — одно правило на точку, так работал прежний конструктор. v2 — правило на каждое
 * место на смене. Старые шаблоны читаются как v2 с единственным местом, поэтому
 * миграция данных не нужна: формат версионирован внутри jsonb.
 */
export type SlotsPattern = { v:2; kind:'slots'; slots:{ slotIndex:number; pattern:SchedulePattern }[] }
export type TemplatePattern = (SchedulePattern & { v?:1 }) | SlotsPattern

/** Правила по местам из шаблона любой версии. */
export const slotPlansOf = (pattern:TemplatePattern):SlotPlan[] =>
  pattern.kind === 'slots' ? pattern.slots : [{ slotIndex: 0, pattern }]

/**
 * Правило без мест — для старого конструктора, который про места не знает.
 * У шаблона v2 берём первое место: остальные он всё равно не покажет.
 */
export const flatPatternOf = (pattern:TemplatePattern):SchedulePattern =>
  pattern.kind === 'slots'
    ? pattern.slots[0]?.pattern ?? { kind: 'cycle', on: 2, off: 2, anchor: new Date().toISOString().slice(0, 10), participants: [] }
    : pattern

export interface ScheduleTemplate {
  id:string
  name:string
  pattern:TemplatePattern
  employeeIds:string[]
  pickupPointId:string | null
  startsAt:string
  endsAt:string
  payMode:PayMode
}

interface TemplateRow {
  id:string; name:string; pattern:TemplatePattern
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

function prunePattern<T extends TemplatePattern>(pattern:T, alive:Set<string>):T {
  if (pattern.kind === 'slots') {
    return { ...pattern, slots: pattern.slots.map(slot => ({ ...slot, pattern: prunePattern(slot.pattern, alive) })) }
  }
  if (pattern.kind === 'cycle') return { ...pattern, participants: pattern.participants.filter(p => alive.has(p.employeeId)) }
  if (pattern.kind === 'alternatingBlocks') return {
    ...pattern,
    firstId: alive.has(pattern.firstId) ? pattern.firstId : '',
    secondId: alive.has(pattern.secondId) ? pattern.secondId : '',
  }
  const byEmployee = Object.fromEntries(Object.entries(pattern.byEmployee).filter(([id]) => alive.has(id)))
  return { ...pattern, byEmployee }
}

export interface ScheduleTemplateInput extends Omit<ScheduleTemplate, 'id'> { id?:string }

export async function saveScheduleTemplate(input:ScheduleTemplateInput) {
  const organization_id = await organizationId()
  const row = {
    organization_id, name: input.name.trim(),
    // Версия формата: шаблоны переживут изменение схемы графика без миграции базы.
    pattern: { ...input.pattern, v: input.pattern.kind === 'slots' ? 2 : 1 },
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
