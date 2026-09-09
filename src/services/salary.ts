import type { Bonus, Penalty, PenaltyStatus, SalaryPayment, SalarySheet } from '../entities/types'
import { monthEnd, monthStart } from '../shared/dates'
import { client, organizationId } from './org'

const range = (month:string) => ({ from: monthStart(month), to: monthEnd(month) })

export async function listBonuses(month:string):Promise<Bonus[]> {
  const organization_id = await organizationId()
  const { from, to } = range(month)
  const { data, error } = await client().from('bonuses').select('id,employee_id,date,amount_kopecks,comment').eq('organization_id', organization_id).gte('date', from).lt('date', to).order('date')
  if (error) throw error
  return (data as { id:string; employee_id:string; date:string; amount_kopecks:number; comment:string | null }[])
    .map(row => ({ id: row.id, employeeId: row.employee_id, date: row.date, amountKopecks: row.amount_kopecks, comment: row.comment }))
}

export async function createBonus(input:{ employeeId:string; date:string; amountKopecks:number; comment?:string }) {
  const organization_id = await organizationId()
  const { error } = await client().from('bonuses').insert({ organization_id, employee_id: input.employeeId, date: input.date, amount_kopecks: input.amountKopecks, comment: input.comment?.trim() || null })
  if (error) throw error
}

export async function deleteBonus(id:string) {
  const { error } = await client().from('bonuses').delete().eq('id', id)
  if (error) throw error
}

export async function listPenalties(month:string):Promise<Penalty[]> {
  const organization_id = await organizationId()
  const { from, to } = range(month)
  const { data, error } = await client().from('employee_penalties').select('id,employee_id,pickup_point_id,date,amount_kopecks,reason,comment,status').eq('organization_id', organization_id).gte('date', from).lt('date', to).order('date')
  if (error) throw error
  return (data as { id:string; employee_id:string; pickup_point_id:string | null; date:string; amount_kopecks:number; reason:string; comment:string | null; status:PenaltyStatus }[])
    .map(row => ({ id: row.id, employeeId: row.employee_id, pickupPointId: row.pickup_point_id, date: row.date, amountKopecks: row.amount_kopecks, reason: row.reason, comment: row.comment, status: row.status }))
}

export async function createPenalty(input:{ employeeId:string; pickupPointId?:string | null; date:string; amountKopecks:number; reason:string; comment?:string }) {
  const organization_id = await organizationId()
  const { error } = await client().from('employee_penalties').insert({ organization_id, employee_id: input.employeeId, pickup_point_id: input.pickupPointId ?? null, date: input.date, amount_kopecks: input.amountKopecks, reason: input.reason.trim(), comment: input.comment?.trim() || null })
  if (error) throw error
}

export async function setPenaltyStatus(id:string, status:PenaltyStatus) {
  const { error } = await client().from('employee_penalties').update({ status }).eq('id', id)
  if (error) throw error
}

export async function deletePenalty(id:string) {
  const { error } = await client().from('employee_penalties').delete().eq('id', id)
  if (error) throw error
}

export async function listSalaryPayments(month:string):Promise<SalaryPayment[]> {
  const organization_id = await organizationId()
  const { from, to } = range(month)
  const { data, error } = await client().from('salary_payments').select('id,employee_id,date,amount_kopecks,kind,comment').eq('organization_id', organization_id).gte('date', from).lt('date', to).order('date')
  if (error) throw error
  return (data as { id:string; employee_id:string; date:string; amount_kopecks:number; kind:SalaryPayment['kind']; comment:string | null }[])
    .map(row => ({ id: row.id, employeeId: row.employee_id, date: row.date, amountKopecks: row.amount_kopecks, kind: row.kind, comment: row.comment }))
}

export async function createSalaryPayment(input:{ employeeId:string; date:string; amountKopecks:number; kind:SalaryPayment['kind']; comment?:string }) {
  const organization_id = await organizationId()
  const { error } = await client().from('salary_payments').insert({ organization_id, employee_id: input.employeeId, date: input.date, amount_kopecks: input.amountKopecks, kind: input.kind, comment: input.comment?.trim() || null })
  if (error) throw error
}

export async function deleteSalaryPayment(id:string) {
  const { error } = await client().from('salary_payments').delete().eq('id', id)
  if (error) throw error
}

export async function getSalaryPeriod(month:string) {
  const organization_id = await organizationId()
  const { from } = range(month)
  const { data, error } = await client().from('salary_periods').select('id,starts_on,ends_on,status,closed_at').eq('organization_id', organization_id).eq('starts_on', from).maybeSingle()
  if (error) throw error
  return data as { id:string; starts_on:string; ends_on:string; status:'OPEN' | 'CLOSED'; closed_at:string | null } | null
}

/** Закрытие месяца: сохраняем снимок расчёта, чтобы позже он не «поплыл» из-за правок ставок. */
export async function closeSalaryPeriod(month:string, sheets:SalarySheet[]) {
  const db = client()
  const organization_id = await organizationId()
  const starts_on = monthStart(month)
  const ends_on = new Date(new Date(monthEnd(month)).getTime() - 86_400_000).toISOString().slice(0, 10)
  const period = await db.from('salary_periods').upsert({ organization_id, starts_on, ends_on, status: 'CLOSED', closed_at: new Date().toISOString() }, { onConflict: 'organization_id,starts_on,ends_on' }).select('id').single()
  if (period.error) throw period.error
  if (!sheets.length) return
  const { error } = await db.from('salary_accruals').upsert(sheets.map(sheet => ({
    organization_id, salary_period_id: period.data.id, employee_id: sheet.employeeId,
    amount_kopecks: sheet.balance, calculation: sheet as unknown as Record<string, number>,
  })), { onConflict: 'salary_period_id,employee_id' })
  if (error) throw error
}

export async function reopenSalaryPeriod(month:string) {
  const organization_id = await organizationId()
  const { error } = await client().from('salary_periods').update({ status: 'OPEN', closed_at: null }).eq('organization_id', organization_id).eq('starts_on', monthStart(month))
  if (error) throw error
}
