import type { PickupPoint, Transaction } from '../../entities/types'
import { matchPeriods, periodsOfMonth, periodState } from '../../entities/payouts'
import { Card } from '../../shared/kit/Card'
import { TextButton } from '../../shared/kit/Button'
import { List, ListRow } from '../../shared/kit/ListRow'
import { cn } from '../../shared/kit/cn'
import { rubles } from '../../shared/money'
import { dayLabel, today } from '../../shared/dates'
import { useSheets } from '../../app/sheets'

/**
 * Выплаты пункта за месяц: у WB — понедельники, у Ozon — окна 10–15 и 20–25.
 * Вписанный период открывает запись, пустой — ввод суммы, будущий нажать нельзя.
 * Записи вне периодов (прежняя сумма «за месяц», повтор) показаны отдельно: это
 * почти наверняка дубль, и владелец решает сам, удалять ли.
 */
export function PointPayouts({ point, month, entries }:{ point:PickupPoint; month:string; entries:Transaction[] }) {
  const { open } = useSheets()
  const marketplace = point.marketplace ?? 'WB'
  const now = today()
  const { matched, stray } = matchPeriods(periodsOfMonth(marketplace, month), entries, point.id, marketplace)
  const total = [...matched.flatMap(row => row.entry ? [row.entry] : []), ...stray].reduce((sum, entry) => sum + entry.amountKopecks, 0)

  return <Card className="mb-3">
    <div className="flex items-start gap-3 border-b border-line-soft px-[15px] py-3">
      <div className="min-w-0 flex-1">
        <div className="truncate text-row font-semibold">{point.name}</div>
        <div className="mt-0.5 text-sub text-muted">{marketplace === 'OZON' ? 'Ozon · 10–15 и 20–25 числа' : 'WB · каждый понедельник'}</div>
      </div>
      <div className="text-row font-semibold tabular-nums">{rubles(total)}</div>
    </div>
    <List>
      {matched.map(row => {
        const state = periodState(row, now)
        return <ListRow
          key={row.period.id}
          title={<span className={cn(state === 'future' && 'text-muted')}>{row.period.title}</span>}
          sub={row.period.sub}
          right={state === 'done'
            ? `+${rubles(row.entry!.amountKopecks)}`
            : state === 'due' ? <span className="font-medium text-bad">вписать</span> : <span className="text-muted-soft">впереди</span>}
          chevron={state !== 'future'}
          onClick={state === 'future' ? undefined : () => row.entry
            ? open('op', { entry: row.entry })
            : open('payoutEntry', { pointId: point.id, periodId: row.period.id })}
        />
      })}
    </List>
    {matched.some(row => !row.entry) && <div className="border-t border-line-soft px-[15px] py-2.5">
      <TextButton onClick={() => open('payoutMonth', { pointId: point.id, month })}>Вписать весь месяц одной суммой</TextButton>
    </div>}
    {!!stray.length && <div className="border-t border-line-soft">
      <div className="px-[15px] pt-3 text-sub font-medium text-warn">Не по периодам — проверьте, возможно, это дубль</div>
      <List>
        {stray.map(entry => <ListRow
          key={entry.id}
          title={entry.description || entry.category}
          sub={dayLabel(entry.date)}
          right={`+${rubles(entry.amountKopecks)}`}
          chevron
          onClick={() => open('op', { entry })}
        />)}
      </List>
    </div>}
  </Card>
}
