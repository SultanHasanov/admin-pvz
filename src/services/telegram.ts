import { client, organizationId } from './org'

export async function createTelegramPairingCode() {
  const org = await organizationId()
  const { data, error } = await client().rpc('create_telegram_pairing_code', { p_organization_id: org })
  if (error) throw error
  return data as string
}

export interface TelegramIntegrationInfo {
  id:string
  status:'NOT_CONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR'
  bot_username:string | null
  last_error:string | null
}

export async function getTelegramIntegration():Promise<TelegramIntegrationInfo | null> {
  const organization_id = await organizationId()
  const { data, error } = await client().from('telegram_integrations').select('id,status,bot_username,last_error').eq('organization_id', organization_id).maybeSingle()
  if (error) throw error
  return data as TelegramIntegrationInfo | null
}

async function integrationRequest(method:'POST' | 'DELETE', botToken?:string) {
  const db = client()
  const activeOrganizationId = await organizationId()
  const { data: sessionResult } = await db.auth.getSession()
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

export const connectTelegramBot = (botToken:string) => integrationRequest('POST', botToken)
export const disconnectTelegramBot = () => integrationRequest('DELETE')
