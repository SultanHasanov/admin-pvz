import { useQuery } from '@tanstack/react-query'
import { Screen, Header } from '../../shared/kit/Screen'
import { Card } from '../../shared/kit/Card'
import { Button } from '../../shared/kit/Button'
import { List, ListRow } from '../../shared/kit/ListRow'
import { SectionTitle } from '../../shared/kit/Text'
import { EmptyState, ErrorNote, SkeletonRows } from '../../shared/kit/Misc'
import { rubles } from '../../shared/money'
import { currentMonth } from '../../shared/dates'
import { isCurrent, SUGGESTED_FIXED_COSTS } from '../../entities/fixedCosts'
import { keys } from '../../services/queries'
import { listRecurringExpenses } from '../../services/finance'
import { useOrg } from '../../app/OrgContext'
import { useNav } from '../../app/nav'
import { useSheets } from '../../app/sheets'

/**
 * Постоянные расходы: аренда, камеры, уборка. Заводятся один раз и сами входят в расходы
 * каждого месяца — подтверждать ничего не нужно. Разовые покупки записываются операциями.
 */
export default function Recurring() {
  const { pointId, pointName } = useOrg()
  const { back, canBack } = useNav()
  const { open } = useSheets()

  const recurring = useQuery({ queryKey: keys.recurring, queryFn: listRecurringExpenses })
  const month = currentMonth()
  // С фильтром по ПВЗ показываем его расходы и общие: общие тоже про этот пункт.
  const rows = (recurring.data ?? [])
    .filter(cost => isCurrent(cost, month) && (!pointId || !cost.pickupPointId || cost.pickupPointId === pointId))
    .sort((a, b) => (a.pickupPointId ?? '').localeCompare(b.pickupPointId ?? '') || a.category.localeCompare(b.category, 'ru'))
  const total = rows.reduce((sum, cost) => sum + cost.amountKopecks, 0)
  const suggestions = SUGGESTED_FIXED_COSTS.filter(name => !rows.some(cost => cost.category.toLowerCase() === name.toLowerCase()))

  return <Screen header={<Header title="Постоянные расходы" onBack={canBack ? back : undefined}/>}>
    <div className="mb-3 text-row leading-[1.45] text-muted">
      Считаются в расходах каждого месяца сами. Разовые покупки — чайник, стул — добавляйте как обычный расход.
    </div>

    {recurring.error && <div className="mb-3"><ErrorNote error={recurring.error}/></div>}
    {recurring.isLoading
      ? <Card><SkeletonRows rows={3}/></Card>
      : <Card>
        {!rows.length
          ? <EmptyState title="Постоянных расходов нет" sub="Добавьте аренду, камеры, уборку — дальше они посчитаются сами"/>
          : <List>
            {rows.map(cost => <ListRow
              key={cost.id}
              title={cost.category}
              sub={cost.pickupPointId ? pointName(cost.pickupPointId) : 'Все ПВЗ · общий, в итоге по всем пунктам'}
              right={rubles(cost.amountKopecks)}
              rightSub="в месяц"
              chevron
              onClick={() => open('newRecur', { cost })}
            />)}
            <ListRow title={<span className="font-semibold">Итого в месяц</span>} right={<span className="font-semibold">{rubles(total)}</span>}/>
          </List>}
      </Card>}

    {!recurring.isLoading && !!suggestions.length && <>
      <SectionTitle>Часто добавляют</SectionTitle>
      <div className="flex flex-wrap gap-2">
        {suggestions.map(name => <button
          key={name}
          type="button"
          className="tap rounded-sm border border-line bg-surface px-3 py-[7px] text-act font-medium"
          onClick={() => open('newRecur', { title: name })}
        >+ {name}</button>)}
      </div>
    </>}

    <Button block variant="secondary" className="mt-4" onClick={() => open('newRecur')}>Добавить постоянный расход</Button>
  </Screen>
}
