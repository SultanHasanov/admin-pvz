import type { Vacation, VacationKind } from '../entities/types'
import type { Absence } from '../entities/slots'
import { client, organizationId } from './org'

interface VacationRow {
  id:string
  employee_id:string
  date_from:string
  date_to:string
  kind:VacationKind
  source_request_id:string | null
  comment:string | null
}

const columns = 'id,employee_id,date_from,date_to,kind,source_request_id,comment'

const toVacation = (row:VacationRow):Vacation => ({
  id: row.id, employeeId: row.employee_id, dateFrom: row.date_from, dateTo: row.date_to,
  kind: row.kind, sourceRequestId: row.source_request_id, comment: row.comment,
})

/**
 * Отпуска, пересекающиеся с отрезком. Пересечение, а не вложенность: отпуск с 28 августа
 * по 5 сентября влияет на сентябрь, хотя не начинается и не кончается в нём.
 */
export async function listVacations(from:string, to:string):Promise<Vacation[]> {
  const organization_id = await organizationId()
  const { data, error } = await client().from('vacations').select(columns)
    .eq('organization_id', organization_id)
    .lte('date_from', to)
    .gte('date_to', from)
    .order('date_from')
  if (error) throw error
  return (data as VacationRow[]).map(toVacation)
}

export interface VacationInput {
  employeeId:string
  dateFrom:string
  dateTo:string
  kind:VacationKind
  comment?:string | null
}

export async function createVacation(input:VacationInput) {
  const organization_id = await organizationId()
  const { error } = await client().from('vacations').insert({
    organization_id,
    employee_id: input.employeeId,
    date_from: input.dateFrom,
    date_to: input.dateTo < input.dateFrom ? input.dateFrom : input.dateTo,
    kind: input.kind,
    comment: input.comment ?? null,
  })
  if (error) throw error
}

export async function deleteVacation(id:string) {
  const { error } = await client().from('vacations').delete().eq('id', id)
  if (error) throw error
}

/** Отпуск для графика — это просто отрезок отсутствия; тип оплаты расписанию безразличен. */
export const toAbsences = (vacations:Vacation[]):Absence[] =>
  vacations.map(vacation => ({ employeeId: vacation.employeeId, from: vacation.dateFrom, to: vacation.dateTo }))

/** Человек в отпуске на эту дату — для пилюли статуса в карточке и списке людей. */
export const vacationOn = (vacations:Vacation[], employeeId:string, date:string) =>
  vacations.find(vacation => vacation.employeeId === employeeId && date >= vacation.dateFrom && date <= vacation.dateTo)
