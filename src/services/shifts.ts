import dayjs from 'dayjs'
import type { PayMode, Shift, ShiftStatus } from '../entities/types'
import { generateSlots } from '../entities/schedule'
import { monthEnd, monthStart } from '../shared/dates'
import { client, organizationId } from './org'

interface ShiftRow { id:string; employee_id:string; pickup_point_id:string; planned_start:string; planned_end:string; actual_start:string | null; actual_end:string | null; pay_mode:PayMode | null; status:ShiftStatus }
const columns = 'id,employee_id,pickup_point_id,planned_start,planned_end,actual_start,actual_end,pay_mode,status'
const toShift = (row:ShiftRow):Shift => ({ id: row.id, employeeId: row.employee_id, pickupPointId: row.pickup_point_id, startsAt: row.planned_start, endsAt: row.planned_end, actualStartsAt: row.actual_start, actualEndsAt: row.actual_end, payMode: row.pay_mode ?? 'FULL', status: row.status })

/** Локальное время смены превращаем в ISO без сдвига пояса браузера. */
const at = (date:string, time:string) => dayjs(`${date}T${time}`).toISOString()

/** Отрезок дат включительно с обеих сторон: конструктору нужны недели, залезающие в соседние месяцы. */
export async function listShiftsRange(from:string, to:string, pickupPointId?:string):Promise<Shift[]> {
  const organization_id = await organizationId()
  let query = client().from('shifts').select(columns).eq('organization_id', organization_id)
    .gte('planned_start', at(from, '00:00'))
    .lt('planned_start', at(dayjs(to).add(1, 'day').format('YYYY-MM-DD'), '00:00'))
    .order('planned_start')
  if (pickupPointId) query = query.eq('pickup_point_id', pickupPointId)
  const { data, error } = await query
  if (error) throw error
  return (data as ShiftRow[]).map(toShift)
}

// monthEnd — первое число следующего месяца, поэтому последний день месяца это на сутки раньше.
export const listShifts = (month:string, pickupPointId?:string) =>
  listShiftsRange(monthStart(month), dayjs(monthEnd(month)).subtract(1, 'day').format('YYYY-MM-DD'), pickupPointId)

export async function listUpcomingShifts(limit = 5):Promise<Shift[]> {
  const organization_id = await organizationId()
  const { data, error } = await client().from('shifts').select(columns).eq('organization_id', organization_id)
    .gte('planned_start', new Date().toISOString()).in('status', ['PLANNED', 'ON_DUTY']).order('planned_start').limit(limit)
  if (error) throw error
  return (data as ShiftRow[]).map(toShift)
}

export interface ShiftInput { employeeId:string; pickupPointId:string; date:string; startsAt:string; endsAt:string; payMode?:PayMode }

function rowFrom(organization_id:string, input:ShiftInput) {
  const start = at(input.date, input.startsAt)
  // Смена, заканчивающаяся раньше начала, переходит на следующие сутки.
  const sameDayEnd = at(input.date, input.endsAt)
  const end = dayjs(sameDayEnd).isAfter(dayjs(start)) ? sameDayEnd : dayjs(sameDayEnd).add(1, 'day').toISOString()
  return { organization_id, employee_id: input.employeeId, pickup_point_id: input.pickupPointId, planned_start: start, planned_end: end, pay_mode: input.payMode ?? 'FULL' }
}

export async function createShift(input:ShiftInput) {
  const organization_id = await organizationId()
  const { error } = await client().from('shifts').insert(rowFrom(organization_id, input))
  if (error) throw error
}

/** Вставка пачкой: RLS разрешает владельцу multi-row insert, каждый чанк — одна транзакция. */
export async function createShiftsBulk(inputs:ShiftInput[], chunk = 200) {
  if (!inputs.length) return 0
  const organization_id = await organizationId()
  const rows = inputs.map(input => rowFrom(organization_id, input))
  for (let start = 0; start < rows.length; start += chunk) {
    const { error } = await client().from('shifts').insert(rows.slice(start, start + chunk))
    if (error) throw error
  }
  return rows.length
}

/** Серия смен: выбранные дни недели в диапазоне дат. Раскрытие дней — тем же генератором, что у конструктора. */
export async function createShiftSeries(input:Omit<ShiftInput, 'date'> & { from:string; to:string; weekdays:number[] }) {
  const slots = generateSlots({ kind: 'weekdays', byEmployee: { [input.employeeId]: input.weekdays } }, input.from, input.to)
  if (!slots.length) throw new Error('В выбранном диапазоне нет подходящих дней')
  return createShiftsBulk(slots.map(slot => ({ ...input, date: slot.date })))
}

/**
 * «Заменить» в конструкторе переписывает план существующей смены, а не удаляет её:
 * так не рвётся внешний ключ из удержаний WB и сохраняется история замен.
 */
export async function updateShiftPlan(id:string, input:ShiftInput) {
  const organization_id = await organizationId()
  const { organization_id: _org, employee_id: _employee, ...plan } = rowFrom(organization_id, input)
  const { error } = await client().from('shifts').update({ ...plan, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

/** 23503 — нарушение внешнего ключа: на смену ссылается удержание WB. */
export const isForeignKeyViolation = (error:unknown) =>
  typeof error === 'object' && error !== null && (error as { code?:string }).code === '23503'

/** Возвращает 'linked' вместо исключения, чтобы вызывающий показал человеческое объяснение. */
export async function deleteShiftSafe(id:string):Promise<'ok' | 'linked'> {
  const { error } = await client().from('shifts').delete().eq('id', id)
  if (!error) return 'ok'
  if (isForeignKeyViolation(error)) return 'linked'
  throw error
}

/**
 * Перенос смены в конструкторе: меняем дату и сотрудника, сохраняя время начала и длительность.
 * Длительность считаем по факту, чтобы ночная смена не «схлопнулась» при переносе.
 */
export async function moveShift(shift:Shift, employeeId:string, date:string) {
  const start = dayjs(shift.startsAt)
  const minutes = dayjs(shift.endsAt).diff(start, 'minute')
  const nextStart = dayjs(date).hour(start.hour()).minute(start.minute()).second(0).millisecond(0)
  const { error } = await client().from('shifts').update({
    employee_id: employeeId,
    planned_start: nextStart.toISOString(),
    planned_end: nextStart.add(minutes, 'minute').toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', shift.id)
  if (error) throw error
}

export async function setShiftStatus(id:string, status:ShiftStatus) {
  const now = new Date().toISOString()
  const patch:Record<string, unknown> = { status, updated_at: now }
  if (status === 'ON_DUTY') patch.actual_start = now
  if (status === 'COMPLETED') patch.actual_end = now
  const { error } = await client().from('shifts').update(patch).eq('id', id)
  if (error) throw error
}

/** Режим оплаты меняют и после смены: «ушёл раньше» выясняется по факту. */
export async function setShiftPayMode(id:string, payMode:PayMode) {
  const { error } = await client().from('shifts').update({ pay_mode: payMode, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function updateShiftTimes(id:string, actualStart:string | null, actualEnd:string | null) {
  const { error } = await client().from('shifts').update({ actual_start: actualStart, actual_end: actualEnd, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function replaceShift(shiftId:string, employeeId:string, reason:string) {
  const { error } = await client().rpc('replace_shift', { p_shift_id: shiftId, p_employee_id: employeeId, p_reason: reason })
  if (error) throw error
}

export async function deleteShift(id:string) {
  const { error } = await client().from('shifts').delete().eq('id', id)
  if (error) throw error
}
