import { rateForDate } from '../entities/calculations'
import type { Employee, PaymentType, SalaryRule } from '../entities/types'
import { today } from '../shared/dates'
import { client, organizationId } from './org'

interface RuleRow { id:string; employee_id:string; payment_type:PaymentType; rate_kopecks:number; effective_from:string; monthly_norm_days:number | null }
interface EmployeeRow {
  id:string; full_name:string; phone:string | null; telegram_username:string | null; payment_type:PaymentType; status:'ACTIVE' | 'ARCHIVED'
  employee_pickup_points:{ pickup_point_id:string }[] | null
  salary_rules:RuleRow[] | null
}
const columns = 'id,full_name,phone,telegram_username,payment_type,status,employee_pickup_points(pickup_point_id),salary_rules(id,employee_id,payment_type,rate_kopecks,effective_from,monthly_norm_days)'

export const toRule = (row:RuleRow):SalaryRule => ({ id: row.id, employeeId: row.employee_id, paymentType: row.payment_type, rateKopecks: row.rate_kopecks, effectiveFrom: row.effective_from, monthlyNormDays: row.monthly_norm_days })

function toEmployee(row:EmployeeRow):Employee {
  const rules = (row.salary_rules ?? []).map(toRule)
  const current = rateForDate(rules, today())
  return {
    id: row.id, fullName: row.full_name, phone: row.phone, telegramUsername: row.telegram_username,
    pickupPointIds: (row.employee_pickup_points ?? []).map(x => x.pickup_point_id),
    paymentType: current?.paymentType ?? row.payment_type,
    rateKopecks: current?.rateKopecks ?? 0,
    monthlyNormDays: current?.monthlyNormDays ?? 22,
    status: row.status,
  }
}

export async function listEmployees(includeArchived = false):Promise<Employee[]> {
  const organization_id = await organizationId()
  let query = client().from('employees').select(columns).eq('organization_id', organization_id).order('full_name')
  if (!includeArchived) query = query.eq('status', 'ACTIVE')
  const { data, error } = await query
  if (error) throw error
  return (data as unknown as EmployeeRow[]).map(toEmployee)
}

export async function listSalaryRules():Promise<SalaryRule[]> {
  const organization_id = await organizationId()
  const { data, error } = await client().from('salary_rules').select('id,employee_id,payment_type,rate_kopecks,effective_from,monthly_norm_days').eq('organization_id', organization_id).order('effective_from')
  if (error) throw error
  return (data as RuleRow[]).map(toRule)
}

export interface EmployeeInput {
  fullName:string; phone?:string; telegramUsername?:string
  paymentType:PaymentType; rateKopecks:number; monthlyNormDays:number; pickupPointIds:string[]
}

export async function createEmployee(input:EmployeeInput) {
  const db = client()
  const organization_id = await organizationId()
  const { data, error } = await db.from('employees').insert({
    organization_id, full_name: input.fullName.trim(), phone: input.phone?.trim() || null,
    telegram_username: input.telegramUsername?.trim() || null, payment_type: input.paymentType,
  }).select('id').single()
  if (error) throw error
  const employeeId = data.id as string
  await saveRate(employeeId, input)
  await setEmployeePoints(employeeId, input.pickupPointIds)
  return employeeId
}

export async function updateEmployee(id:string, input:EmployeeInput) {
  const db = client()
  const { error } = await db.from('employees').update({
    full_name: input.fullName.trim(), phone: input.phone?.trim() || null,
    telegram_username: input.telegramUsername?.trim() || null, payment_type: input.paymentType,
    updated_at: new Date().toISOString(),
  }).eq('id', id)
  if (error) throw error
  await setEmployeePoints(id, input.pickupPointIds)
}

/** Новая ставка пишется отдельной строкой salary_rules — прежние значения остаются историей. */
export async function saveRate(employeeId:string, input:{ paymentType:PaymentType; rateKopecks:number; monthlyNormDays:number }, effectiveFrom = today()) {
  const organization_id = await organizationId()
  const { error } = await client().from('salary_rules').upsert({
    organization_id, employee_id: employeeId, payment_type: input.paymentType,
    rate_kopecks: input.rateKopecks, effective_from: effectiveFrom, monthly_norm_days: input.monthlyNormDays,
  }, { onConflict: 'employee_id,effective_from' })
  if (error) throw error
}

async function setEmployeePoints(employeeId:string, pickupPointIds:string[]) {
  const db = client()
  const { error: cleared } = await db.from('employee_pickup_points').delete().eq('employee_id', employeeId)
  if (cleared) throw cleared
  if (!pickupPointIds.length) return
  const { error } = await db.from('employee_pickup_points').insert(pickupPointIds.map(pickup_point_id => ({ employee_id: employeeId, pickup_point_id })))
  if (error) throw error
}

export async function setEmployeeStatus(id:string, status:'ACTIVE' | 'ARCHIVED') {
  const { error } = await client().from('employees').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}
