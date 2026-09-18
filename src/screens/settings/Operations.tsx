import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Screen, Header, FilterRow } from '../../shared/kit/Screen'
import { Card } from '../../shared/kit/Card'
import { List, ListRow } from '../../shared/kit/ListRow'
import { Segmented } from '../../shared/kit/Segmented'
import { Chip, EmptyState, ErrorNote, SkeletonRows } from '../../shared/kit/Misc'
import { Fab } from '../../shared/kit/TabBar'
import type { EntryKind } from '../../entities/types'
import { rubles } from '../../shared/money'
import { dayLabel, monthLabel } from '../../shared/dates'
import { keys } from '../../services/queries'
import { listTransactions } from '../../services/finance'
import { useOrg } from '../../app/OrgContext'
import { useNav } from '../../app/nav'
import { useSheets } from '../../app/sheets'

type Filter = 'all' | EntryKind

/**
 * Журнал операций месяца: доходы и расходы вперемешку, свежие сверху. Тап открывает
 * ту же шторку, что и добавление, — поправить сумму или удалить ошибочную запись.
 */
export default function Operations() {
  const { month, pointId, pointName } = useOrg()
  const { back, canBack } = useNav()
  const { open } = useSheets()
  const [filter, setFilter] = useState<Filter>('all')
  const [category, setCategory] = useState<string>()

  const transactions = useQuery({
    queryKey: keys.transactions(month, pointId),
    queryFn: () => listTransactions(month, pointId || undefined),
  })

  const byKind = (transactions.data ?? []).filter(row => filter === 'all' || row.kind === filter)
  const categories = useMemo(() => [...new Set(byKind.map(row => row.category))].sort((a, b) => a.localeCompare(b, 'ru')), [byKind])
  const rows = byKind
    .filter(row => !category || row.category === category)
    .sort((a, b) => b.date.localeCompare(a.date))
  const total = rows.reduce((sum, row) => sum + (row.kind === 'INCOME' ? row.amountKopecks : -row.amountKopecks), 0)

  return <Screen
    header={<Header title="Операции" onBack={canBack ? back : undefined}/>}
    filters={<FilterRow>
      <Chip onClick={() => open('pvzPick')}>{pointId ? pointName(pointId) : 'Все ПВЗ'}</Chip>
      <Chip onClick={() => open('monthPick')}>{monthLabel(month).split(' ')[0]}</Chip>
      {category && <Chip active onClick={() => setCategory(undefined)}>{category} ✕</Chip>}
    </FilterRow>}
  >
    <Segmented
      className="mb-3"
      value={filter}
      onChange={value => { setFilter(value); setCategory(undefined) }}
      options={[{ value: 'all', label: 'Все' }, { value: 'INCOME', label: 'Доходы' }, { value: 'EXPENSE', label: 'Расходы' }]}
    />

    {!category && categories.length > 1 && <div className="mb-3 flex flex-wrap gap-2">
      {categories.map(name => <Chip key={name} onClick={() => setCategory(name)}>{name}</Chip>)}
    </div>}

    {transactions.error && <div className="mb-3"><ErrorNote error={transactions.error}/></div>}

    <Card>
      {transactions.isLoading
        ? <SkeletonRows rows={5}/>
        : !rows.length
          ? <EmptyState title="Операций нет" sub="За выбранный месяц ничего не записано"/>
          : <List>
            {rows.map(row => <ListRow
              key={`${row.kind}-${row.id}`}
              leading={<div className={row.kind === 'INCOME'
                ? 'flex h-8 w-8 flex-none items-center justify-center rounded-full bg-ok-tint-2 font-semibold text-ok'
                : 'flex h-8 w-8 flex-none items-center justify-center rounded-full bg-bad-tint-2 font-semibold text-bad-strong'}
              >{row.kind === 'INCOME' ? '+' : '−'}</div>}
              title={row.category}
              sub={[pointName(row.pickupPointId), dayLabel(row.date), row.description].filter(Boolean).join(' · ')}
              right={<span className={row.kind === 'INCOME' ? 'text-ok' : undefined}>
                {row.kind === 'INCOME' ? '+' : '−'}{rubles(row.amountKopecks)}
              </span>}
              align="start"
              chevron
              onClick={() => open('op', { entry: row })}
            />)}
          </List>}
    </Card>

    {rows.length > 0 && <div className="mt-2 text-sub text-muted">
      Итого по списку: <span className="tabular-nums">{total >= 0 ? '+' : '−'}{rubles(Math.abs(total))}</span>
    </div>}

    <Fab onClick={() => open('quick')}/>
  </Screen>
}
