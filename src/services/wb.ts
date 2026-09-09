import { client } from './org'
import { organizationId } from './org'

export interface WbStatus { status:'NOT_CONNECTED'|'AWAIT_CODE'|'CONNECTED'|'ERROR'; phoneHint:string|null; lastSyncAt:string|null; lastError:string|null }
export interface WbSyncResult { ok:true; points:number; employees:number; deductions:number; lastSyncAt:string }

async function call<T>(method:string, body?:Record<string, unknown>):Promise<T> {
  const organizationIdValue = await organizationId()
  const { data } = await client().auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Войдите в аккаунт')
  const query = method === 'GET' ? `?organizationId=${encodeURIComponent(organizationIdValue)}` : ''
  const response = await fetch(`/api/wb/integration${query}`, {
    method, headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
    body:method === 'GET' ? undefined : JSON.stringify({ organizationId:organizationIdValue, ...body }),
  })
  const result = await response.json().catch(() => null)
  if (!response.ok) throw new Error(result?.error || `Ошибка HTTP ${response.status}`)
  return result as T
}

export const getWbStatus = () => call<WbStatus>('GET')
export const requestWbCode = (phone:string) => call<{ok:true;codeLength:number}>('POST', { action:'request_code', phone })
export const confirmWbCode = (code:string) => call<{ok:true}>('POST', { action:'confirm_code', code })
export const syncWb = () => call<WbSyncResult>('POST', { action:'sync' })
export const disconnectWb = () => call<{ok:true}>('DELETE')
