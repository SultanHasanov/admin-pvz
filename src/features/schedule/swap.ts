import dayjs from 'dayjs'
import type { Shift } from '../../entities/types'

const dateOf = (shift:Shift) => shift.workDate ?? dayjs(shift.startsAt).format('YYYY-MM-DD')
const isActive = (shift:Shift) => shift.status !== 'REPLACED' && shift.status !== 'NO_SHOW'
const shiftDay = (date:string, days:number) => dayjs(date).add(days, 'day').format('YYYY-MM-DD')

export interface Substitute {
  employeeId:string
  /** Уже стоит в этот день — на каком ПВЗ. Такого не предлагаем. */
  busyAt?:string
  /** Сколько смен на этом пункте за две недели до и после: кто здесь работает постоянно. */
  regular:number
  /** Работает накануне или на следующий день — выйдет без выходного. */
  workedBefore:boolean
  workedAfter:boolean
  /** Ближайшая его смена на этом пункте после дня замены, в которую отсутствующий свободен: можно поменяться. */
  swapShift?:Shift
}

/**
 * Кем заменить сотрудника в день `date` на пункте. Первыми — свободные в этот день и чаще
 * всех работающие здесь (напарник по графику 2/2), среди них — отдохнувшие накануне.
 *
 * `pointShifts` — смены пункта за ±14 дней, `dayShifts` — смены этого дня на всех пунктах.
 */
export function rankSubstitutes({ date, absentId, staffIds, pointShifts, dayShifts }:{
  date:string
  absentId:string
  staffIds:string[]
  pointShifts:Shift[]
  dayShifts:Shift[]
}):Substitute[] {
  const active = pointShifts.filter(isActive)
  const worksOn = (employeeId:string, day:string) => active.some(shift => shift.employeeId === employeeId && dateOf(shift) === day)
  const result = staffIds.filter(id => id !== absentId).map(employeeId => {
    const busy = dayShifts.find(shift => isActive(shift) && shift.employeeId === employeeId)
    const swapShift = active
      .filter(shift => shift.employeeId === employeeId && dateOf(shift) > date && dateOf(shift) <= shiftDay(date, 14))
      .sort((a, b) => dateOf(a).localeCompare(dateOf(b)))
      .find(shift => !worksOn(absentId, dateOf(shift)))
    return {
      employeeId,
      busyAt: busy?.pickupPointId,
      regular: active.filter(shift => shift.employeeId === employeeId).length,
      workedBefore: worksOn(employeeId, shiftDay(date, -1)),
      workedAfter: worksOn(employeeId, shiftDay(date, 1)),
      swapShift,
    }
  })
  const tired = (row:Substitute) => Number(row.workedBefore) + Number(row.workedAfter)
  return result.sort((a, b) => Number(!!a.busyAt) - Number(!!b.busyAt) || b.regular - a.regular || tired(a) - tired(b))
}
