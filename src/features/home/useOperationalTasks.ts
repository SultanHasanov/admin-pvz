import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { findHoles } from '../../entities/slots'
import { scheduledIncomeReminder } from '../../entities/payouts'
import { weekStartOf, today } from '../../shared/dates'
import { listShiftsRange } from '../../services/shifts'
import { listTransactions } from '../../services/finance'
import { getIncomeSchedule } from '../../services/incomeSchedule'
import { keys } from '../../services/queries'
import { useOrg } from '../../app/OrgContext'

export type OperationalTask =
  | { id:string; kind:'income'; title:string; sub:string; pointId:string; periodId:string }
  | { id:string; kind:'schedule'; title:string; sub:string; pointId:string; date:string }

export function useOperationalTasks() {
  const { points, pointId, pointName } = useOrg()
  const now = today(), from = weekStartOf(now), to = dayjs(from).add(13, 'day').format('YYYY-MM-DD')
  const thisMonth = now.slice(0, 7), lastMonth = dayjs(now).subtract(1, 'month').format('YYYY-MM')
  const [shifts, incomeNow, incomeBefore, settings] = useQueries({ queries: [
    { queryKey: keys.shiftsRange(from, to, pointId), queryFn: () => listShiftsRange(from, to, pointId || undefined) },
    { queryKey: keys.transactions(thisMonth, ''), queryFn: () => listTransactions(thisMonth) },
    { queryKey: keys.transactions(lastMonth, ''), queryFn: () => listTransactions(lastMonth) },
    { queryKey: keys.incomeSchedule, queryFn: getIncomeSchedule },
  ] })
  const tasks = useMemo<OperationalTask[]>(() => {
    if (!settings.data) return []
    const active = points.filter(point => !point.archivedAt && (!pointId || point.id === pointId))
    const reminder = scheduledIncomeReminder({ today: now, points: active, entries: [...(incomeBefore.data ?? []), ...(incomeNow.data ?? [])], settings: settings.data })
    const result:OperationalTask[] = reminder ? [{ id:`income-${reminder.refId}`, kind:'income', title:reminder.title, sub:reminder.sub, pointId:reminder.pointId, periodId:reminder.periodId }] : []
    for (const point of active) {
      const holes = findHoles({ pointId:point.id, config:point.slotConfig, shifts:shifts.data ?? [], from:now, to })
      if (!holes.length) continue
      const first = holes[0], count = holes.length
      result.push({ id:`schedule-${point.id}-${first.date}`, kind:'schedule', pointId:point.id, date:first.date,
        title:`${pointName(point.id)}: дополните график`, sub:`${count} незакрытых ${count === 1 ? 'день' : count < 5 ? 'дня' : 'дней'} до ${dayjs(to).format('D MMM')}` })
    }
    return result
  }, [settings.data, points, pointId, incomeBefore.data, incomeNow.data, shifts.data, now, to, pointName])
  return { tasks }
}
