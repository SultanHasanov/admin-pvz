import dayjs from 'dayjs'
import type { DashboardSummary, Employee, Shift, Transaction } from './types'

export function calculatePayroll(employee:Employee, shifts:Shift[], month:string, normDays:number):number {
  const worked = shifts.filter(s => s.employeeId === employee.id && s.status === 'COMPLETED' && s.startsAt.startsWith(month))
  if (employee.paymentType === 'SHIFT') return worked.length * employee.rateKopecks
  if (employee.paymentType === 'HOURLY') return worked.reduce((sum, s) => sum + Math.round(dayjs(s.actualEndsAt ?? s.endsAt).diff(dayjs(s.actualStartsAt ?? s.startsAt), 'minute') / 60 * employee.rateKopecks), 0)
  const days = new Set(worked.map(s => s.startsAt.slice(0, 10))).size
  return Math.round(employee.rateKopecks * days / normDays)
}
export function calculateSummary(transactions:Transaction[], payroll:number, taxRate:number, shifts:Shift[], losses=0):DashboardSummary {
  const income=transactions.filter(x=>x.kind==='INCOME').reduce((s,x)=>s+x.amountKopecks,0)
  const expenses=transactions.filter(x=>x.kind==='EXPENSE').reduce((s,x)=>s+x.amountKopecks,0)
  return { income, expenses, payroll, tax:Math.round(income*taxRate/100), confirmedLosses:losses, shifts:shifts.filter(s=>s.status==='COMPLETED').length }
}
export function profit(s:DashboardSummary) { return s.income - s.expenses - s.payroll - s.tax - s.confirmedLosses }
