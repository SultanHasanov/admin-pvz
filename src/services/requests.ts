import type { ShiftRequest, ShiftRequestKind, ShiftRequestStatus } from '../entities/types'
import { client, organizationId } from './org'

interface RequestRow {
  id:string
  employee_id:string
  pickup_point_id:string | null
  kind:ShiftRequestKind
  date_from:string
  date_to:string
  reason:string | null
  status:ShiftRequestStatus
  substitute_employee_id:string | null
  resolution_comment:string | null
  resolved_at:string | null
  created_at:string
}

const columns = 'id,employee_id,pickup_point_id,kind,date_from,date_to,reason,status,substitute_employee_id,resolution_comment,resolved_at,created_at'

const toRequest = (row:RequestRow):ShiftRequest => ({
  id: row.id, employeeId: row.employee_id, pickupPointId: row.pickup_point_id,
  kind: row.kind, dateFrom: row.date_from, dateTo: row.date_to, reason: row.reason,
  status: row.status, substituteEmployeeId: row.substitute_employee_id,
  resolutionComment: row.resolution_comment, resolvedAt: row.resolved_at, createdAt: row.created_at,
})

/** Без фильтра — вся история заявок; владельцу в ленту нужны только `SENT`. */
export async function listShiftRequests(statuses?:ShiftRequestStatus[]):Promise<ShiftRequest[]> {
  const organization_id = await organizationId()
  let query = client().from('shift_requests').select(columns).eq('organization_id', organization_id)
    .order('created_at', { ascending: false })
  if (statuses?.length) query = query.in('status', statuses)
  const { data, error } = await query
  if (error) throw error
  return (data as RequestRow[]).map(toRequest)
}

export interface ShiftRequestInput {
  employeeId:string
  pickupPointId?:string | null
  kind:ShiftRequestKind
  dateFrom:string
  dateTo:string
  reason?:string | null
}

export async function createShiftRequest(input:ShiftRequestInput) {
  const organization_id = await organizationId()
  const { error } = await client().from('shift_requests').insert({
    organization_id,
    employee_id: input.employeeId,
    pickup_point_id: input.pickupPointId ?? null,
    kind: input.kind,
    date_from: input.dateFrom,
    // Перепутанные местами даты чинит форма; здесь страхуемся от check(date_to >= date_from).
    date_to: input.dateTo < input.dateFrom ? input.dateFrom : input.dateTo,
    reason: input.reason ?? null,
    status: 'SENT',
  })
  if (error) throw error
}

/**
 * Решение владельца. Только через RPC: замена переписывает чужие смены и пишет историю
 * в `shift_changes`, а подтверждённый отпуск заводит строку в `vacations` — три таблицы
 * в одной транзакции, из браузера это не собрать без гонок.
 */
export async function resolveShiftRequest(
  id:string,
  status:Exclude<ShiftRequestStatus, 'SENT'>,
  substituteEmployeeId?:string | null,
  comment?:string | null,
) {
  const { error } = await client().rpc('resolve_shift_request', {
    p_request_id: id,
    p_status: status,
    p_substitute: substituteEmployeeId ?? null,
    p_comment: comment ?? null,
  })
  if (error) throw error
}

/**
 * Отзыв своей заявки сотрудником. Политика `requests_employee_cancel` разрешает
 * единственный переход `SENT → DECLINED`, поэтому отдельного статуса «отозвана» нет.
 */
export async function cancelShiftRequest(id:string) {
  const { error } = await client().from('shift_requests').update({ status: 'DECLINED' }).eq('id', id)
  if (error) throw error
}
