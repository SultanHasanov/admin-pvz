import { useCallback, useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import type { Shift } from '../../entities/types'
import { accrueShifts, calculateSalarySheet, employeeShare } from '../../entities/calculations'
import { isAbsent } from '../../entities/slots'
import { keys } from '../../services/queries'
import { listShifts, listShiftsRange } from '../../services/shifts'
import { listSalaryRules } from '../../services/employees'
import { listBonuses, listPenalties, listSalaryPayments } from '../../services/salary'
import { listDeductionParts, listDeductions } from '../../services/deductions'
import { today as todayDate } from '../../shared/dates'
import { useVacations } from '../schedule/useVacations'
import { shortName, useMe } from './useMe'

/** Смена «моя и живая»: заменённую или сорванную не показываем как предстоящую работу. */
const live = (shift:Shift) => shift.status !== 'REPLACED' && shift.status !== 'NO_SHOW'
const dateOf = (shift:Shift) => shift.workDate ?? dayjs(shift.startsAt).format('YYYY-MM-DD')

/**
 * Напарники на смене: кто ещё стоит на той же точке в тот же день. RLS отдаёт сотруднику
 * чужие смены ровно в этом объёме — поэтому считать можно по тому, что пришло.
 */
function partnersOf(shifts:Shift[], shift:Shift, nameOf:(id:string) => string) {
  return shifts
    .filter(other => other.id !== shift.id && live(other)
      && other.pickupPointId === shift.pickupPointId && dateOf(other) === dateOf(shift)
      && other.employeeId !== shift.employeeId)
    .map(other => shortName(nameOf(other.employeeId)))
}

/**
 * Месяц сотрудника: мои смены, из чего сложатся деньги, вычеты и выплаты.
 *
 * Считает та же `calculateSalarySheet`, что и ведомость владельца, — цифра «к выплате»
 * у обоих должна совпадать до копейки, иначе первый же спор решится не в пользу приложения.
 */
export function useMyMonth(month:string) {
  const { employeeId, nameOf } = useMe()
  const { absences } = useVacations(month)

  const [shifts, rules, bonuses, penalties, payments, deductions] = useQueries({
    queries: [
      { queryKey: keys.shifts(month, ''), queryFn: () => listShifts(month) },
      { queryKey: keys.salaryRules, queryFn: listSalaryRules },
      { queryKey: keys.bonuses(month), queryFn: () => listBonuses(month) },
      { queryKey: keys.penalties(month), queryFn: () => listPenalties(month) },
      { queryKey: keys.payments(month), queryFn: () => listSalaryPayments(month) },
      { queryKey: keys.deductions(month, ''), queryFn: () => listDeductions(month) },
    ],
  })

  const parts = useQuery({
    queryKey: keys.deductionParts(month, ''),
    queryFn: () => listDeductionParts((deductions.data ?? []).map(row => row.id)),
    enabled: !!deductions.data,
  })

  const all = useMemo(() => shifts.data ?? [], [shifts.data])
  const mine = useMemo(() => all
    .filter(shift => shift.employeeId === employeeId && live(shift))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt)), [all, employeeId])

  const myRules = useMemo(
    () => (rules.data ?? []).filter(rule => rule.employeeId === employeeId),
    [rules.data, employeeId])

  const sheet = useMemo(() => employeeId ? calculateSalarySheet({
    employeeId,
    month,
    shifts: all,
    rules: myRules,
    bonuses: bonuses.data ?? [],
    penalties: penalties.data ?? [],
    deductions: deductions.data ?? [],
    parts: parts.data ?? [],
    payments: payments.data ?? [],
  }) : null, [employeeId, month, all, myRules, bonuses.data, penalties.data, deductions.data, parts.data, payments.data])

  // Прогноз: всё, что стоит в графике и не отпуск, как будто будет отработано.
  const forecast = useMemo(() => accrueShifts(
    mine.filter(shift => !isAbsent(absences, shift.employeeId, dateOf(shift))),
    myRules), [mine, myRules, absences])

  const myDeductions = useMemo(() => employeeId
    ? (deductions.data ?? [])
      .map(deduction => ({ deduction, share: employeeShare(deduction, parts.data ?? [], employeeId) }))
      .filter(row => row.share > 0)
    : [], [deductions.data, parts.data, employeeId])

  const payOf = useCallback((shift:Shift) => accrueShifts([shift], myRules), [myRules])
  const partners = useCallback((shift:Shift) => partnersOf(all, shift, nameOf), [all, nameOf])

  return {
    employeeId,
    shifts: mine,
    absences,
    sheet,
    forecast,
    deductions: myDeductions,
    bonuses: (bonuses.data ?? []).filter(row => row.employeeId === employeeId),
    penalties: (penalties.data ?? []).filter(row => row.employeeId === employeeId),
    payments: (payments.data ?? []).filter(row => row.employeeId === employeeId),
    payOf,
    partners,
    loading: shifts.isLoading || rules.isLoading,
    error: shifts.error ?? rules.error ?? null,
  }
}

/**
 * Ближайшие смены — через границу месяца: 28-го сентября следующая смена может быть
 * уже в октябре, и «Смен нет» на главной было бы неправдой.
 */
export function useMyUpcoming(days = 30) {
  const { employeeId, nameOf } = useMe()
  const from = todayDate()
  const to = dayjs(from).add(days, 'day').format('YYYY-MM-DD')

  const query = useQuery({
    queryKey: keys.shiftsRange(from, to, ''),
    queryFn: () => listShiftsRange(from, to),
  })

  const all = useMemo(() => query.data ?? [], [query.data])
  const upcoming = useMemo(() => all
    .filter(shift => shift.employeeId === employeeId && live(shift) && shift.status !== 'COMPLETED')
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt)), [all, employeeId])

  return {
    upcoming,
    partners: (shift:Shift) => partnersOf(all, shift, nameOf),
    loading: query.isLoading,
  }
}
