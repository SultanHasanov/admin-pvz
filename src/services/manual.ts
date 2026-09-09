import { supabase } from '../lib/supabase'

export async function organizationId() {
  if (!supabase) throw new Error('Подключите Supabase в .env.local')
  const { data: userResult, error: userError } = await supabase.auth.getUser()
  if (userError || !userResult.user) throw new Error('Войдите в аккаунт')
  const { data, error } = await supabase.from('organization_members').select('organization_id').eq('user_id', userResult.user.id).limit(1).single()
  if (error || !data) throw new Error('Сначала завершите onboarding и создайте организацию')
  return data.organization_id as string
}

export async function createPickupPoint(input: { name: string; address: string; timezone: string }) {
  const organization_id = await organizationId()
  const { data, error } = await supabase!.from('pickup_points').insert({ ...input, organization_id }).select().single()
  if (error) throw error
  return data
}

export async function createEmployee(input: { fullName: string; paymentType: 'SHIFT' | 'HOURLY' | 'SALARY'; rateKopecks: number; pickupPointId?: string }) {
  const organization_id = await organizationId()
  const { data, error } = await supabase!.from('employees').insert({ organization_id, full_name: input.fullName, payment_type: input.paymentType }).select().single()
  if (error) throw error
  const rule = await supabase!.from('salary_rules').insert({ organization_id, employee_id: data.id, payment_type: input.paymentType, rate_kopecks: input.rateKopecks, effective_from: new Date().toISOString().slice(0, 10), monthly_norm_days: 22 })
  if (rule.error) throw rule.error
  if (input.pickupPointId) await supabase!.from('employee_pickup_points').insert({ employee_id: data.id, pickup_point_id: input.pickupPointId })
  return data
}

export async function createExpense(input: { amountKopecks: number; category: string; pickupPointId?: string }) {
  const organization_id = await organizationId()
  const existing = await supabase!.from('expense_categories').select('id').eq('organization_id', organization_id).eq('name', input.category).limit(1)
  let category_id = existing.data?.[0]?.id
  if (!category_id) {
    const created = await supabase!.from('expense_categories').insert({ organization_id, name: input.category }).select('id').single()
    if (created.error) throw created.error
    category_id = created.data.id
  }
  const { data, error } = await supabase!.from('expense_entries').insert({ organization_id, category_id, pickup_point_id: input.pickupPointId ?? null, date: new Date().toISOString().slice(0, 10), amount_kopecks: input.amountKopecks }).select().single()
  if (error) throw error
  return data
}

export async function createTelegramPairingCode() {
  const org = await organizationId()
  const { data, error } = await supabase!.rpc('create_telegram_pairing_code', { p_organization_id: org })
  if (error) throw error
  return data as string
}

export interface TelegramIntegrationInfo {
  id: string
  status: 'NOT_CONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR'
  bot_username: string | null
  last_error: string | null
}

export async function getTelegramIntegration(): Promise<TelegramIntegrationInfo | null> {
  const organization_id = await organizationId()
  const { data, error } = await supabase!.from('telegram_integrations').select('id,status,bot_username,last_error').eq('organization_id', organization_id).maybeSingle()
  if (error) throw error
  return data as TelegramIntegrationInfo | null
}

async function integrationRequest(method: 'POST' | 'DELETE', botToken?: string) {
  if (!supabase) throw new Error('Подключите Supabase')
  const activeOrganizationId = await organizationId()
  const { data: sessionResult } = await supabase.auth.getSession()
  const accessToken = sessionResult.session?.access_token
  if (!accessToken) throw new Error('Войдите в аккаунт')
  const response = await fetch('/api/telegram/integration', {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ organizationId: activeOrganizationId, ...(botToken ? { botToken } : {}) }),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error || 'Не удалось изменить подключение')
  return data
}

export const connectTelegramBot = (botToken: string) => integrationRequest('POST', botToken)
export const disconnectTelegramBot = () => integrationRequest('DELETE')
