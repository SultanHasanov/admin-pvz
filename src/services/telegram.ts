import { client, organizationId } from './org'

/**
 * Чат, в который добавили бота.
 *
 * `approvedAt` пустой — бот в группе, но молчит: Telegram сообщает о добавлении сам,
 * и без подтверждения владельцем любой чужой чат начал бы получать график точки.
 */
export interface TelegramGroupChat { id:string; telegramChatId:number; title:string | null; approvedAt:string | null }

interface GroupRow { id:string; telegram_chat_id:number; title:string | null; approved_at:string | null }

export async function listTelegramGroups(integrationId:string):Promise<TelegramGroupChat[]> {
  const { data, error } = await client().from('telegram_chats')
    .select('id,telegram_chat_id,title,approved_at')
    .eq('integration_id', integrationId).eq('chat_kind', 'GROUP').eq('active', true)
    .order('approved_at', { nullsFirst: false })
  if (error) throw error
  return (data as GroupRow[]).map(row => ({
    id: row.id, telegramChatId: row.telegram_chat_id, title: row.title, approvedAt: row.approved_at,
  }))
}

/** Подтвердить группу: с этой минуты туда уходят напоминания. */
export async function approveTelegramGroup(chatId:string) {
  const now = new Date().toISOString()
  const { error } = await client().from('telegram_chats')
    .update({ approved_at: now, updated_at: now }).eq('id', chatId)
  if (error) throw error
}

/**
 * Отключить группу. Бот остаётся в чате, но замолкает и снова становится кандидатом —
 * вычёркивать чат целиком нельзя: тогда вернуть его можно было бы только переустановкой бота.
 */
export async function unlinkTelegramGroup(chatId:string) {
  const { error } = await client().from('telegram_chats')
    .update({ approved_at: null, updated_at: new Date().toISOString() }).eq('id', chatId)
  if (error) throw error
}

/** Что и когда бот пишет в группу. Время — местное для точки. */
export interface TelegramBotSettings {
  integration_id:string
  duty_today_enabled:boolean
  duty_today_time:string
  duty_tomorrow_enabled:boolean
  duty_tomorrow_time:string
  gaps_enabled:boolean
  gaps_time:string
  gaps_horizon_days:number
  gaps_quiet_when_full:boolean
  week_enabled:boolean
  week_time:string
  week_weekday:number
  money_enabled:boolean
  money_time:string
}

const SETTINGS_COLUMNS = 'integration_id,duty_today_enabled,duty_today_time,duty_tomorrow_enabled,duty_tomorrow_time,'
  + 'gaps_enabled,gaps_time,gaps_horizon_days,gaps_quiet_when_full,week_enabled,week_time,week_weekday,money_enabled,money_time'

export async function getTelegramBotSettings(integrationId:string):Promise<TelegramBotSettings | null> {
  const { data, error } = await client().from('telegram_bot_settings')
    .select(SETTINGS_COLUMNS).eq('integration_id', integrationId).maybeSingle()
  if (error) throw error
  return (data as TelegramBotSettings | null) ?? null
}

/**
 * Пишем настройки целиком: их полтора десятка, они меняются одной формой,
 * и частичное обновление только развело бы экран и базу.
 */
export async function saveTelegramBotSettings(integrationId:string, pickupPointId:string, settings:Omit<TelegramBotSettings, 'integration_id'>) {
  const organization_id = await organizationId()
  const { error } = await client().from('telegram_bot_settings').upsert({
    integration_id: integrationId, organization_id, pickup_point_id: pickupPointId,
    ...settings, updated_at: new Date().toISOString(),
  }, { onConflict: 'integration_id' })
  if (error) throw error
}

export type ReminderKind = 'duty_today' | 'duty_tomorrow' | 'gaps' | 'week' | 'money'

/** Пробная отправка: тот же текст, что придёт по расписанию, но прямо сейчас. */
export async function sendTelegramPreview(pickupPointId:string, kind:ReminderKind) {
  const db = client()
  const activeOrganizationId = await organizationId()
  const { data: sessionResult } = await db.auth.getSession()
  const accessToken = sessionResult.session?.access_token
  if (!accessToken) throw new Error('Войдите в аккаунт')
  const response = await fetch('/api/telegram/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ organizationId: activeOrganizationId, pickupPointId, kind }),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error || 'Не удалось отправить')
  return data as { ok:true; sent:number }
}

export interface TelegramIntegrationInfo {
  id:string
  status:'NOT_CONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR'
  bot_username:string | null
  last_error:string | null
  pickup_point_id:string | null
}

export async function listTelegramIntegrations():Promise<TelegramIntegrationInfo[]> {
  const organization_id = await organizationId()
  const { data, error } = await client().from('telegram_integrations').select('id,status,bot_username,last_error,pickup_point_id').eq('organization_id', organization_id)
  if (error) throw error
  return data as TelegramIntegrationInfo[]
}

async function integrationRequest(method:'POST' | 'DELETE', pickupPointId:string, botToken?:string) {
  const db = client()
  const activeOrganizationId = await organizationId()
  const { data: sessionResult } = await db.auth.getSession()
  const accessToken = sessionResult.session?.access_token
  if (!accessToken) throw new Error('Войдите в аккаунт')
  const response = await fetch('/api/telegram/integration', {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ organizationId: activeOrganizationId, pickupPointId, ...(botToken ? { botToken } : {}) }),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error || 'Не удалось изменить подключение')
  return data
}

export const connectTelegramBot = (pickupPointId:string, botToken:string) => integrationRequest('POST', pickupPointId, botToken)
export const disconnectTelegramBot = (pickupPointId:string) => integrationRequest('DELETE', pickupPointId)
