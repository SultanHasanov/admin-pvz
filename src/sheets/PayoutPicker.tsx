import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, TextButton } from '../shared/kit/Button'
import { SkeletonRows } from '../shared/kit/Misc'
import { Card } from '../shared/kit/Card'
import { keys } from '../services/queries'
import { listTransactions } from '../services/finance'
import { PointPayouts } from '../features/money/PointPayouts'
import { useOrg } from '../app/OrgContext'
import { PointButton } from './PointButton'
import { Segmented } from '../shared/kit/Segmented'
import { IconSettings } from '../shared/kit/icons'
import { getIncomeSchedule } from '../services/incomeSchedule'
import { schedulePeriodsOfMonth, type IncomePeriodMode } from '../entities/payouts'
import { useSheets } from '../app/sheets'

/**
 * Новый доход: выбрать пункт и нажать на его период выплаты за месяц. Сумма вписывается
 * в конкретный период — так недели и месяц не накладываются друг на друга.
 */
export function PayoutPicker({ pointId: initialPoint, onOther }:{ pointId?:string; onOther:() => void }) {
  const { points, month, pointId: selected, defaultPointId } = useOrg()
  const { open } = useSheets()
  const active = points.filter(point => !point.archivedAt)
  // Пункт из шапки — первым: владелец уже выбрал, по какому пункту вписывает.
  const [pointId, setPointId] = useState(initialPoint || selected || defaultPointId || active[0]?.id || '')
  const point = active.find(item => item.id === pointId)
  const settings = useQuery({ queryKey: keys.incomeSchedule, queryFn: getIncomeSchedule })
  const modes:IncomePeriodMode[] = [
    ...(settings.data?.weeklyEnabled !== false ? ['WEEKLY' as const] : []),
    ...(settings.data?.customEnabled ? ['CUSTOM' as const] : []),
  ]
  const [mode, setMode] = useState<IncomePeriodMode>('WEEKLY')
  const activeMode = modes.includes(mode) ? mode : modes[0] ?? 'WEEKLY'

  const entries = useQuery({
    queryKey: keys.transactions(month, pointId),
    queryFn: () => listTransactions(month, pointId),
    enabled: Boolean(pointId),
  })

  const value = settings.data ?? { weeklyEnabled:true, customEnabled:false, customDays:[10,25] }
  return <>
    <div className="mb-3 flex items-center justify-between gap-2">
      {modes.length > 1
        ? <Segmented value={activeMode} options={[{ value: 'WEEKLY', label: 'По неделям' }, { value: 'CUSTOM', label: 'По датам' }]} onChange={setMode}/>
        : <div className="text-row font-semibold">{activeMode === 'CUSTOM' ? 'По датам' : 'По неделям'}</div>}
      <Button variant="quiet" className="!p-2.5 !text-sub" icon={<IconSettings size={17}/>} aria-label="Настроить график доходов" onClick={() => open('setIncomeSchedule')}>Настроить</Button>
    </div>
    <PointButton value={pointId} onPick={setPointId}/>
    <div className="mb-2 text-sub text-muted">Нажмите на период и впишите сумму выплаты.</div>
    {point && (entries.isLoading || settings.isLoading
      ? <Card><SkeletonRows rows={4}/></Card>
      : <PointPayouts point={point} month={month} entries={entries.data ?? []}
        periods={schedulePeriodsOfMonth(value, activeMode, month)}
        scheduleLabel={activeMode === 'CUSTOM' ? `Выплаты ${value.customDays.join(', ')} числа` : 'Каждый понедельник'}/>)}
    <div className="mt-1 text-center"><TextButton onClick={onOther}>Другой доход: хранение, прочее</TextButton></div>
  </>
}
