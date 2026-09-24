import { useParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { Screen, Header } from '../shared/kit/Screen'
import { Card } from '../shared/kit/Card'
import { Avatar, List, ListRow } from '../shared/kit/ListRow'
import { SectionTitle } from '../shared/kit/Text'
import { Button } from '../shared/kit/Button'
import { EmptyState, ErrorNote, SkeletonRows } from '../shared/kit/Misc'
import { toastWarn } from '../shared/kit/Toaster'
import { cn } from '../shared/kit/cn'
import { accrueShifts, countsForPay, employeeShare, rateForDate } from '../entities/calculations'
import type { Shift } from '../entities/types'
import { initials, statusTitles } from '../shared/shifts'
import { rubles } from '../shared/money'
import { plural } from '../shared/format'
import { dayLabel, monthLabel, today } from '../shared/dates'
import { useMonthTotals } from '../features/money/useMonthTotals'
import { useSalarySheets } from '../features/money/useSalarySheets'
import { useOrg } from '../app/OrgContext'
import { useNav } from '../app/nav'
import { useSheets } from '../app/sheets'

/** Неполный выход — главное, что владелец ищет глазами в списке смен. */
const kindOf = (shift:Shift) => shift.payMode === 'HALF' ? '½ смены' : shift.payMode === 'HOURS' ? 'по часам' : 'полная'
/** Смена, которая может ещё стать оплаченной: план или идущая. Отмены в прогноз не входят. */
/** Смена в графике, чей день ещё не наступил: в расчёт войдёт, когда наступит. */
const pending = (shift:Shift) => shift.status !== 'REPLACED' && shift.status !== 'NO_SHOW' && !countsForPay(shift)

/**
 * Расчёт зарплаты одного сотрудника за месяц — `payrollEmp` из прототипа.
 *
 * Цепочка «смены × ставка + премии − вычеты − выплачено = к выплате» и под ней всё,
 * из чего она сложилась: каждая смена со своей суммой, каждый вычет и каждая выплата.
 * Карточка сотрудника показывает итог, а здесь его можно проверить построчно.
 */
export default function Payroll() {
  const { id = '' } = useParams()
  const { month, pointName } = useOrg()
  const { back, canBack, push } = useNav()
  const { open } = useSheets()
  const totals = useMonthTotals()
  const salary = useSalarySheets(totals)

  const employee = totals.staff.find(person => person.id === id)
  const sheet = salary.byEmployee(id)
  const rules = totals.rules.filter(rule => rule.employeeId === id)
  const rate = rateForDate(rules, today())
  const shifts = totals.shifts
    .filter(shift => shift.employeeId === id && shift.startsAt.startsWith(month))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const worked = shifts.filter(shift => countsForPay(shift))
  // Прогноз — если все оставшиеся плановые смены будут отработаны.
  const forecast = (sheet?.balance ?? 0) + accrueShifts(shifts.filter(pending), rules)

  const deductions = totals.deductions
    .filter(row => (row.eventAt ?? row.createdAt).startsWith(month))
    .map(row => ({ row, share: employeeShare(row, totals.parts, id) }))
    .filter(item => item.share > 0)
  const penalties = salary.penalties.filter(row => row.employeeId === id && row.status !== 'CANCELLED' && row.status !== 'DISPUTED')
  const bonuses = salary.bonuses.filter(row => row.employeeId === id)
  const payments = salary.payments
    .filter(row => row.employeeId === id)
    .sort((a, b) => a.date.localeCompare(b.date))

  const period = monthLabel(month).split(' ')[0].toLowerCase()
  const lastDay = dayjs(`${month}-01`).endOf('month')
  // Остаток платят за закрытый месяц; в текущем — только аванс, как в прототипе.
  const monthEnded = today() > lastDay.format('YYYY-MM-DD')
  const toPay = Math.max(0, sheet?.balance ?? 0)
  const withheld = (sheet?.deductions ?? 0) + (sheet?.penalties ?? 0)

  const header = <Header title="Расчёт зарплаты" onBack={canBack ? back : undefined}/>

  if (salary.loading) return <Screen header={header}><Card><SkeletonRows rows={5}/></Card></Screen>
  if (!employee) return <Screen header={header}>
    <Card><EmptyState title="Сотрудник не найден" sub="Возможно, карточка была удалена или относится к другому ПВЗ"/></Card>
  </Screen>

  const chain = [
    { op: '', title: `${worked.length} ${plural(worked.length, 'смена', 'смены', 'смен')} × ставка`, sub: 'по ставке на дату смены', value: sheet?.accrued ?? 0, tone: '' },
    { op: '+', title: 'Премии', sub: bonuses.map(row => row.comment).filter(Boolean).join(', ') || (bonuses.length ? `${bonuses.length} шт.` : 'нет'), value: sheet?.bonuses ?? 0, tone: 'text-ok' },
    {
      op: '−', title: 'Вычеты',
      sub: [
        deductions.length ? `${deductions.length} ${plural(deductions.length, 'удержание', 'удержания', 'удержаний')} WB` : '',
        penalties.length ? `${penalties.length} ${plural(penalties.length, 'штраф', 'штрафа', 'штрафов')}` : '',
      ].filter(Boolean).join(' · ') || 'нет',
      value: withheld, tone: 'text-bad-strong',
    },
    { op: '−', title: 'Выплачено', sub: 'аванс и выплаты', value: sheet?.paid ?? 0, tone: '' },
  ]

  const lines = [
    ...deductions.map(({ row, share }) => ({
      key: `d-${row.id}`,
      title: `Удержание WB · ${row.reason}`,
      sub: `${dayLabel(row.eventAt ?? row.createdAt)} · ${pointName(row.pickupPointId)}${share < row.amountKopecks ? ' · разделено' : ''}`,
      right: `−${rubles(share)}`, tone: 'text-bad-strong',
      onClick: () => push(`/money/ded/${row.id}`),
    })),
    ...penalties.map(row => ({
      key: `p-${row.id}`, title: row.reason || 'Штраф', sub: `${dayLabel(row.date)} · штраф`,
      right: `−${rubles(row.amountKopecks)}`, tone: 'text-bad-strong', onClick: undefined,
    })),
    ...bonuses.map(row => ({
      key: `b-${row.id}`, title: row.comment || 'Премия', sub: `${dayLabel(row.date)} · премия`,
      right: `+${rubles(row.amountKopecks)}`, tone: 'text-ok', onClick: undefined,
    })),
  ]

  return <Screen header={header}>
    {totals.error && <div className="mb-3"><ErrorNote error={totals.error}/></div>}

    <Card className="p-4">
      <div className="mb-[13px] flex items-center gap-[11px]">
        <Avatar initials={initials(employee.fullName)} size={44}/>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[16.5px] font-semibold">{employee.fullName}</div>
          <div className="mt-0.5 text-sub text-muted">
            {[employee.pickupPointIds.map(pointId => pointName(pointId)).join(', '), rate ? `${rubles(rate.rateKopecks)} / смена` : null].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>

      {chain.map(row => <div key={row.title} className="flex items-center gap-2.5 border-t border-line-soft py-[11px]">
        <div className="w-[15px] flex-none font-mono text-[13px] text-muted-soft">{row.op}</div>
        <div className="min-w-0 flex-1">
          <div className="text-row font-medium">{row.title}</div>
          <div className="mt-0.5 truncate text-mono text-muted">{row.sub}</div>
        </div>
        <div className={cn('font-mono text-[15px] font-semibold tabular-nums', row.tone)}>{rubles(row.value)}</div>
      </div>)}
      <div className="flex items-center gap-2.5 border-t border-line-soft pt-[11px]">
        <div className="w-[15px] flex-none font-mono text-[13px] text-muted-soft">=</div>
        <div className="min-w-0 flex-1">
          <div className="text-row font-semibold">К выплате</div>
          <div className="mt-0.5 text-mono text-muted">прогноз на месяц: {rubles(forecast)}</div>
        </div>
        <div className="font-mono text-[21px] font-semibold text-accent tabular-nums">{rubles(sheet?.balance ?? 0)}</div>
      </div>
    </Card>

    <SectionTitle>Смены · {shifts.length} {plural(shifts.length, 'смена', 'смены', 'смен')} в графике, {worked.length} отработано</SectionTitle>
    <Card>
      {!shifts.length
        ? <EmptyState title={`Смен в ${period} нет`}/>
        : shifts.map(shift => {
          const done = countsForPay(shift)
          return <div key={shift.id} className={cn('flex items-center gap-2.5 border-t border-line-soft px-[15px] py-[11px] first:border-t-0', !done && 'opacity-50')}>
            <div className="w-[54px] flex-none font-mono text-mono text-muted-strong">{dayLabel(shift.startsAt)}</div>
            <div className="min-w-0 flex-1 truncate text-act">{pointName(shift.pickupPointId)}</div>
            <div className={cn('mr-1.5 text-tiny', shift.payMode !== 'FULL' ? 'text-warn' : 'text-muted')}>
              {done || pending(shift) ? kindOf(shift) : statusTitles[shift.status].toLowerCase()}
            </div>
            <div className="font-mono text-sub font-medium tabular-nums">{rubles(accrueShifts([shift], rules))}</div>
          </div>
        })}
    </Card>
    {shifts.some(pending) && <div className="mt-2 text-sub leading-[1.4] text-muted">
      Бледные смены ещё впереди: войдут в расчёт в свой день.
    </div>}

    <SectionTitle>Вычеты и премии</SectionTitle>
    <Card>
      {!lines.length
        ? <EmptyState title="Ничего нет" sub={`вычетов и премий в ${period} не было`}/>
        : <List>
          {lines.map(line => <ListRow
            key={line.key}
            title={line.title}
            sub={line.sub}
            right={<span className={cn('font-mono', line.tone)}>{line.right}</span>}
            align="start"
            chevron={!!line.onClick}
            onClick={line.onClick}
          />)}
        </List>}
    </Card>

    <SectionTitle>Выплаты</SectionTitle>
    <Card>
      {!payments.length
        ? <EmptyState title="Выплат ещё не было" sub={`за ${period}`}/>
        : <List>
          {payments.map(payment => <ListRow
            key={payment.id}
            title={payment.kind === 'ADVANCE' ? 'Аванс' : payment.kind === 'ADJUSTMENT' ? 'Корректировка' : 'Выплата остатка'}
            sub={`${dayLabel(payment.date)} · за ${monthLabel((payment.accrualMonth ?? payment.date).slice(0, 7)).split(' ')[0].toLowerCase()}`}
            right={<span className="font-mono">{rubles(payment.amountKopecks)}</span>}
          />)}
        </List>}
    </Card>

    <div className="mt-[13px] flex gap-2">
      <Button className="flex-1" variant="secondary" onClick={() => open('payout', { kind: 'ADVANCE', employeeId: id })}>Аванс</Button>
      <Button
        className="flex-1"
        onClick={() => {
          if (!monthEnded) { toastWarn(`Остаток можно выплатить после ${lastDay.format('D MMMM')}`); return }
          open('payout', { kind: 'PAYMENT', employeeId: id })
        }}
      >{monthEnded ? `Выплатить ${rubles(toPay)}` : `Прогноз ${rubles(forecast)}`}</Button>
    </div>
    <button
      type="button"
      className="tap mt-2 w-full rounded-md border border-dashed border-line-hard py-3.5 text-center text-row font-medium text-accent"
      onClick={() => open('adj', { employeeId: id })}
    >Добавить премию или штраф</button>
  </Screen>
}
