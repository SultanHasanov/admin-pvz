import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '../shared/kit/Button'
import { MoneyField } from '../shared/kit/Field'
import { EmptyState } from '../shared/kit/Misc'
import { parseMoney, rubles } from '../shared/money'
import { monthLabel } from '../shared/dates'
import { matchPeriods, PAYOUT_CATEGORY, periodsOfMonth, splitMonth } from '../entities/payouts'
import { keys, scope } from '../services/queries'
import { createTransaction, listTransactions } from '../services/finance'
import { useWrite } from '../features/write'
import { useOrg } from '../app/OrgContext'

/**
 * Весь месяц одной суммой. К вписанным неделям она не прибавляется: вычитаем уже
 * вписанное, остаток поровну раскладываем по пустым периодам — как среднее за неделю.
 */
export default function PayoutMonthSheet({ pointId, month, close }:{ pointId:string; month:string; close:() => void }) {
  const { points } = useOrg()
  const point = points.find(item => item.id === pointId)
  const marketplace = point?.marketplace ?? 'WB'
  const [amount, setAmount] = useState('')

  const entries = useQuery({ queryKey: keys.transactions(month, pointId), queryFn: () => listTransactions(month, pointId) })
  const { matched } = matchPeriods(periodsOfMonth(marketplace, month), entries.data ?? [], pointId, marketplace)
  const entered = matched.reduce((sum, row) => sum + (row.entry?.amountKopecks ?? 0), 0)
  const kopecks = parseMoney(amount)
  const split = kopecks > 0 ? splitMonth(matched, kopecks) : null
  const plan = Array.isArray(split) ? split : null

  const write = useWrite({
    run: async () => {
      // Перечитываем: период мог заполниться, пока шторка была открыта.
      const fresh = matchPeriods(periodsOfMonth(marketplace, month), await listTransactions(month, pointId), pointId, marketplace).matched
      const rows = splitMonth(fresh, kopecks)
      if (!Array.isArray(rows)) throw new Error(rows.error)
      for (const row of rows) {
        await createTransaction({
          kind: 'INCOME', pickupPointId: pointId, category: PAYOUT_CATEGORY[marketplace], amountKopecks: row.amountKopecks,
          date: row.period.date, description: `${row.period.description} · из суммы за месяц`,
        })
      }
    },
    invalidate: [scope.transactions],
    done: `${monthLabel(month)} · ${rubles(kopecks)} разложено по периодам`,
    onDone: close,
  })

  if (!point) return <EmptyState title="Пункт не найден"/>

  return <>
    <div className="mb-3">
      <div className="text-row font-semibold">{point.name} · {monthLabel(month).toLowerCase()}</div>
      <div className="mt-0.5 text-sub leading-[1.4] text-muted">
        Впишите, сколько всего пришло за месяц. {entered > 0 ? `Уже вписано ${rubles(entered)} — остаток` : 'Сумма'} разделится поровну на {marketplace === 'WB' ? 'невписанные недели' : 'невписанные выплаты'}.
      </div>
    </div>

    <MoneyField
      label="Итого за месяц"
      value={amount}
      onValueChange={setAmount}
      error={split && !Array.isArray(split) ? split.error : undefined}
    />

    {plan && <div className="mb-3 rounded-md bg-surface-soft px-3 py-2 text-sub">
      {plan.map(row => <div key={row.period.id} className="flex justify-between gap-2 py-0.5">
        <span className="text-muted">{row.period.title}</span>
        <span className="font-medium tabular-nums">{rubles(row.amountKopecks)}</span>
      </div>)}
    </div>}

    <Button block disabled={!plan || entries.isLoading || write.isPending} onClick={() => write.mutate(undefined as void)}>
      Записать по периодам
    </Button>
  </>
}
