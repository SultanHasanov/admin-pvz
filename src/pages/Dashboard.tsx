import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { CalendarDays, CheckCircle2, CircleAlert, DollarSign, TrendingDown, TrendingUp, Users } from 'lucide-react'
import { accrueShifts, calculateSummary, dailyTotals, ownerLosses, profit } from '../entities/calculations'
import { dateLabel, monthLabel, timeLabel } from '../shared/dates'
import { rubles } from '../shared/money'
import { EmptyState, Loading, Metric, Title } from '../shared/ui'
import { listEmployees, listSalaryRules } from '../services/employees'
import { listShifts, listUpcomingShifts } from '../services/shifts'
import { listTransactions } from '../services/finance'
import { listDeductions, listNewDeductions } from '../services/deductions'
import { getTaxSettings } from '../services/settings'
import { useOrg } from '../app/OrgContext'

export function DashboardPage() {
  const { month, pointId, pointName } = useOrg()
  const [transactions, shifts, employees, rules, deductions, tax, upcoming, alerts] = useQueries({
    queries: [
      { queryKey: ['transactions', month, pointId], queryFn: () => listTransactions(month, pointId || undefined) },
      { queryKey: ['shifts', month, pointId], queryFn: () => listShifts(month, pointId || undefined) },
      { queryKey: ['employees', false], queryFn: () => listEmployees() },
      { queryKey: ['salary-rules'], queryFn: listSalaryRules },
      { queryKey: ['deductions', month, pointId], queryFn: () => listDeductions(month, pointId || undefined) },
      { queryKey: ['tax'], queryFn: getTaxSettings },
      { queryKey: ['upcoming-shifts'], queryFn: () => listUpcomingShifts(3) },
      { queryKey: ['new-deductions'], queryFn: () => listNewDeductions(3) },
    ],
  })

  const loading = transactions.isLoading || shifts.isLoading || employees.isLoading

  const summary = useMemo(() => {
    const staff = (employees.data ?? []).filter(e => !pointId || e.pickupPointIds.includes(pointId))
    const completed = (shifts.data ?? []).filter(s => s.status === 'COMPLETED')
    const payroll = staff.reduce((total, employee) => total + accrueShifts(
      completed.filter(s => s.employeeId === employee.id),
      (rules.data ?? []).filter(r => r.employeeId === employee.id),
    ), 0)
    const taxRate = tax.data?.enabled ? tax.data.rate : 0
    return calculateSummary(transactions.data ?? [], payroll, taxRate, shifts.data ?? [], ownerLosses(deductions.data ?? [], month))
  }, [employees.data, shifts.data, rules.data, transactions.data, tax.data, deductions.data, pointId, month])

  const chart = useMemo(() => dailyTotals((transactions.data ?? []).filter(x => x.kind === 'INCOME'), month), [transactions.data, month])
  const peak = Math.max(...chart, 1)
  const nameOf = (id:string) => employees.data?.find(e => e.id === id)?.fullName ?? 'Сотрудник'

  return <>
    <Title title="Главная" subtitle={`${monthLabel(month)} · ${pointId ? pointName(pointId) : 'Все ПВЗ'}`}/>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Metric label="Доход" value={rubles(summary.income)} icon={TrendingUp} tone="green"/>
      <Metric label="Расходы" value={rubles(summary.expenses)} icon={TrendingDown} tone="red"/>
      <Metric label="Зарплаты" value={rubles(summary.payroll)} icon={Users}/>
      <Metric label="Налог" value={rubles(summary.tax)} icon={DollarSign}/>
      <Metric label="Чистая прибыль" value={rubles(profit(summary))} icon={TrendingUp} tone={profit(summary) >= 0 ? 'green' : 'red'}/>
      <Metric label="Смен завершено" value={String(summary.shifts)} icon={CheckCircle2}/>
      <Metric label="Убытки по WB" value={rubles(summary.confirmedLosses)} icon={CircleAlert} tone={summary.confirmedLosses ? 'red' : 'neutral'}/>
      <Metric label="Сотрудников" value={String((employees.data ?? []).filter(e => !pointId || e.pickupPointIds.includes(pointId)).length)} icon={Users}/>
    </div>

    <div className="mt-4 grid gap-4 sm:mt-5 sm:gap-5 lg:grid-cols-[1.55fr_1fr]">
      <section className="card min-w-0 p-4 sm:p-5">
        <h2 className="font-semibold">Доходы по дням</h2>
        {loading ? <Loading/> : summary.income === 0 ? <EmptyState text="За этот месяц доходов пока нет."/>
          : <div className="mt-6 flex h-40 items-end gap-1 sm:h-52 sm:gap-2">
            {chart.map((value, index) => <div key={index} className="flex min-w-0 flex-1 flex-col justify-end" title={`${index + 1}: ${rubles(value)}`}>
              <div className="rounded-t bg-brand-500/85" style={{ height: `${Math.round(value / peak * 100)}%`, minHeight: value ? 2 : 0 }}/>
              <span className="mt-2 text-center text-[10px] text-slate-400">{index + 1}</span>
            </div>)}
          </div>}
      </section>

      <section className="card min-w-0 p-4 sm:p-5">
        <h2 className="font-semibold">Требуют внимания</h2>
        <div className="mt-4 space-y-3">
          {(alerts.data ?? []).map(item => <Link key={item.id} to="/deductions" className="flex gap-3 rounded-lg bg-amber-50 p-3 text-sm">
            <CircleAlert className="shrink-0 text-amber-600" size={18}/>
            <div className="min-w-0"><b>Удержание WB</b><p className="truncate text-slate-600">{rubles(item.amountKopecks)} · {item.reason}</p></div>
          </Link>)}
          {(upcoming.data ?? []).map(shift => <Link key={shift.id} to="/shifts" className="flex gap-3 rounded-lg bg-slate-50 p-3 text-sm">
            <CalendarDays className="shrink-0 text-brand-600" size={18}/>
            <div className="min-w-0"><b>Ближайшая смена</b><p className="truncate text-slate-600">{nameOf(shift.employeeId)} · {dateLabel(shift.startsAt)} {timeLabel(shift.startsAt)}–{timeLabel(shift.endsAt)}</p></div>
          </Link>)}
          {!alerts.data?.length && !upcoming.data?.length && <EmptyState text="Всё спокойно: открытых удержаний и ближайших смен нет."/>}
        </div>
      </section>
    </div>
  </>
}
