import { describe, expect, it } from 'vitest'
import { accrueShifts, calculatePayroll, calculateSalarySheet, dailyTotals, ownerLosses, profit, rateForDate } from './calculations'
import type { Bonus, Deduction, Employee, Penalty, SalaryPayment, SalaryRule, Shift, Transaction } from './types'

const worker:Employee = { id: 'e', fullName: 'Иван', pickupPointIds: ['p'], paymentType: 'SHIFT', rateKopecks: 200000, monthlyNormDays: 22, status: 'ACTIVE' }
const completed:Shift = { id: 's', employeeId: 'e', pickupPointId: 'p', startsAt: '2026-09-01T08:00:00+03:00', endsAt: '2026-09-01T22:00:00+03:00', status: 'COMPLETED' }
const shiftOn = (id:string, date:string):Shift => ({ ...completed, id, startsAt: `${date}T08:00:00+03:00`, endsAt: `${date}T22:00:00+03:00` })

const rules:SalaryRule[] = [
  { id: 'r1', employeeId: 'e', paymentType: 'SHIFT', rateKopecks: 200000, effectiveFrom: '2026-01-01', monthlyNormDays: 22 },
  { id: 'r2', employeeId: 'e', paymentType: 'SHIFT', rateKopecks: 250000, effectiveFrom: '2026-09-15', monthlyNormDays: 22 },
]

describe('payroll calculations', () => {
  it('accrues a completed shift only', () => expect(calculatePayroll(worker, [completed], '2026-09', 22)).toBe(200000))
  it('does not subtract payroll twice from profit', () => expect(profit({ income: 10000, expenses: 2000, payroll: 3000, tax: 500, confirmedLosses: 0, shifts: 1 })).toBe(4500))
})

describe('rateForDate', () => {
  it('takes the rate that was in force on the shift date', () => expect(rateForDate(rules, '2026-09-10')?.rateKopecks).toBe(200000))
  it('switches to the newer rate from its effective date', () => expect(rateForDate(rules, '2026-09-20')?.rateKopecks).toBe(250000))
  it('falls back to the earliest rate for shifts before any rule', () => expect(rateForDate(rules, '2025-05-01')?.rateKopecks).toBe(200000))
  it('accrues each shift by its own rate', () => expect(accrueShifts([shiftOn('a', '2026-09-10'), shiftOn('b', '2026-09-20')], rules)).toBe(450000))
})

describe('calculateSalarySheet', () => {
  const bonuses:Bonus[] = [{ id: 'b', employeeId: 'e', date: '2026-09-05', amountKopecks: 50000 }]
  const penalties:Penalty[] = [
    { id: 'p1', employeeId: 'e', pickupPointId: 'p', date: '2026-09-06', amountKopecks: 30000, reason: 'Опоздание', status: 'ASSIGNED' },
    { id: 'p2', employeeId: 'e', pickupPointId: 'p', date: '2026-09-07', amountKopecks: 99000, reason: 'Отменён', status: 'CANCELLED' },
  ]
  const deductions:Deduction[] = [
    { id: 'd1', pickupPointId: 'p', employeeId: 'e', shiftId: null, eventAt: '2026-09-08T10:00:00Z', amountKopecks: 373000, reason: 'Подмена товара', status: 'EMPLOYEE_LIABILITY', createdAt: '2026-09-08T10:00:00Z' },
    { id: 'd2', pickupPointId: 'p', employeeId: 'e', shiftId: null, eventAt: '2026-09-09T10:00:00Z', amountKopecks: 100000, reason: 'Оспаривается', status: 'DISPUTED', createdAt: '2026-09-09T10:00:00Z' },
  ]
  const payments:SalaryPayment[] = [{ id: 'pay', employeeId: 'e', date: '2026-09-15', amountKopecks: 100000, kind: 'ADVANCE' }]
  const sheet = calculateSalarySheet({ employeeId: 'e', month: '2026-09', shifts: [shiftOn('a', '2026-09-10')], rules, bonuses, penalties, deductions, payments })

  it('accrues only completed shifts of the month', () => expect(sheet.accrued).toBe(200000))
  it('counts assigned penalties and ignores cancelled ones', () => expect(sheet.penalties).toBe(30000))
  it('withholds only deductions charged to the employee', () => expect(sheet.deductions).toBe(373000))
  it('leaves the balance after bonuses, penalties, deductions and advances', () => expect(sheet.balance).toBe(200000 + 50000 - 30000 - 373000 - 100000))
})

describe('ownerLosses', () => {
  const rows:Deduction[] = [
    { id: 'd1', pickupPointId: null, employeeId: null, shiftId: null, eventAt: '2026-09-02T10:00:00Z', amountKopecks: 500000, reason: 'Убыток', status: 'OWNER_LOSS', createdAt: '2026-09-02T10:00:00Z' },
    { id: 'd2', pickupPointId: null, employeeId: 'e', shiftId: null, eventAt: '2026-09-03T10:00:00Z', amountKopecks: 400000, reason: 'На сотруднике', status: 'EMPLOYEE_LIABILITY', createdAt: '2026-09-03T10:00:00Z' },
    { id: 'd3', pickupPointId: null, employeeId: null, shiftId: null, eventAt: '2026-08-02T10:00:00Z', amountKopecks: 900000, reason: 'Прошлый месяц', status: 'OWNER_LOSS', createdAt: '2026-08-02T10:00:00Z' },
  ]
  it('counts only the owner losses of the requested month', () => expect(ownerLosses(rows, '2026-09')).toBe(500000))
})

describe('dailyTotals', () => {
  const rows:Transaction[] = [
    { id: 'i1', kind: 'INCOME', date: '2026-09-01', pickupPointId: 'p', category: 'WB', amountKopecks: 1000 },
    { id: 'i2', kind: 'INCOME', date: '2026-09-01', pickupPointId: 'p', category: 'WB', amountKopecks: 500 },
    { id: 'i3', kind: 'INCOME', date: '2026-09-30', pickupPointId: 'p', category: 'WB', amountKopecks: 700 },
  ]
  it('sums income per day of the month', () => {
    const totals = dailyTotals(rows, '2026-09')
    expect(totals).toHaveLength(30)
    expect(totals[0]).toBe(1500)
    expect(totals[29]).toBe(700)
  })
})
