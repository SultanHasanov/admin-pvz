import type { PaymentType, SalaryRate } from '../entities/types'
import { client, organizationId } from './org'

interface RateRow { id:string; name:string | null; payment_type:PaymentType; rate_kopecks:number; monthly_norm_days:number; is_default:boolean | null; archived_at:string | null }
const toRate = (row:RateRow):SalaryRate => ({ id: row.id, name: row.name, paymentType: row.payment_type, rateKopecks: row.rate_kopecks, monthlyNormDays: row.monthly_norm_days, isDefault: Boolean(row.is_default), archivedAt: row.archived_at })
const columns = 'id,name,payment_type,rate_kopecks,monthly_norm_days,is_default,archived_at'

export interface SalaryRateInput { name?:string | null; paymentType:PaymentType; rateKopecks:number; monthlyNormDays?:number }
/** Пустая пометка хранится как null: ставку тогда называют тип и сумма. */
const label = (name?:string | null) => name?.trim() || null

/** Одинаковые ставки различить нечем, поэтому объясняем отказ базы по-человечески. */
function readable(error:{ code?:string; message:string }) {
  if (error.code !== '23505') return error
  return new Error(error.message.includes('salary_rates_amount_idx')
    ? 'Такая ставка уже есть в справочнике — выберите её вместо новой.'
    : 'Ставка с такой пометкой уже есть — придумайте другую.')
}

export async function listSalaryRates(includeArchived = false):Promise<SalaryRate[]> {
  const organization_id = await organizationId()
  let query = client().from('salary_rates').select(columns).eq('organization_id', organization_id).order('payment_type').order('rate_kopecks')
  if (!includeArchived) query = query.is('archived_at', null)
  const { data, error } = await query
  if (error) throw error
  return (data as RateRow[]).map(toRate)
}

export async function createSalaryRate(input:SalaryRateInput):Promise<string> {
  const organization_id = await organizationId()
  const { data, error } = await client().from('salary_rates').insert({
    organization_id, name: label(input.name), payment_type: input.paymentType,
    rate_kopecks: input.rateKopecks, monthly_norm_days: input.monthlyNormDays ?? 22,
  }).select('id').single()
  if (error) throw readable(error)
  return data.id as string
}

export async function updateSalaryRate(id:string, input:SalaryRateInput) {
  const { error } = await client().from('salary_rates').update({
    name: label(input.name), payment_type: input.paymentType,
    rate_kopecks: input.rateKopecks, monthly_norm_days: input.monthlyNormDays ?? 22,
    updated_at: new Date().toISOString(),
  }).eq('id', id)
  if (error) throw readable(error)
}

/** Ставку не удаляем, а прячем: она остаётся в истории начислений прошлых месяцев. */
export async function setSalaryRateArchived(id:string, archived:boolean) {
  const patch:Record<string, unknown> = { archived_at: archived ? new Date().toISOString() : null, updated_at: new Date().toISOString() }
  // Скрытую ставку нельзя оставлять подстановкой по умолчанию — её больше нет в выборе.
  if (archived) patch.is_default = false
  const { error } = await client().from('salary_rates').update(patch).eq('id', id)
  if (error) throw error
}

/** Ставка по умолчанию одна на организацию: снимаем прежнюю, потом ставим новую. */
export async function setDefaultSalaryRate(id:string, isDefault:boolean) {
  const db = client()
  const organization_id = await organizationId()
  const now = new Date().toISOString()
  if (!isDefault) {
    const { error } = await db.from('salary_rates').update({ is_default: false, updated_at: now }).eq('id', id)
    if (error) throw error
    return
  }
  const cleared = await db.from('salary_rates').update({ is_default: false, updated_at: now }).eq('organization_id', organization_id).eq('is_default', true)
  if (cleared.error) throw cleared.error
  const { error } = await db.from('salary_rates').update({ is_default: true, updated_at: now }).eq('id', id)
  if (error) throw error
}
