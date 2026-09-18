import { useParams } from 'react-router-dom'
import { Screen, Header } from '../shared/kit/Screen'
import { Card, Hero } from '../shared/kit/Card'
import { Avatar, List, ListRow } from '../shared/kit/ListRow'
import { SectionTitle } from '../shared/kit/Text'
import { EmptyState, SkeletonRows } from '../shared/kit/Misc'
import { initials } from '../shared/shifts'
import { rubles } from '../shared/money'
import { dayLabel, monthLabel } from '../shared/dates'
import { useMonthTotals } from '../features/money/useMonthTotals'
import { useSalarySheets } from '../features/money/useSalarySheets'
import { useOrg } from '../app/OrgContext'
import { useNav } from '../app/nav'

type Key = 'profit' | 'income' | 'expenses' | 'payroll' | 'tax'

/**
 * Расчёт показателя с главной: из чего сложилась цифра. Прототип открывает этот экран
 * тапом по любой сумме на тёмной карточке — без него цифра остаётся необъяснимой.
 */
export default function Metric() {
  const { key = 'profit' } = useParams<{ key:Key }>()
  const { month, pointName } = useOrg()
  const { back, canBack } = useNav()
  const totals = useMonthTotals()
  const salary = useSalarySheets(totals)

  const period = monthLabel(month).split(' ')[0].toLowerCase()
  const header = <Header title="Расчёт" onBack={canBack ? back : undefined}/>

  if (totals.loading) return <Screen header={header}><Card><SkeletonRows rows={4}/></Card></Screen>

  const operations = (kind:'INCOME' | 'EXPENSE') => totals.transactions
    .filter(entry => entry.kind === kind)
    .sort((a, b) => b.amountKopecks - a.amountKopecks)

  const views:Record<Key, { label:string; value:number; note:string; body:React.ReactNode }> = {
    profit: {
      label: `Чистая прибыль · ${period}`,
      value: totals.profit,
      note: 'Доход минус расходы, зарплаты, налог и убытки по WB',
      body: <Card>
        <List>
          <ListRow title="Доход" right={rubles(totals.summary.income)}/>
          <ListRow title="Расходы" right={<span className="text-bad">−{rubles(totals.summary.expenses)}</span>}/>
          <ListRow title="Зарплаты" right={<span className="text-bad">−{rubles(totals.summary.payroll)}</span>}/>
          <ListRow title={`Налог ${totals.taxRate}%`} right={<span className="text-bad">−{rubles(totals.summary.tax)}</span>}/>
          <ListRow title="Убытки по WB" right={<span className="text-bad">−{rubles(totals.summary.confirmedLosses)}</span>}/>
          <ListRow title={<span className="font-semibold">Итого</span>} right={<span className="font-semibold">{rubles(totals.profit)}</span>}/>
        </List>
      </Card>,
    },
    income: {
      label: `Доход · ${period}`,
      value: totals.summary.income,
      note: `Операций: ${operations('INCOME').length}`,
      body: <OperationList rows={operations('INCOME')} pointName={pointName} sign="+"/>,
    },
    expenses: {
      label: `Расходы · ${period}`,
      value: totals.summary.expenses,
      note: `Операций: ${operations('EXPENSE').length}`,
      body: <OperationList rows={operations('EXPENSE')} pointName={pointName} sign="−"/>,
    },
    payroll: {
      label: `Зарплаты · ${period}`,
      value: totals.summary.payroll,
      note: `Прогноз с запланированными сменами — ${rubles(totals.forecast)}`,
      body: <Card>
        {salary.sheets.length === 0
          ? <EmptyState title="Начислений нет"/>
          : <List>
            {salary.sheets.map(sheet => <ListRow
              key={sheet.employeeId}
              leading={<Avatar initials={initials(sheet.fullName)}/>}
              title={sheet.fullName}
              sub={`${sheet.shifts} смен`}
              right={rubles(sheet.accrued)}
            />)}
          </List>}
      </Card>,
    },
    tax: {
      label: `Налог · ${period}`,
      value: totals.summary.tax,
      note: `${totals.taxRate}% от дохода ${rubles(totals.summary.income)}`,
      body: <Card>
        <List>
          <ListRow title="Доход за месяц" right={rubles(totals.summary.income)}/>
          <ListRow title="Ставка налога" right={`${totals.taxRate}%`}/>
          <ListRow title={<span className="font-semibold">К уплате</span>} right={<span className="font-semibold">{rubles(totals.summary.tax)}</span>}/>
        </List>
      </Card>,
    },
  }

  const view = views[key as Key] ?? views.profit

  return <Screen header={header}>
    <Hero label={view.label} value={rubles(view.value)} note={view.note}/>
    <SectionTitle>Из чего сложилось</SectionTitle>
    {view.body}
  </Screen>
}

function OperationList({ rows, pointName, sign }:{
  rows:ReturnType<typeof useMonthTotals>['transactions']
  pointName:(id:string | null | undefined) => string
  sign:'+' | '−'
}) {
  if (!rows.length) return <Card><EmptyState title="Операций за месяц нет"/></Card>
  return <Card>
    <List>
      {rows.map(operation => <ListRow
        key={`${operation.kind}-${operation.id}`}
        title={operation.category}
        sub={`${dayLabel(operation.date)} · ${pointName(operation.pickupPointId)}`}
        right={`${sign}${rubles(operation.amountKopecks)}`}
      />)}
    </List>
  </Card>
}
