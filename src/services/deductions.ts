import dayjs from 'dayjs'
import type { Deduction, DeductionEvent, DeductionStatus } from '../entities/types'
import { monthEnd, monthStart } from '../shared/dates'
import { client, organizationId } from './org'

/** Границы месяца в часовом поясе владельца, а не в UTC. */
const bound = (date:string) => dayjs(`${date}T00:00`).toISOString()

interface DeductionRow { id:string; pickup_point_id:string | null; employee_id:string | null; shift_id:string | null; event_at:string | null; amount_kopecks:number; reason:string; status:DeductionStatus; comment:string | null; created_at:string }
const columns = 'id,pickup_point_id,employee_id,shift_id,event_at,amount_kopecks,reason,status,comment,created_at'
const toDeduction = (row:DeductionRow):Deduction => ({ id: row.id, pickupPointId: row.pickup_point_id, employeeId: row.employee_id, shiftId: row.shift_id, eventAt: row.event_at, amountKopecks: row.amount_kopecks, reason: row.reason, status: row.status, comment: row.comment, createdAt: row.created_at })

export async function listDeductions(month:string, pickupPointId?:string):Promise<Deduction[]> {
  const organization_id = await organizationId()
  let query = client().from('wb_deductions').select(columns).eq('organization_id', organization_id)
    .gte('event_at', bound(monthStart(month))).lt('event_at', bound(monthEnd(month))).order('event_at', { ascending: false })
  if (pickupPointId) query = query.eq('pickup_point_id', pickupPointId)
  const { data, error } = await query
  if (error) throw error
  return (data as DeductionRow[]).map(toDeduction)
}

export async function listNewDeductions(limit = 5):Promise<Deduction[]> {
  const organization_id = await organizationId()
  const { data, error } = await client().from('wb_deductions').select(columns).eq('organization_id', organization_id)
    .in('status', ['NEW', 'INVESTIGATING', 'DISPUTED', 'PENDING']).order('created_at', { ascending: false }).limit(limit)
  if (error) throw error
  return (data as DeductionRow[]).map(toDeduction)
}

export interface DeductionInput { pickupPointId?:string | null; employeeId?:string | null; shiftId?:string | null; eventAt:string; amountKopecks:number; reason:string; comment?:string }

export async function createDeduction(input:DeductionInput) {
  const db = client()
  const organization_id = await organizationId()
  const { data, error } = await db.from('wb_deductions').insert({
    organization_id, pickup_point_id: input.pickupPointId ?? null, employee_id: input.employeeId ?? null,
    shift_id: input.shiftId ?? null, event_at: input.eventAt, amount_kopecks: input.amountKopecks,
    reason: input.reason.trim(), comment: input.comment?.trim() || null, status: 'NEW',
  }).select('id').single()
  if (error) throw error
  await logDeductionEvent(data.id as string, 'CREATED', input.reason.trim())
  return data.id as string
}

export async function updateDeduction(id:string, input:DeductionInput) {
  const { error } = await client().from('wb_deductions').update({
    pickup_point_id: input.pickupPointId ?? null, employee_id: input.employeeId ?? null, shift_id: input.shiftId ?? null,
    event_at: input.eventAt, amount_kopecks: input.amountKopecks, reason: input.reason.trim(),
    comment: input.comment?.trim() || null, updated_at: new Date().toISOString(),
  }).eq('id', id)
  if (error) throw error
}

export async function setDeductionStatus(id:string, status:DeductionStatus, note?:string) {
  const { error } = await client().from('wb_deductions').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
  await logDeductionEvent(id, status, note)
}

export async function logDeductionEvent(deductionId:string, eventType:string, note?:string) {
  const db = client()
  const organization_id = await organizationId()
  const { data: userResult } = await db.auth.getUser()
  const { error } = await db.from('wb_deduction_events').insert({ organization_id, deduction_id: deductionId, event_type: eventType, note: note?.trim() || null, actor_id: userResult.user?.id ?? null })
  if (error) throw error
}

export async function listDeductionEvents(deductionId:string):Promise<DeductionEvent[]> {
  const { data, error } = await client().from('wb_deduction_events').select('id,deduction_id,event_type,note,created_at').eq('deduction_id', deductionId).order('created_at')
  if (error) throw error
  return (data as { id:string; deduction_id:string; event_type:string; note:string | null; created_at:string }[])
    .map(row => ({ id: row.id, deductionId: row.deduction_id, eventType: row.event_type, note: row.note, createdAt: row.created_at }))
}

export async function deleteDeduction(id:string) {
  const { error } = await client().from('wb_deductions').delete().eq('id', id)
  if (error) throw error
}
