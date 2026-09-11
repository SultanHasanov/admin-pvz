import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Card, Col, Row, Tooltip, Typography } from 'antd'
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
  const staffCount = (employees.data ?? []).filter(e => !pointId || e.pickupPointIds.includes(pointId)).length

  const metrics = [
    { label: 'Доход', value: rubles(summary.income), icon: TrendingUp, tone: 'green' as const },
    { label: 'Расходы', value: rubles(summary.expenses), icon: TrendingDown, tone: 'red' as const },
    { label: 'Зарплаты', value: rubles(summary.payroll), icon: Users },
    { label: 'Налог', value: rubles(summary.tax), icon: DollarSign },
    { label: 'Чистая прибыль', value: rubles(profit(summary)), icon: TrendingUp, tone: profit(summary) >= 0 ? 'green' as const : 'red' as const },
    { label: 'Смен завершено', value: String(summary.shifts), icon: CheckCircle2 },
    { label: 'Убытки по WB', value: rubles(summary.confirmedLosses), icon: CircleAlert, tone: summary.confirmedLosses ? 'red' as const : undefined },
    { label: 'Сотрудников', value: String(staffCount), icon: Users },
  ]

  return <>
    <Title title="Главная" subtitle={`${monthLabel(month)} · ${pointId ? pointName(pointId) : 'Все ПВЗ'}`}/>

    {/* На телефоне две плитки в ряд: одна колонка растягивает экран, три — режет суммы. */}
    <Row gutter={[12, 12]}>
      {metrics.map(metric => <Col key={metric.label} xs={12} md={8} xl={6}>
        <Metric label={metric.label} value={metric.value} icon={metric.icon} tone={metric.tone}/>
      </Col>)}
    </Row>

    <Row gutter={[16, 16]} className="mt-4">
      <Col xs={24} xl={15}>
        <Card title="Доходы по дням" variant="outlined" styles={{ body: { paddingTop: 12 } }}>
          {loading ? <Loading/> : summary.income === 0 ? <EmptyState text="За этот месяц доходов пока нет."/>
            : <div className="flex h-40 items-end gap-[3px] sm:h-52 sm:gap-2">
              {chart.map((value, index) => <Tooltip key={index} title={`${index + 1}-е · ${rubles(value)}`}>
                <div className="flex min-w-0 flex-1 cursor-default flex-col justify-end">
                  <div className="rounded-t bg-brand-500/85" style={{ height: `${Math.round(value / peak * 100)}%`, minHeight: value ? 2 : 0 }}/>
                  <span className="mt-2 text-center text-[10px] text-slate-400">{index + 1}</span>
                </div>
              </Tooltip>)}
            </div>}
        </Card>
      </Col>

      <Col xs={24} xl={9}>
        <Card title="Требуют внимания" variant="outlined" styles={{ body: { paddingTop: 12 } }}>
          <div className="grid gap-2">
            {(alerts.data ?? []).map(item => <Link key={item.id} to="/deductions" className="flex gap-3 rounded-lg bg-amber-50 p-3">
              <CircleAlert className="mt-0.5 shrink-0 text-amber-600" size={18}/>
              <div className="min-w-0">
                <Typography.Text strong>Удержание WB</Typography.Text>
                <Typography.Paragraph type="secondary" ellipsis style={{ marginBottom: 0 }}>{rubles(item.amountKopecks)} · {item.reason}</Typography.Paragraph>
              </div>
            </Link>)}
            {(upcoming.data ?? []).map(shift => <Link key={shift.id} to="/shifts" className="flex gap-3 rounded-lg bg-slate-50 p-3">
              <CalendarDays className="mt-0.5 shrink-0 text-brand-600" size={18}/>
              <div className="min-w-0">
                <Typography.Text strong>Ближайшая смена</Typography.Text>
                <Typography.Paragraph type="secondary" ellipsis style={{ marginBottom: 0 }}>
                  {nameOf(shift.employeeId)} · {dateLabel(shift.startsAt)} {timeLabel(shift.startsAt)}–{timeLabel(shift.endsAt)}
                </Typography.Paragraph>
              </div>
            </Link>)}
            {!alerts.data?.length && !upcoming.data?.length && <EmptyState text="Всё спокойно: открытых удержаний и ближайших смен нет."/>}
          </div>
        </Card>
      </Col>
    </Row>
  </>
}
