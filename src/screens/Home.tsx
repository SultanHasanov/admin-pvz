import { Bell, Screen, FilterRow } from '../shared/kit/Screen'
import { Card, Hero, HeroTile, HeroTiles } from '../shared/kit/Card'
import { List, ListRow, Avatar, Dot } from '../shared/kit/ListRow'
import { SectionTitle } from '../shared/kit/Text'
import { ActionTile, Button, TextButton } from '../shared/kit/Button'
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
import { SetupStrip } from '../features/setup/SetupStrip'
import { SetupNext } from '../features/setup/SetupNext'
import { useSetup } from '../features/setup/useSetup'
import { useOrg } from '../app/OrgContext'
import { useNav } from '../app/nav'
import { useSheets } from '../app/sheets'

/**
 * Главная владельца: прибыль за месяц, из чего она сложилась, что требует внимания
 * и кто сегодня на точках. Порядок блоков — как в прототипе: сначала итог, потом причины.
 */
export default function Home() {
  const { month, pointId, pointName, pointTitle } = useOrg()
  const { push } = useNav()
  const { open } = useSheets()
  const totals = useMonthTotals()
  // Бейдж считает непрочитанное, а список «Требуют внимания» — все проблемы:
  // прочитанная дырка в графике никуда не делась, прятать её из списка нельзя.
  const { items: alerts, unread } = useAlerts()
  const today = useToday()
  const setup = useSetup()

  // Новый владелец: в месяце ни операции, ни смены. Нули и пустой график ему ничего
  // не говорят — вместо узкой полоски показываем следующий шаг настройки крупно.
  const empty = !totals.loading && !totals.transactions.length && !totals.shifts.length
  const guide = empty && setup.available && !setup.hidden && setup.next

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
      <Chip onClick={() => open('pvzPick')}>{pointTitle}</Chip>
      <Chip onClick={() => open('monthPick')}>{period}</Chip>
      <div className="ml-auto flex-none"><Bell count={badgeOf(unread.length)} onClick={() => open('notifs')}/></div>
    </FilterRow>}
  >
    {totals.error && <div className="mb-3"><ErrorNote error={totals.error}/></div>}

    {guide
      ? <div className="mb-3"><SetupNext
        step={guide}
        label={`Настройка пункта · ${setup.done} из ${setup.total}`}
        footer={<div className="mt-1 text-center"><TextButton onClick={() => push('/home/setup')}>Все задания</TextButton></div>}
      /></div>
      : <SetupStrip/>}

    <Hero
      label={`Чистая прибыль · ${period}`}
      value={totals.loading ? '—' : rubles(totals.profit)}
      // Налог выключен — прибыль без него, и об этом надо сказать, а не молча показывать «Налог 0%».
      note={totals.taxRate
        ? `Доход ${rubles(totals.summary.income)} − расходы, зарплаты, налог и убытки WB`
        : `Доход ${rubles(totals.summary.income)} − расходы, зарплаты и убытки WB · налог не учитывается`}
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

    {!empty && <IncomeChart
      values={totals.incomeByDay}
      month={month}
      total={rubles(totals.summary.income)}
      format={rubles}
    />}

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
              else if (alert.target.kind === 'income') open('payoutEntry', { pointId: alert.target.pointId, periodId: alert.target.periodId })
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
          ? <EmptyState
            title="Пунктов выдачи пока нет"
            sub="Добавьте первый ПВЗ, чтобы вести график и деньги"
            action={<Button variant="secondary" onClick={() => push('/more/points/new')}>Добавить пункт</Button>}
          />
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
