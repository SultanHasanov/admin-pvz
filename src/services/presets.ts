import type { EntryKind, EntryPreset, PaymentType, PointSalaryDefault } from '../entities/types'
import { client, organizationId } from './org'

interface PresetRow { id:string; pickup_point_id:string; kind:EntryKind; category_name:string; amount_kopecks:number; updated_at:string }
const toPreset = (row:PresetRow):EntryPreset => ({ id: row.id, pickupPointId: row.pickup_point_id, kind: row.kind, categoryName: row.category_name, amountKopecks: row.amount_kopecks, updatedAt: row.updated_at })

export async function listEntryPresets(pickupPointId?:string):Promise<EntryPreset[]> {
  const organization_id = await organizationId()
  let query = client().from('entry_presets').select('id,pickup_point_id,kind,category_name,amount_kopecks,updated_at').eq('organization_id', organization_id).order('category_name')
  if (pickupPointId) query = query.eq('pickup_point_id', pickupPointId)
  const { data, error } = await query
  if (error) throw error
  return (data as PresetRow[]).map(toPreset)
}

/** Запомнить сумму для пары «ПВЗ + категория». Существующий пресет перезаписывается. */
export async function rememberAmount(input:{ pickupPointId:string; kind:EntryKind; category:string; amountKopecks:number }) {
  const { error } = await client().rpc('upsert_entry_preset', { p_pickup_point_id: input.pickupPointId, p_kind: input.kind, p_category: input.category, p_amount: input.amountKopecks })
  if (error) throw error
}

export async function deleteEntryPreset(id:string) {
  const { error } = await client().from('entry_presets').delete().eq('id', id)
  if (error) throw error
}

interface RateRow { id:string; pickup_point_id:string; payment_type:PaymentType; rate_kopecks:number; monthly_norm_days:number }
const toRate = (row:RateRow):PointSalaryDefault => ({ id: row.id, pickupPointId: row.pickup_point_id, paymentType: row.payment_type, rateKopecks: row.rate_kopecks, monthlyNormDays: row.monthly_norm_days })

export async function listPointSalaryDefaults(pickupPointId?:string):Promise<PointSalaryDefault[]> {
  const organization_id = await organizationId()
  let query = client().from('point_salary_defaults').select('id,pickup_point_id,payment_type,rate_kopecks,monthly_norm_days').eq('organization_id', organization_id)
  if (pickupPointId) query = query.eq('pickup_point_id', pickupPointId)
  const { data, error } = await query
  if (error) throw error
  return (data as RateRow[]).map(toRate)
}

export async function rememberRate(input:{ pickupPointId:string; paymentType:PaymentType; rateKopecks:number; monthlyNormDays?:number }) {
  const { error } = await client().rpc('upsert_point_salary_default', { p_pickup_point_id: input.pickupPointId, p_payment_type: input.paymentType, p_rate: input.rateKopecks, p_norm_days: input.monthlyNormDays ?? 22 })
  if (error) throw error
}

export async function deletePointSalaryDefault(id:string) {
  const { error } = await client().from('point_salary_defaults').delete().eq('id', id)
  if (error) throw error
}
