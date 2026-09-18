import type { Invitation, InvitationStatus } from '../entities/types'
import { normalizeCode } from '../shared/invite'
import { client, organizationId, resetOrganizationCache } from './org'

export { INVITE_CODE, normalizeCode } from '../shared/invite'

interface InvitationRow {
  id:string
  employee_id:string
  code:string
  status:InvitationStatus
  expires_at:string
  accepted_at:string | null
  created_at:string
}

const columns = 'id,employee_id,code,status,expires_at,accepted_at,created_at'

const toInvitation = (row:InvitationRow):Invitation => ({
  id: row.id, employeeId: row.employee_id, code: row.code, status: row.status,
  expiresAt: row.expires_at, acceptedAt: row.accepted_at, createdAt: row.created_at,
})

/** Ссылка приглашения. Домен — текущий: так ссылка работает и на превью, и в проде. */
export const inviteLink = (code:string) => `${location.origin}/join/${code}`

/**
 * Последнее приглашение сотрудника — живое, принятое или отозванное: экрану
 * приглашения нужен статус, даже если кода уже нет.
 */
export async function getInvitation(employeeId:string):Promise<Invitation | null> {
  const organization_id = await organizationId()
  const { data, error } = await client().from('employee_invitations').select(columns)
    .eq('organization_id', organization_id).eq('employee_id', employeeId)
    .order('created_at', { ascending: false }).limit(1)
  if (error) throw error
  const row = (data as InvitationRow[])[0]
  return row ? toInvitation(row) : null
}

/** Выпустить новый код. Прежний живой отзывается в той же транзакции (RPC). */
export async function createInvitation(employeeId:string):Promise<string> {
  const { data, error } = await client().rpc('create_employee_invitation', { p_employee_id: employeeId })
  if (error) throw error
  return data as string
}

export async function revokeInvitation(employeeId:string) {
  const organization_id = await organizationId()
  const { error } = await client().from('employee_invitations').update({ status: 'REVOKED' })
    .eq('organization_id', organization_id).eq('employee_id', employeeId).eq('status', 'SENT')
  if (error) throw error
}

/**
 * Принять приглашение. Неверный код RPC возвращает ответом `{ error }`, а не исключением:
 * иначе откатилась бы запись о неудачной попытке и ограничение на перебор не работало бы.
 */
export async function acceptInvitation(code:string):Promise<{ organizationId:string; employeeId:string }> {
  const { data, error } = await client().rpc('accept_employee_invitation', { p_code: normalizeCode(code) })
  if (error) throw error
  const result = (data ?? {}) as { error?:string; organizationId?:string; employeeId?:string }
  if (result.error) throw new Error(result.error)
  if (!result.organizationId || !result.employeeId) throw new Error('Не удалось принять приглашение')
  // Участие в организации только что появилось — закэшированное «нет организации» устарело.
  resetOrganizationCache()
  return { organizationId: result.organizationId, employeeId: result.employeeId }
}
