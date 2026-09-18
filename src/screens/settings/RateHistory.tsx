import { useParams } from 'react-router-dom'
import { Screen, Header } from '../../shared/kit/Screen'
import { Card } from '../../shared/kit/Card'
import { List, ListRow, Pill } from '../../shared/kit/ListRow'
import { Button } from '../../shared/kit/Button'
import { EmptyState, SkeletonRows } from '../../shared/kit/Misc'
import { rubles } from '../../shared/money'
import { dayLabel, today } from '../../shared/dates'
import { useMonthTotals } from '../../features/money/useMonthTotals'
import { useNav } from '../../app/nav'
import { useSheets } from '../../app/sheets'

/**
 * История ставки: с какой даты какая действовала. Прошлые смены считаются по ставке
 * на свою дату, поэтому история — это и объяснение, откуда в расчёте разные суммы.
 */
export default function RateHistory() {
  const { id = '' } = useParams()
  const { back, canBack } = useNav()
  const { open } = useSheets()
  const totals = useMonthTotals()
  const employee = totals.staff.find(person => person.id === id)
  const rules = totals.rules
    .filter(rule => rule.employeeId === id)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))
  const now = today()
  // Действующая — самая поздняя из уже наступивших; будущие показаны отдельно.
  const currentId = rules.find(rule => rule.effectiveFrom <= now)?.id

  const header = <Header title="История ставки" onBack={canBack ? back : undefined}/>
  if (totals.loading) return <Screen header={header}><Card><SkeletonRows rows={3}/></Card></Screen>
  if (!employee) return <Screen header={header}><Card><EmptyState title="Сотрудник не найден"/></Card></Screen>

  return <Screen header={header}>
    <div className="mb-3 text-row leading-[1.45] text-muted">
      {employee.fullName}. Смены считаются по ставке, действовавшей на дату смены — прошлые расчёты не пересчитываются.
    </div>

    <Card>
      {!rules.length
        ? <EmptyState title="Ставка не задана" sub="Смены этого сотрудника пока не начисляются"/>
        : <List>
          {rules.map((rule, index) => {
            const next = rules[index - 1]
            const label = rule.effectiveFrom > now ? 'с даты' : rule.id === currentId ? 'сейчас' : 'прошлые смены'
            return <ListRow
              key={rule.id}
              title={`${rubles(rule.rateKopecks)} / ${rule.paymentType === 'HOURLY' ? 'час' : rule.paymentType === 'SALARY' ? 'месяц' : 'смена'}`}
              sub={`с ${dayLabel(rule.effectiveFrom)}${next ? ` по ${dayLabel(next.effectiveFrom)}` : ''}`}
              right={<Pill tone={rule.id === currentId ? 'accent' : 'neutral'}>{label}</Pill>}
            />
          })}
        </List>}
    </Card>

    <Button block className="mt-3" onClick={() => open('rate', { employeeId: id })}>Изменить ставку</Button>
  </Screen>
}
