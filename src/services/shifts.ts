import dayjs from 'dayjs'
import type { Shift, ShiftStatus } from '../entities/types'
import { monthEnd, monthStart } from '../shared/dates'
import { client, organizationId } from './org'

interface ShiftRow { id:string; employee_id:string; pickup_point_id:string; planned_start:string; planned_end:string; actual_start:string | null; actual_end:string | null; status:ShiftStatus }
const columns = 'id,employee_id,pickup_point_id,planned_start,planned_end,actual_start,actual_end,status'
const toShift = (row:ShiftRow):Shift => ({ id: row.id, employeeId: row.employee_id, pickupPointId: row.pickup_point_id, startsAt: row.planned_start, endsAt: row.planned_end, actualStartsAt: row.actual_start, actualEndsAt: row.actual_end, status: row.status })

/** Локальное время смены превращаем в ISO без сдвига пояса браузера. */
const at = (date:string, time:string) => dayjs(`${date}T${time}`).toISOString()

export async function listShifts(month:string, pickupPointId?:string):Promise<Shift[]> {
  const organization_id = await organizationId()
  let query = client().from('shifts').select(columns).eq('organization_id', organization_id)
    .gte('planned_start', at(monthStart(month), '00:00')).lt('planned_start', at(monthEnd(month), '00:00')).order('planned_start')
  if (pickupPointId) query = query.eq('pickup_point_id', pickupPointId)
  const { data, error } = await query
  if (error) throw error
  return (data as ShiftRow[]).map(toShift)
}

export async function listUpcomingShifts(limit = 5):Promise<Shift[]> {
  const organization_id = await organizationId()
  const { data, error } = await client().from('shifts').select(columns).eq('organization_id', organization_id)
    .gte('planned_start', new Date().toISOString()).in('status', ['PLANNED', 'ON_DUTY']).order('planned_start').limit(limit)
  if (error) throw error
  return (data as ShiftRow[]).map(toShift)
}

export interface ShiftInput { employeeId:string; pickupPointId:string; date:string; startsAt:string; endsAt:string }

function rowFrom(organization_id:string, input:ShiftInput) {
  const start = at(input.date, input.startsAt)
  // Смена, заканчивающаяся раньше начала, переходит на следующие сутки.
  const sameDayEnd = at(input.date, input.endsAt)
  const end = dayjs(sameDayEnd).isAfter(dayjs(start)) ? sameDayEnd : dayjs(sameDayEnd).add(1, 'day').toISOString()
  return { organization_id, employee_id: input.employeeId, pickup_point_id: input.pickupPointId, planned_start: start, planned_end: end }
}

export async function createShift(input:ShiftInput) {
  const organization_id = await organizationId()
  const { error } = await client().from('shifts').insert(rowFrom(organization_id, input))
  if (error) throw error
}

/** Серия смен: выбранные дни недели в диапазоне дат. */
export async function createShiftSeries(input:Omit<ShiftInput, 'date'> & { from:string; to:string; weekdays:number[] }) {
  const organization_id = await organizationId()
  const rows = []
  for (let cursor = dayjs(input.from); !cursor.isAfter(dayjs(input.to), 'day'); cursor = cursor.add(1, 'day')) {
    if (!input.weekdays.includes(cursor.day())) continue
    rows.push(rowFrom(organization_id, { ...input, date: cursor.format('YYYY-MM-DD') }))
  }
  if (!rows.length) throw new Error('В выбранном диапазоне нет подходящих дней')
  const { error } = await client().from('shifts').insert(rows)
  if (error) throw error
  return rows.length
}

export async function setShiftStatus(id:string, status:ShiftStatus) {
  const now = new Date().toISOString()
  const patch:Record<string, unknown> = { status, updated_at: now }
  if (status === 'ON_DUTY') patch.actual_start = now
  if (status === 'COMPLETED') patch.actual_end = now
  const { error } = await client().from('shifts').update(patch).eq('id', id)
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
