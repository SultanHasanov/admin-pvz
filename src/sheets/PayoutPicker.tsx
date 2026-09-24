import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { TextButton } from '../shared/kit/Button'
import { SkeletonRows } from '../shared/kit/Misc'
import { Card } from '../shared/kit/Card'
import { keys } from '../services/queries'
import { listTransactions } from '../services/finance'
import { PointPayouts } from '../features/money/PointPayouts'
import { useOrg } from '../app/OrgContext'
import { PointButton } from './PointButton'

/**
 * Новый доход: выбрать пункт и нажать на его период выплаты за месяц. Сумма вписывается
 * в конкретный период — так недели и месяц не накладываются друг на друга.
 */
export function PayoutPicker({ pointId: initialPoint, onOther }:{ pointId?:string; onOther:() => void }) {
  const { points, month, pointId: selected, defaultPointId } = useOrg()
  const active = points.filter(point => !point.archivedAt)
  // Пункт из шапки — первым: владелец уже выбрал, по какому пункту вписывает.
  const [pointId, setPointId] = useState(initialPoint || selected || defaultPointId || active[0]?.id || '')
  const point = active.find(item => item.id === pointId)

  const entries = useQuery({
    queryKey: keys.transactions(month, pointId),
    queryFn: () => listTransactions(month, pointId),
    enabled: Boolean(pointId),
  })

  return <>
    <PointButton value={pointId} onPick={setPointId}/>
    <div className="mb-2 text-sub text-muted">Нажмите на период и впишите сумму выплаты.</div>
    {point && (entries.isLoading
      ? <Card><SkeletonRows rows={4}/></Card>
      : <PointPayouts point={point} month={month} entries={entries.data ?? []}/>)}
    <div className="mt-1 text-center"><TextButton onClick={onOther}>Другой доход: хранение, прочее</TextButton></div>
  </>
}
