import dayjs from 'dayjs'
import type { Bonus, DashboardSummary, Deduction, Employee, Penalty, SalaryPayment, SalaryRule, SalarySheet, Shift, Transaction } from './types'

const day = (value:string) => value.slice(0, 10)
const hours = (shift:Shift) => dayjs(shift.actualEndsAt ?? shift.endsAt).diff(dayjs(shift.actualStartsAt ?? shift.startsAt), 'minute') / 60

export function calculatePayroll(employee:Employee, shifts:Shift[], month:string, normDays:number):number {
  const worked = shifts.filter(s => s.employeeId === employee.id && s.status === 'COMPLETED' && s.startsAt.startsWith(month))
  if (employee.paymentType === 'SHIFT') return worked.length * employee.rateKopecks
  if (employee.paymentType === 'HOURLY') return worked.reduce((sum, s) => sum + Math.round(hours(s) * employee.rateKopecks), 0)
  const days = new Set(worked.map(s => day(s.startsAt))).size
  return Math.round(employee.rateKopecks * days / normDays)
}

/** Ставка, действовавшая на дату смены. Если смена раньше самой первой ставки — берём первую. */
export function rateForDate(rules:SalaryRule[], date:string):SalaryRule | undefined {
  if (!rules.length) return undefined
  const target = day(date)
  const ordered = [...rules].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
  const applicable = ordered.filter(r => r.effectiveFrom <= target)
  return applicable.length ? applicable[applicable.length - 1] : ordered[0]
}

export function accrueShifts(worked:Shift[], rules:SalaryRule[]):number {
  let total = 0
  const salaryDays = new Map<string, SalaryRule>()
  for (const shift of worked) {
    const rule = rateForDate(rules, shift.startsAt)
    if (!rule) continue
    if (rule.paymentType === 'SHIFT') total += rule.rateKopecks
    else if (rule.paymentType === 'HOURLY') total += Math.round(hours(shift) * rule.rateKopecks)
    else salaryDays.set(day(shift.startsAt), rule)
  }
  for (const rule of salaryDays.values()) total += Math.round(rule.rateKopecks / (rule.monthlyNormDays ?? 22))
  return total
}

const inMonth = (value:string | null | undefined, month:string) => Boolean(value && value.startsWith(month))
const countedPenalty = (p:Penalty) => p.status === 'ASSIGNED' || p.status === 'CONFIRMED' || p.status === 'WITHHELD'

export function calculateSalarySheet(input:{
  employeeId:string; month:string; shifts:Shift[]; rules:SalaryRule[]
  bonuses:Bonus[]; penalties:Penalty[]; deductions:Deduction[]; payments:SalaryPayment[]
}):SalarySheet {
  const { employeeId, month } = input
  const worked = input.shifts.filter(s => s.employeeId === employeeId && s.status === 'COMPLETED' && inMonth(s.startsAt, month))
  const accrued = accrueShifts(worked, input.rules.filter(r => r.employeeId === employeeId))
  const bonuses = input.bonuses.filter(b => b.employeeId === employeeId && inMonth(b.date, month)).reduce((s, b) => s + b.amountKopecks, 0)
  const penalties = input.penalties.filter(p => p.employeeId === employeeId && inMonth(p.date, month) && countedPenalty(p)).reduce((s, p) => s + p.amountKopecks, 0)
  const deductions = input.deductions.filter(d => d.employeeId === employeeId && d.status === 'EMPLOYEE_LIABILITY' && inMonth(d.eventAt ?? d.createdAt, month)).reduce((s, d) => s + d.amountKopecks, 0)
  const paid = input.payments.filter(p => p.employeeId === employeeId && inMonth(p.date, month)).reduce((s, p) => s + p.amountKopecks, 0)
  return { employeeId, accrued, bonuses, penalties, deductions, paid, balance: accrued + bonuses - penalties - deductions - paid, shifts: worked.length }
}

/** Убытки владельца: удержания WB, которые не оспорены и не переложены на сотрудника. */
export function ownerLosses(deductions:Deduction[], month:string):number {
  return deductions
    .filter(d => (d.status === 'OWNER_LOSS' || d.status === 'CONFIRMED_BY_WB') && inMonth(d.eventAt ?? d.createdAt, month))
    .reduce((sum, d) => sum + d.amountKopecks, 0)
}

export function calculateSummary(transactions:Transaction[], payroll:number, taxRate:number, shifts:Shift[], losses = 0):DashboardSummary {
  const income = transactions.filter(x => x.kind === 'INCOME').reduce((s, x) => s + x.amountKopecks, 0)
  const expenses = transactions.filter(x => x.kind === 'EXPENSE').reduce((s, x) => s + x.amountKopecks, 0)
  return { income, expenses, payroll, tax: Math.round(income * taxRate / 100), confirmedLosses: losses, shifts: shifts.filter(s => s.status === 'COMPLETED').length }
}

export function profit(s:DashboardSummary) { return s.income - s.expenses - s.payroll - s.tax - s.confirmedLosses }

/** Суммы доходов по дням месяца — для графика на «Главной». */
export function dailyTotals(transactions:Transaction[], month:string):number[] {
  const days = dayjs(`${month}-01`).daysInMonth()
  const totals = new Array<number>(days).fill(0)
  for (const entry of transactions) {
    if (!inMonth(entry.date, month)) continue
    const index = Number(entry.date.slice(8, 10)) - 1
    if (index >= 0 && index < days) totals[index] += entry.amountKopecks
  }
  return totals
}
