import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { Screen, Header } from '../../shared/kit/Screen'
import { Card } from '../../shared/kit/Card'
import { List, ListRow } from '../../shared/kit/ListRow'
import { SectionTitle } from '../../shared/kit/Text'
import { Segmented } from '../../shared/kit/Segmented'
import { EmptyState, ErrorNote, SkeletonRows } from '../../shared/kit/Misc'
import { cn } from '../../shared/kit/cn'
import { rateForDate } from '../../entities/calculations'
import { rubles } from '../../shared/money'
import { plural } from '../../shared/format'
import { dayLabel, monthLabel, today as todayDate } from '../../shared/dates'
import { keys } from '../../services/queries'
import { getPayoutSettings } from '../../services/payoutSettings'
import { listSalaryRules } from '../../services/employees'
import { useMyMonth } from '../../features/me/useMyMonth'
import { useOrg } from '../../app/OrgContext'
import { useNav } from '../../app/nav'
import { NotLinked } from './NotLinked'

/**
 * Мои деньги: остаток к выплате и из чего он сложился.
 *
 * Цепочка «смены × ставка + премии − вычеты − выплачено = остаток» — главное на экране:
 * сотрудник должен уметь сам проверить сумму, иначе каждая выплата превращается в спор.
 */
export default function MeMoney() {
  const { pointName } = useOrg()
  const { push } = useNav()
  const current = todayDate().slice(0, 7)
  const previous = dayjs(`${current}-01`).subtract(1, 'month').format('YYYY-MM')
  const [month, setMonth] = useState(current)
  const my = useMyMonth(month)
  const payout = useQuery({ queryKey: keys.payoutSettings, queryFn: getPayoutSettings })
  const rules = useQuery({ queryKey: keys.salaryRules, queryFn: listSalaryRules })

  const period = monthLabel(month).split(' ')[0].toLowerCase()
  const sheet = my.sheet
  const worked = sheet?.shifts ?? 0
  const rateNow = rateForDate((rules.data ?? []).filter(rule => rule.employeeId === my.employeeId), todayDate())
  const settings = payout.data
  const deductions = (sheet?.deductions ?? 0) + (sheet?.penalties ?? 0)

  const chain = [
    { op: '', title: `${worked} ${plural(worked, 'смена', 'смены', 'смен')} × ставка`,
      sub: `по ставке на дату смены${rateNow ? ` · сейчас ${rubles(rateNow.rateKopecks)}` : ''}`, value: sheet?.accrued ?? 0, tone: '' },
    { op: '+', title: 'Премии', sub: my.bonuses.map(row => row.comment).filter(Boolean).join(', ') || 'нет', value: sheet?.bonuses ?? 0, tone: 'text-ok' },
    { op: '−', title: 'Вычеты', sub: deductions ? 'штрафы и удержания WB' : 'нет', value: deductions, tone: 'text-bad-strong' },
    { op: '−', title: 'Выплачено', sub: 'аванс и выплаты', value: sheet?.paid ?? 0, tone: '' },
    { op: '=', title: 'Остаток', sub: '', value: sheet?.balance ?? 0, tone: 'text-accent font-semibold' },
  ]

  const lines = [
    ...my.deductions.map(({ deduction, share }) => ({
      key: `d-${deduction.id}`,
      title: `Удержание WB · ${deduction.reason}`,
      sub: `${dayLabel(deduction.eventAt ?? deduction.createdAt)} · ${pointName(deduction.pickupPointId)}`,
      right: `−${rubles(share)}`,
      tone: 'text-bad-strong',
    })),
    ...my.penalties.filter(row => row.status !== 'CANCELLED' && row.status !== 'DISPUTED').map(row => ({
      key: `p-${row.id}`, title: `Штраф · ${row.reason}`, sub: dayLabel(row.date), right: `−${rubles(row.amountKopecks)}`, tone: 'text-bad-strong',
    })),
    ...my.bonuses.map(row => ({
      key: `b-${row.id}`, title: row.comment || 'Премия', sub: dayLabel(row.date), right: `+${rubles(row.amountKopecks)}`, tone: 'text-ok',
    })),
  ]

  const header = <Header title="Мои деньги"/>
  if (!my.loading && !my.employeeId) return <Screen header={header}><NotLinked/></Screen>

  return <Screen header={header}>
    <Segmented
      className="mb-3"
      value={month}
      onChange={setMonth}
      // Прошлый месяц — ради остатка, который выплачивают уже в следующем.
      options={[previous, current].map(value => ({ value, label: monthLabel(value).split(' ')[0] }))}
    />

    {my.error && <div className="mb-3"><ErrorNote error={my.error}/></div>}

    <Card className="p-4">
      <div className="text-act text-muted">Остаток к выплате · {period}</div>
      <div className="mt-[3px] mb-[2px] text-sum font-semibold tracking-[-0.03em] tabular-nums">
        {my.loading ? '—' : rubles(sheet?.balance ?? 0)}
      </div>
      <div className="text-sub leading-[1.45] text-muted">
        {settings?.advanceDay && settings.payday ? `Аванс ${settings.advanceDay}-го, остаток ${settings.payday}-го. ` : ''}
        Прогноз за месяц {rubles(my.forecast)}.
      </div>

      <div className="mt-[13px] border-t border-line-soft">
        {chain.map(row => <div key={row.title} className="flex items-start gap-3 border-b border-line-soft py-[10px] last:border-b-0">
          <div className="w-3 flex-none text-row font-semibold text-muted">{row.op}</div>
          <div className="min-w-0 flex-1">
            <div className="text-row">{row.title}</div>
            {row.sub && <div className="mt-0.5 truncate text-sub text-muted">{row.sub}</div>}
          </div>
          <div className={cn('text-row tabular-nums', row.tone)}>{rubles(row.value)}</div>
        </div>)}
      </div>
    </Card>

    <SectionTitle>Вычеты и премии</SectionTitle>
    <Card>
      {my.loading
        ? <SkeletonRows rows={2}/>
        : !lines.length
          ? <EmptyState title="Вычетов нет" sub={`в ${period}`}/>
          : <List>
            {lines.map(line => <ListRow
              key={line.key}
              title={line.title}
              sub={line.sub}
              right={<span className={line.tone}>{line.right}</span>}
              align="start"
            />)}
          </List>}
    </Card>

    <SectionTitle>Выплаты</SectionTitle>
    <Card>
      {!my.payments.length
        ? <EmptyState
          title="Выплат пока нет"
          sub={settings?.payday ? `Ближайшая — ${dayjs(`${month}-01`).add(1, 'month').date(settings.payday).format('D MMMM')}` : undefined}
        />
        : <List>
          {my.payments.map(payment => <ListRow
            key={payment.id}
            title={payment.kind === 'ADVANCE' ? 'Аванс' : 'Выплата остатка'}
            sub={`${dayLabel(payment.date)} · за ${monthLabel((payment.accrualMonth ?? payment.date).slice(0, 7)).split(' ')[0].toLowerCase()}`}
            right={rubles(payment.amountKopecks)}
          />)}
        </List>}
    </Card>

    <Card className="mt-3">
      <List>
        <ListRow title="Мои удержания WB" chevron onClick={() => push('/me/money/deductions')}/>
      </List>
    </Card>
  </Screen>
}
