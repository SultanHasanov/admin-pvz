import dayjs from 'dayjs'
import type { Employee, Shift } from '../../entities/types'
import { shiftDate, type PlannedSlot } from '../../entities/schedule'

/**
 * Чистые преобразования графика: из плоского списка смен — в то, чем рисуют сетки.
 * Вынесены из компонентов, чтобы одни и те же расчёты обслуживали и старую страницу,
 * и новые экраны, и чтобы их можно было проверить тестами без рендера.
 */

/** Одна отметка в клетке дня: существующая смена или предпросмотр будущей. */
export interface DayEntry { employeeId:string; shift?:Shift; preview?:boolean }

/** Ключ ячейки «сотрудник × день». */
export const cellKey = (employeeId:string, date:string) => `${employeeId}|${date}`

/** Смены в статусе «идёт», «завершена» и прочих правят из списка, а не переключателем в сетке. */
export const isLocked = (shift?:Shift) => Boolean(shift && shift.status !== 'PLANNED')

/** Смены по ячейкам «сотрудник × день» — раскладка недельного редактора. */
export function buildBoard(shifts:Shift[]):Map<string, Shift[]> {
  const map = new Map<string, Shift[]>()
  for (const shift of shifts) {
    const key = cellKey(shift.employeeId, shiftDate(shift))
    map.set(key, [...(map.get(key) ?? []), shift])
  }
  return map
}

/** Смены по дням — раскладка месячной сетки. */
export function buildEntries(shifts:Shift[]):Map<string, DayEntry[]> {
  const map = new Map<string, DayEntry[]>()
  for (const shift of shifts) {
    const date = shiftDate(shift)
    map.set(date, [...(map.get(date) ?? []), { employeeId: shift.employeeId, shift }])
  }
  return map
}

/**
 * Предпросмотр графика поверх существующих смен: что уже стоит — обычной отметкой,
 * что только планируется — полой. День, где сотрудник уже выходит, вторым не помечаем.
 */
export function previewEntries(shifts:Shift[], slots:PlannedSlot[]):Map<string, DayEntry[]> {
  const map = buildEntries(shifts)
  for (const slot of slots) {
    const existing = map.get(slot.date) ?? []
    if (existing.some(entry => entry.employeeId === slot.employeeId)) continue
    map.set(slot.date, [...existing, { employeeId: slot.employeeId, preview: true }])
  }
  return map
}

/** Сколько смен приходится на каждого сотрудника — итог мастера графика. */
export function countByEmployee(slots:PlannedSlot[]):Map<string, number> {
  const map = new Map<string, number>()
  for (const slot of slots) map.set(slot.employeeId, (map.get(slot.employeeId) ?? 0) + 1)
  return map
}

/**
 * Дни, в которые по графику выходят двое и больше. Для 5/2 это норма, а не ошибка:
 * цикл не делится на смены поровну — поэтому возвращаем число, а не запрет.
 */
export function overlapDays(slots:PlannedSlot[]):number {
  const perDay = new Map<string, number>()
  for (const slot of slots) perDay.set(slot.date, (perDay.get(slot.date) ?? 0) + 1)
  return [...perDay.values()].filter(count => count > 1).length
}

/** Сколько дней недели закрыты хотя бы одной сменой и сколько пустых. */
export function weekCoverage(days:dayjs.Dayjs[], staff:Employee[], board:Map<string, Shift[]>) {
  let shifts = 0
  let empty = 0
  for (const day of days) {
    const date = day.format('YYYY-MM-DD')
    const busy = staff.filter(employee => board.get(cellKey(employee.id, date))?.length).length
    shifts += busy
    if (!busy) empty += 1
  }
  return { shifts, empty }
}

/** Дни месяца, в которых нет ни одной смены. */
export function emptyDays(month:string, entriesByDate:Map<string, DayEntry[]>):number {
  const first = dayjs(`${month}-01`)
  const days = first.daysInMonth()
  let empty = 0
  for (let index = 0; index < days; index += 1) {
    const date = first.add(index, 'day').format('YYYY-MM-DD')
    if (!entriesByDate.get(date)?.length) empty += 1
  }
  return empty
}
