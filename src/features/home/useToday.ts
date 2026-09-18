import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import type { Shift } from '../../entities/types'
import { initials } from '../../shared/shifts'
import { timeLabel, today } from '../../shared/dates'
import { keys } from '../../services/queries'
import { listShiftsRange } from '../../services/shifts'
import { listEmployees } from '../../services/employees'
import { useOrg } from '../../app/OrgContext'

export interface TodayRow {
  pointId:string
  pointName:string
  initials:string
  names:string
  time:string
  /** Сколько человек на смене и сколько ожидалось. */
  onDuty:number
  shifts:Shift[]
}

/**
 * «Сегодня на точках»: по строке на каждый активный ПВЗ, даже если на нём никого нет —
 * пустая точка и есть главная новость этого блока.
 *
 * Запрос идёт на один день, а не берётся из месячной выборки: главную открывают
 * и когда в шапке выбран прошлый месяц.
 */
export function useToday() {
  const { points, pointId } = useOrg()
  const day = today()

  const [shifts, employees] = useQueries({
    queries: [
      { queryKey: keys.shiftsRange(day, day, pointId), queryFn: () => listShiftsRange(day, day, pointId || undefined) },
      { queryKey: keys.employees(), queryFn: () => listEmployees() },
    ],
  })

  const rows = useMemo(() => {
    const nameOf = (id:string) => employees.data?.find(employee => employee.id === id)?.fullName ?? 'Сотрудник'
    const visible = points.filter(point => !pointId || point.id === pointId)

    return visible.map<TodayRow>(point => {
      const onPoint = (shifts.data ?? []).filter(shift => shift.pickupPointId === point.id && shift.status !== 'NO_SHOW')
      const names = onPoint.map(shift => nameOf(shift.employeeId))
      return {
        pointId: point.id,
        pointName: point.name,
        initials: names.length ? names.map(initials).join('·') : '—',
        names: names.join(', ') || 'Нет сотрудника',
        time: onPoint.length ? `${timeLabel(onPoint[0].startsAt)}–${timeLabel(onPoint[0].endsAt)}` : 'смена не занята',
        onDuty: onPoint.length,
        shifts: onPoint,
      }
    })
  }, [points, pointId, shifts.data, employees.data])

  return { rows, day, loading: shifts.isLoading || employees.isLoading }
}
