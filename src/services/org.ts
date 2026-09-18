import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export function client():SupabaseClient {
  if (!supabase) throw new Error('Подключите Supabase в .env.local')
  return supabase
}

let cachedOrganizationId:string | null = null
let cachedEmployeeId:string | null | undefined
export function resetOrganizationCache() { cachedOrganizationId = null; cachedEmployeeId = undefined }

export async function organizationId():Promise<string> {
  if (cachedOrganizationId) return cachedOrganizationId
  const db = client()
  const { data: userResult, error: userError } = await db.auth.getUser()
  if (userError || !userResult.user) throw new Error('Войдите в аккаунт')
  const { data, error } = await db.from('organization_members').select('organization_id').eq('user_id', userResult.user.id).limit(1).single()
  if (error || !data) throw new Error('Сначала завершите onboarding и создайте организацию')
  cachedOrganizationId = data.organization_id as string
  return cachedOrganizationId
}

/**
 * Сотрудник, которым я вхожу в смены. У владельца, который сам не работает на точке,
 * `employee_id` в участниках пустой — это не ошибка, а нормальное состояние,
 * поэтому возвращаем `null`, а не бросаем.
 */
export async function currentEmployeeId():Promise<string | null> {
  if (cachedEmployeeId !== undefined) return cachedEmployeeId
  const db = client()
  const { data: userResult, error: userError } = await db.auth.getUser()
  if (userError || !userResult.user) throw new Error('Войдите в аккаунт')
  const { data, error } = await db.from('organization_members').select('employee_id').eq('user_id', userResult.user.id).limit(1).single()
  if (error) throw error
  cachedEmployeeId = (data?.employee_id as string | null) ?? null
  return cachedEmployeeId
}

export type MemberRole = 'OWNER' | 'MANAGER' | 'EMPLOYEE'

/**
 * Роль в организации — по ней приложение решает, какую оболочку открыть: сотрудник
 * попадает в свой кабинет, а не на экраны с чужими зарплатами (которые RLS ему всё
 * равно покажет пустыми). `null` — пользователь ещё ни в одной организации.
 */
export async function currentRole():Promise<MemberRole | null> {
  const db = client()
  const { data: userResult, error: userError } = await db.auth.getUser()
  if (userError || !userResult.user) throw new Error('Войдите в аккаунт')
  const { data, error } = await db.from('organization_members').select('role').eq('user_id', userResult.user.id).limit(1)
  if (error) throw error
  return (data?.[0]?.role as MemberRole | undefined) ?? null
}

export async function getOrganization() {
  const id = await organizationId()
  const { data, error } = await client().from('organizations').select('id,name,currency').eq('id', id).single()
  if (error) throw error
  return data as { id:string; name:string; currency:string }
}

export async function renameOrganization(name:string) {
  const id = await organizationId()
  const { error } = await client().from('organizations').update({ name: name.trim(), updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function requestEarlyAccess(feature = 'valuable_items') {
  const db = client()
  const organization_id = await organizationId()
  const { data: userResult } = await db.auth.getUser()
  if (!userResult.user) throw new Error('Войдите в аккаунт')
  const { error } = await db.from('early_access_requests').upsert({ organization_id, user_id: userResult.user.id, feature }, { onConflict: 'organization_id,user_id,feature' })
  if (error) throw error
}
