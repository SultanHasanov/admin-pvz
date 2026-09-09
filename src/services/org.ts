import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export function client():SupabaseClient {
  if (!supabase) throw new Error('Подключите Supabase в .env.local')
  return supabase
}

let cachedOrganizationId:string | null = null
export function resetOrganizationCache() { cachedOrganizationId = null }

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
