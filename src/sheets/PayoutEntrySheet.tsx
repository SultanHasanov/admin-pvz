import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '../shared/kit/Button'
import { MoneyField } from '../shared/kit/Field'
import { EmptyState } from '../shared/kit/Misc'
import { parseMoney, rubles } from '../shared/money'
import { matchPeriods, PAYOUT_CATEGORY, periodById } from '../entities/payouts'
import { keys, scope } from '../services/queries'
import { createTransaction, listTransactions } from '../services/finance'
import { useWrite } from '../features/write'
import { useOrg } from '../app/OrgContext'
import { useSheets } from '../app/sheets'

/**
 * Одна сумма за один период выплаты пункта. Категорию, дату и описание ставит период.
 * Если за период уже вписано — второй раз не пишем, а ведём в саму запись.
 */
export default function PayoutEntrySheet({ pointId, periodId, close }:{ pointId:string; periodId:string; close:() => void }) {
  const { points, pointName } = useOrg()
  const { replace } = useSheets()
  const [amount, setAmount] = useState('')
  const point = points.find(item => item.id === pointId)
  const period = periodById(periodId)
  const month = period?.date.slice(0, 7) ?? ''

  // Свежие записи месяца: период мог заполниться в другой вкладке, пока шторка была открыта.
  const entries = useQuery({
    queryKey: keys.transactions(month, pointId),
    queryFn: () => listTransactions(month, pointId),
    enabled: Boolean(period),
  })
  const existing = period && point
    ? matchPeriods([period], entries.data ?? [], pointId, period.marketplace).matched[0].entry
    : undefined

  const kopecks = parseMoney(amount)
  const write = useWrite({
    run: async () => {
      const fresh = await listTransactions(month, pointId)
      if (matchPeriods([period!], fresh, pointId, period!.marketplace).matched[0].entry) throw new Error('За этот период уже вписано — откройте запись')
      await createTransaction({
        kind: 'INCOME', pickupPointId: pointId, category: PAYOUT_CATEGORY[period!.marketplace],
        amountKopecks: kopecks, date: period!.date, description: period!.description,
      })
    },
    invalidate: [scope.transactions],
    done: `${period?.title} · ${rubles(kopecks)} · ${pointName(pointId)}`,
    onDone: close,
  })

  if (!period || !point) return <EmptyState title="Период не найден"/>

  return <>
    <div className="mb-3">
      <div className="text-row font-semibold">{point.name} · {period.title}</div>
      <div className="mt-0.5 text-sub text-muted">{period.sub}</div>
    </div>

    {existing
      ? <>
        <div className="text-row">Уже вписано: <span className="font-semibold">{rubles(existing.amountKopecks)}</span></div>
        <div className="mt-1 text-sub text-muted">Исправить или удалить можно в самой записи.</div>
        <Button block variant="secondary" className="mt-3" onClick={() => replace('op', { entry: existing })}>Открыть запись</Button>
      </>
      : <>
        <MoneyField label="Сумма выплаты" value={amount} onValueChange={setAmount}/>
        <Button block disabled={entries.isLoading || kopecks <= 0 || write.isPending} onClick={() => write.mutate(undefined as void)}>
          Записать выплату
        </Button>
      </>}
  </>
}
