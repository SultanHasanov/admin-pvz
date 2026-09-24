import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import type { SalarySheet } from '../../entities/types'
import { calculateSalarySheet } from '../../entities/calculations'
import { keys } from '../../services/queries'
import { listBonuses, listPenalties, listSalaryPayments } from '../../services/salary'
import { useMonthTotals } from './useMonthTotals'

export interface StaffSheet extends SalarySheet {
  fullName:string
  pointIds:string[]
}

/**
 * Ведомость за месяц: по строке на сотрудника с начислением, премиями, штрафами,
 * удержаниями и остатком к выплате.
 *
 * Считает чистая функция `calculateSalarySheet` из entities — здесь только загрузка
 * и сборка. Смены, ставки и удержания приходят из useMonthTotals: экраны «Люди»
 * и «Деньги» не должны грузить одно и то же дважды.
 *
 * Закрытия месяца нет: ведомость всегда считается заново из графика и выплат.
 */
export function useSalarySheets(totals:ReturnType<typeof useMonthTotals>) {
  const { month } = totals

  const [bonuses, penalties, payments] = useQueries({
    queries: [
      { queryKey: keys.bonuses(month), queryFn: () => listBonuses(month) },
      { queryKey: keys.penalties(month), queryFn: () => listPenalties(month) },
      { queryKey: keys.payments(month), queryFn: () => listSalaryPayments(month) },
    ],
  })

  const sheets = useMemo<StaffSheet[]>(() => totals.staff.map(employee => ({
    ...calculateSalarySheet({
      employeeId: employee.id,
      month,
      shifts: totals.shifts,
      rules: totals.rules.filter(rule => rule.employeeId === employee.id),
      bonuses: bonuses.data ?? [],
      penalties: penalties.data ?? [],
      deductions: totals.deductions,
      parts: totals.parts,
      payments: payments.data ?? [],
    }),
    fullName: employee.fullName,
    pointIds: employee.pickupPointIds,
  })), [totals.staff, totals.shifts, totals.rules, totals.deductions, totals.parts, bonuses.data, penalties.data, payments.data, month])

  return {
    sheets,
    byEmployee: (employeeId:string) => sheets.find(sheet => sheet.employeeId === employeeId),
    // К выплате считаем только положительные остатки: переплату по одному человеку
    // нельзя закрыть долгом по другому.
    toPay: sheets.reduce((sum, sheet) => sum + Math.max(0, sheet.balance), 0),
    accrued: sheets.reduce((sum, sheet) => sum + sheet.accrued, 0),
    paid: sheets.reduce((sum, sheet) => sum + sheet.paid, 0),
    bonuses: bonuses.data ?? [],
    penalties: penalties.data ?? [],
    payments: payments.data ?? [],
    loading: totals.loading || bonuses.isLoading || payments.isLoading,
  }
}
