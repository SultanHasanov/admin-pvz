import { useMemo } from 'react'
import dayjs from 'dayjs'
import { findHoles, type Absence, type Hole } from '../../entities/slots'
import { monthEnd, monthStart, today } from '../../shared/dates'
import { useOrg } from '../../app/OrgContext'
import { useMonthTotals } from '../money/useMonthTotals'

export interface PointHole extends Hole { pointName:string }

/**
 * Дни, в которые точка останется без сотрудника.
 *
 * Считаем только от сегодняшнего дня и вперёд: прошлое уже не изменить, а красить
 * закрытые дни в тревожный цвет значит утопить настоящую проблему в шуме.
 *
 * Отпуск освобождает место: человек стоит в графике, но не выйдет, и день считается
 * незакрытым с причиной `absence` — «нужна замена», а не «забыли поставить».
 */
export function useHoles(totals:ReturnType<typeof useMonthTotals>, absences:Absence[] = []) {
  const { points, pointId, pointName } = useOrg()

  return useMemo(() => {
    const from = totals.month === today().slice(0, 7) ? today() : monthStart(totals.month)
    const to = dayjs(monthEnd(totals.month)).subtract(1, 'day').format('YYYY-MM-DD')
    if (from > to) return []

    return points
      .filter(point => !point.archivedAt && (!pointId || point.id === pointId))
      .flatMap(point => findHoles({
        pointId: point.id,
        config: point.slotConfig,
        shifts: totals.shifts,
        from,
        to,
        absences,
      }).map<PointHole>(hole => ({ ...hole, pointName: pointName(point.id) })))
      .sort((first, second) => first.date.localeCompare(second.date))
  }, [points, pointId, pointName, totals.shifts, totals.month, absences])
}

/** Дырки, сгруппированные по точке: «Ленина 12: нет сотрудника 19 и 21 сент». */
export function groupHoles(holes:PointHole[]) {
  const byPoint = new Map<string, PointHole[]>()
  for (const hole of holes) byPoint.set(hole.pointId, [...(byPoint.get(hole.pointId) ?? []), hole])

  return [...byPoint.values()].map(group => {
    const dates = [...new Set(group.map(hole => hole.date))]
    const short = dates.slice(0, 3).map(date => dayjs(date).date()).join(', ')
    return {
      pointId: group[0].pointId,
      pointName: group[0].pointName,
      firstDate: dates[0],
      count: dates.length,
      // «19, 21, 23 сент и ещё 4» — точные числа важнее общего «есть проблемы».
      label: `${short}${dates.length > 3 ? ` и ещё ${dates.length - 3}` : ''} ${dayjs(dates[0]).format('MMM')}`,
      onlyPartial: group.every(hole => hole.occupied > 0),
      absence: group.some(hole => hole.reason === 'absence'),
    }
  })
}
