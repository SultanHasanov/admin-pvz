import { client, organizationId } from './org'

export async function createTelegramPairingCode(pickupPointId:string, employeeId?:string) {
  const org = await organizationId()
  const { data, error } = await client().rpc('create_telegram_pairing_code', {
    p_organization_id: org, p_pickup_point_id: pickupPointId, p_employee_id: employeeId ?? null,
  })
  if (error) throw error
  return data as string
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
