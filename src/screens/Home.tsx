import { Bell, Screen, FilterRow } from '../shared/kit/Screen'
import { Card, Hero, HeroTile, HeroTiles } from '../shared/kit/Card'
import { List, ListRow, Avatar, Dot } from '../shared/kit/ListRow'
import { SectionTitle } from '../shared/kit/Text'
import { ActionTile } from '../shared/kit/Button'
import { Chip, EmptyState, ErrorNote, SkeletonRows } from '../shared/kit/Misc'
import { IncomeChart } from '../shared/kit/Chart'
import { Fab } from '../shared/kit/TabBar'
import { c } from '../shared/kit/tokens'
import { rubles } from '../shared/money'
import { monthLabel } from '../shared/dates'
import { useMonthTotals } from '../features/money/useMonthTotals'
import { useAlerts } from '../features/home/useAlerts'
import { badgeOf } from '../entities/notifications'
import { useToday } from '../features/home/useToday'
import { useOrg } from '../app/OrgContext'
import { useNav } from '../app/nav'
import { useSheets } from '../app/sheets'

/**
 * Главная владельца: прибыль за месяц, из чего она сложилась, что требует внимания
 * и кто сегодня на точках. Порядок блоков — как в прототипе: сначала итог, потом причины.
 */
export default function Home() {
  const { month, pointId, pointName } = useOrg()
  const { push } = useNav()
  const { open } = useSheets()
  const totals = useMonthTotals()
  // Бейдж считает непрочитанное, а список «Требуют внимания» — все проблемы:
  // прочитанная дырка в графике никуда не делась, прятать её из списка нельзя.
  const { items: alerts, unread } = useAlerts()
  const today = useToday()

  const period = monthLabel(month).split(' ')[0]

  const tiles = [
    { label: 'Доход', value: totals.summary.income, color: c.tileIncome, metric: 'income' },
    { label: 'Расходы', value: totals.summary.expenses, color: c.tileExpense, metric: 'expenses' },
    { label: 'Зарплаты', value: totals.summary.payroll, color: c.tileSalary, metric: 'payroll' },
    { label: `Налог ${totals.taxRate}%`, value: totals.summary.tax, color: c.tileTax, metric: 'tax' },
  ]

  const quick = [
    { sign: '+', label: 'Добавить доход', tone: { bg: c.okTint2, fg: c.ok }, onClick: () => open('op', { kind: 'INCOME' }) },
    { sign: '−', label: 'Добавить расход', tone: { bg: c.badTint2, fg: c.badStrong }, onClick: () => open('op', { kind: 'EXPENSE' }) },
    { sign: 'WB', label: 'Добавить удержание', tone: { bg: c.accentTint, fg: c.accent }, onClick: () => open('newDed') },
    { sign: '₽', label: 'Выдать аванс', tone: { bg: c.infoTint2, fg: c.info }, onClick: () => open('payout', { kind: 'ADVANCE' }) },
  ]

  return <Screen
    filters={<FilterRow className="items-center">
      <Chip onClick={() => open('pvzPick')}>{pointId ? pointName(pointId) : 'Все ПВЗ'}</Chip>
      <Chip onClick={() => open('monthPick')}>{period}</Chip>
      <div className="ml-auto flex-none"><Bell count={badgeOf(unread.length)} onClick={() => open('notifs')}/></div>
    </FilterRow>}
  >
    {totals.error && <div className="mb-3"><ErrorNote error={totals.error}/></div>}

    <Hero
      label={`Чистая прибыль · ${period}`}
      value={totals.loading ? '—' : rubles(totals.profit)}
      note={`Доход ${rubles(totals.summary.income)} − расходы, зарплаты, налог и убытки WB`}
      onClick={() => push('/home/metric/profit')}
    >
      <HeroTiles>
        {tiles.map(tile => <HeroTile
          key={tile.metric}
          label={tile.label}
          value={rubles(tile.value)}
          color={tile.color}
          onClick={() => push(`/home/metric/${tile.metric}`)}
        />)}
      </HeroTiles>
    </Hero>

    <IncomeChart
      values={totals.incomeByDay}
      month={month}
      total={rubles(totals.summary.income)}
      format={rubles}
    />

    <SectionTitle count={alerts.length}>Требуют внимания</SectionTitle>
    <Card>
      {alerts.length === 0
        ? <EmptyState title="Всё спокойно" sub="Новые удержания и неоплаченные регулярные расходы появятся здесь"/>
        : <List>
          {alerts.map(alert => <ListRow
            key={alert.id}
            leading={<Dot tone={alert.tone}/>}
            align="start"
            title={alert.title}
            sub={alert.sub}
            chevron
            onClick={() => {
              if (alert.target.kind === 'deduction') push(`/money/ded/${alert.target.id}`)
              else if (alert.target.kind === 'recurring') push('/money/recurring')
              else if (alert.target.kind === 'payout') push(`/money?tab=pay${alert.target.advance ? '&adv=1' : ''}`)
              else if (alert.target.kind === 'request') open('req', { id: alert.target.id })
              else if (alert.target.kind === 'day') open('day', { pointId: alert.target.pointId, date: alert.target.date, pointLabel: pointName(alert.target.pointId) })
            }}
          />)}
        </List>}
    </Card>

    <SectionTitle>Сегодня на точках</SectionTitle>
    <Card>
      {today.loading
        ? <SkeletonRows rows={2}/>
        : today.rows.length === 0
          ? <EmptyState title="Пунктов выдачи пока нет" sub="Добавьте первый ПВЗ, чтобы вести график и деньги"/>
          : <List>
            {today.rows.map(row => <ListRow
              key={row.pointId}
              leading={<Avatar initials={row.initials} tone={row.onDuty ? 'accent' : 'bad'}/>}
              title={row.names}
              sub={`${row.pointName} · ${row.onDuty} на смене`}
              right={row.time}
              onClick={() => push(`/sched?d=${today.day}&pvz=${row.pointId}`)}
            />)}
          </List>}
    </Card>

    <SectionTitle>Быстрые действия</SectionTitle>
    <div className="grid grid-cols-2 gap-2">
      {quick.map(action => <ActionTile key={action.label} {...action}/>)}
    </div>

    <Fab onClick={() => open('quick')}/>
  </Screen>
}
