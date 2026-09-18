import { useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { accrueShifts, calculateSummary, dailyTotals, ownerLosses, profit } from '../../entities/calculations'
import { keys } from '../../services/queries'
import { listEmployees, listSalaryRules } from '../../services/employees'
import { listShifts } from '../../services/shifts'
import { listTransactions } from '../../services/finance'
import { listDeductionParts, listDeductions } from '../../services/deductions'
import { getTaxSettings } from '../../services/settings'
import { useOrg } from '../../app/OrgContext'

/**
 * Итоги месяца по выбранному ПВЗ: то, что прототип показывает на тёмной карточке
 * «Главной» и в разделе «Деньги». Один набор запросов на оба экрана — иначе цифра
 * прибыли на главной и в расчёте считалась бы дважды и могла разойтись.
 *
 * Зарплата считается двумя числами: начислено по уже отработанным сменам (`payroll`)
 * и прогноз с учётом запланированных (`forecast`). В прибыль идёт начисленное:
 * прогноз — это обязательство, а не расход месяца.
 */
export function useMonthTotals() {
  const { month, pointId } = useOrg()

  const [transactions, shifts, employees, rules, deductions, tax] = useQueries({
    queries: [
      { queryKey: keys.transactions(month, pointId), queryFn: () => listTransactions(month, pointId || undefined) },
      { queryKey: keys.shifts(month, pointId), queryFn: () => listShifts(month, pointId || undefined) },
      { queryKey: keys.employees(), queryFn: () => listEmployees() },
      { queryKey: keys.salaryRules, queryFn: listSalaryRules },
      { queryKey: keys.deductions(month, pointId), queryFn: () => listDeductions(month, pointId || undefined) },
      { queryKey: keys.tax, queryFn: getTaxSettings },
    ],
  })

  // Части разделённых удержаний: без них убыток владельца и вычеты сотрудников
  // считались бы по старому правилу «всё на одном».
  const deductionIds = (deductions.data ?? []).map(row => row.id)
  const parts = useQuery({
    queryKey: keys.deductionParts(month, pointId),
    queryFn: () => listDeductionParts(deductionIds),
    enabled: !!deductions.data,
  })

  const staff = useMemo(
    () => (employees.data ?? []).filter(employee => !pointId || employee.pickupPointIds.includes(pointId)),
    [employees.data, pointId])

  const payrollOf = (filter:(status:string) => boolean) => staff.reduce((total, employee) => total + accrueShifts(
    (shifts.data ?? []).filter(shift => shift.employeeId === employee.id && filter(shift.status)),
    (rules.data ?? []).filter(rule => rule.employeeId === employee.id),
  ), 0)

  const summary = useMemo(() => {
    const taxRate = tax.data?.enabled ? tax.data.rate : 0
    return calculateSummary(
      transactions.data ?? [],
      payrollOf(status => status === 'COMPLETED'),
      taxRate,
      shifts.data ?? [],
      ownerLosses(deductions.data ?? [], month, parts.data ?? []),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions.data, shifts.data, staff, rules.data, tax.data, deductions.data, parts.data, month])

  const forecast = useMemo(
    () => payrollOf(status => status === 'COMPLETED' || status === 'PLANNED' || status === 'ON_DUTY'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shifts.data, staff, rules.data])

  const incomeByDay = useMemo(
    () => dailyTotals((transactions.data ?? []).filter(entry => entry.kind === 'INCOME'), month),
    [transactions.data, month])

  return {
    month,
    pointId,
    summary,
    profit: profit(summary),
    forecast,
    incomeByDay,
    staff,
    shifts: shifts.data ?? [],
    transactions: transactions.data ?? [],
    deductions: deductions.data ?? [],
    parts: parts.data ?? [],
    rules: rules.data ?? [],
    taxRate: tax.data?.enabled ? tax.data.rate : 0,
    loading: transactions.isLoading || shifts.isLoading || employees.isLoading,
    error: transactions.error ?? shifts.error ?? employees.error ?? null,
  }
}
