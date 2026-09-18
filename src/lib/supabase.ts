import { createClient } from '@supabase/supabase-js'
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const isSupabaseConfigured = Boolean(url && key)
export const supabase = isSupabaseConfigured ? createClient(url!, key!) : null

/**
 * Адрес приложения для ссылок в письмах и приглашениях. Берём из окружения, чтобы письмо,
 * отправленное из локальной разработки или превью, не вело на localhost.
 */
const publicUrl = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.replace(/\/+$/, '')
export const appUrl = (path:string) => `${publicUrl || location.origin}${path}`
