import dayjs from 'dayjs'
import type { PayMode, Shift } from '../../entities/types'
import type { PlannedCell } from '../../entities/slots'
import { dayIndex } from '../../entities/schedule'
import { weekStartOf } from '../../shared/dates'

export type Seats = 1 | 2
export interface TeamRule {
  pointId:string
  /** Где начинается очередь: первый день блока первого сотрудника (пары). */
  anchor:string
  /** С какого дня заполняем график. Неделя этого дня — образец; дни раньше не пишем. По умолчанию — anchor. */
  start?:string
  seats:Seats
  firstRun:number
  secondRun:number
  teams:[string[], string[]]
  payMode:PayMode
}
export interface DraftDay {
  required:Seats
  employeeIds:(string | null)[]
  payMode:PayMode
}
export type DraftWeek = Record<string, DraftDay>
export interface RepeatedWeek {
  days:DraftWeek
  cells:PlannedCell[]
}

const dateAt = (week:string, offset:number) => dayjs(week).add(offset, 'day').format('YYYY-MM-DD')

type Rotation = Pick<TeamRule, 'anchor' | 'firstRun' | 'secondRun'>

/** Чья очередь в этот день и какой это у него день подряд (с 1). Первый выходит в anchor. */
export function positionOf(rule:Rotation, date:string):{ group:0 | 1; day:number } {
  const first = Math.max(1, rule.firstRun), second = Math.max(1, rule.secondRun)
  const phase = ((dayIndex(date, rule.anchor) % (first + second)) + first + second) % (first + second)
  return phase < first ? { group: 0, day: phase + 1 } : { group: 1, day: phase - first + 1 }
}

/** Чья очередь в этот день: 0 — первый сотрудник (пара), 1 — второй. */
export const groupOfDay = (rule:Rotation, date:string):0 | 1 => positionOf(rule, date).group

/**
 * Обратная задача для переноса графика из тетради: «в этот день работает второй,
 * у него 2-й день подряд» → где начинается очередь.
 */
export function anchorFrom(start:string, group:0 | 1, day:number, firstRun:number):string {
  return dayjs(start).subtract(day - 1 + (group === 1 ? Math.max(1, firstRun) : 0), 'day').format('YYYY-MM-DD')
}

/** Неделя по правилу: первый сотрудник (пара) выходит в anchor, дальше они сменяют друг друга блоками дней. */
export function makeWeek(rule:TeamRule, week:string):DraftWeek {
  const result:DraftWeek = {}
  for (let offset = 0; offset < 7; offset += 1) {
    const date = dateAt(week, offset)
    const team = rule.teams[groupOfDay(rule, date)]
    result[date] = {
      required: rule.seats,
      employeeIds: Array.from({ length: rule.seats }, (_, index) => team[index] || null),
      payMode: rule.seats === 2 ? rule.payMode : 'FULL',
    }
  }
  return result
}

export const makeSampleWeek = (rule:TeamRule):DraftWeek => makeWeek(rule, weekStartOf(rule.start ?? rule.anchor))

/**
 * Выбранные недели заполняются по тому же чередованию, что и образец, без сбоя очереди.
 * Ручные правки образца (`edits`) повторяются в тот же день недели.
 * Дни раньше `from` (прошедшие) и раньше `rule.start` пропускаются: их смены не меняем.
 */
export function repeatSampleWeek(rule:TeamRule, edits:DraftWeek, targetWeeks:string[], monthLimit?:string, from?:string):RepeatedWeek {
  const sourceWeek = weekStartOf(rule.start ?? rule.anchor)
  const days:DraftWeek = {}
  for (const week of [sourceWeek, ...targetWeeks.filter(value => value !== sourceWeek)]) {
    const generated = makeWeek(rule, week)
    for (let offset = 0; offset < 7; offset += 1) {
      const targetDate = dateAt(week, offset)
      if (week !== sourceWeek && monthLimit && !targetDate.startsWith(monthLimit)) continue
      if (from && targetDate < from) continue
      if (rule.start && targetDate < rule.start) continue
      const source = edits[dateAt(sourceWeek, offset)] ?? generated[targetDate]
      days[targetDate] = { required: source.required, employeeIds: [...source.employeeIds], payMode: source.payMode }
    }
  }
  const cells:PlannedCell[] = Object.entries(days).flatMap(([date, day]) =>
    day.employeeIds.slice(0, day.required).flatMap((employeeId, slotIndex) =>
      employeeId ? [{ pointId: rule.pointId, date, slotIndex, employeeId, payMode: day.payMode }] : []))
  return { days, cells: cells.sort((a, b) => a.date.localeCompare(b.date) || a.slotIndex - b.slotIndex) }
}

/** Все недели месяца, кроме образца и уже прошедших целиком (до `from`). */
export function weeksOfMonth(sourceWeek:string, month:string, from?:string):string[] {
  const end = dayjs(`${month}-01`).endOf('month')
  const weeks:string[] = []
  for (let cursor = dayjs(weekStartOf(`${month}-01`)); !cursor.isAfter(end, 'day'); cursor = cursor.add(7, 'day')) {
    const week = cursor.format('YYYY-MM-DD')
    if (week === sourceWeek) continue
    if (from && cursor.add(6, 'day').format('YYYY-MM-DD') < from) continue
    weeks.push(week)
  }
  return weeks
}

export interface InferredRule {
  seats:Seats
  teams:[string[], string[]]
  firstRun:number
  secondRun:number
  /** Кто работает в день `before` и какой это у него день подряд. */
  startGroup:0 | 1
  startDay:number
  /** Полные блоки состава были разной длины: формат угадан по самому частому. */
  irregular:boolean
}

/**
 * Восстановить прежний график по сменам пункта, чтобы продолжить его с дня `before`.
 * Идём назад от вчерашнего дня: одинаковые составы подряд — блок; блоков должно быть
 * не меньше двух, и чередоваться могут только два состава. Иначе — `null`, правило задаёт человек.
 */
export function inferRule(shifts:Shift[], before:string, lookback = 42):InferredRule | null {
  const byDate = new Map<string, string[]>()
  for (const shift of shifts) {
    if (shift.status === 'REPLACED' || shift.status === 'NO_SHOW') continue
    const date = shift.workDate ?? dayjs(shift.startsAt).format('YYYY-MM-DD')
    if (date >= before) continue
    byDate.set(date, [...(byDate.get(date) ?? []), shift.employeeId])
  }
  const blocks:{ key:string; ids:string[]; length:number }[] = []
  const keys = new Set<string>()
  let cut = false
  for (let back = 1; back <= lookback; back += 1) {
    const ids = [...new Set(byDate.get(dayjs(before).subtract(back, 'day').format('YYYY-MM-DD')) ?? [])].sort()
    if (!ids.length) break
    const key = ids.join(',')
    // Третий состав — это уже прежний график: продолжаем то, что идёт сейчас.
    if (!keys.has(key) && keys.size === 2) { cut = true; break }
    keys.add(key)
    if (blocks[0]?.key === key) blocks[0].length += 1
    else blocks.unshift({ key, ids, length: 1 })
  }
  // После третьего состава нужно увидеть чередование (А-Б-А), а не два случайных дня.
  if (blocks.length < (cut ? 3 : 2) || keys.size !== 2 || blocks.some(block => block.ids.length > 2)) return null

  // Полный блок — с соседями с обеих сторон: крайние могли обрезаться окном или ещё идти.
  // Длина — самая частая среди полных (при ничьей бо́льшая): в тетради бывают разовые сдвиги.
  // Нет полного — берём длину полного блока напарника (графики обычно симметричны),
  // но не меньше самого длинного из увиденных.
  const fullLengths = (key:string) => blocks.filter((block, index) => block.key === key && index > 0 && index < blocks.length - 1).map(block => block.length)
  const fullRun = (key:string) => {
    const lengths = fullLengths(key)
    if (!lengths.length) return null
    const count = (length:number) => lengths.filter(value => value === length).length
    return lengths.reduce((best, length) => count(length) > count(best) || (count(length) === count(best) && length > best) ? length : best)
  }
  const runOf = (key:string, pair:string) => fullRun(key)
    ?? Math.max(fullRun(pair) ?? 0, ...blocks.filter(block => block.key === key).map(block => block.length))
  const last = blocks.at(-1)!
  const other = blocks[blocks.length - 2]
  const continues = last.length < runOf(last.key, other.key)
  return {
    seats: Math.max(last.ids.length, other.ids.length) === 2 ? 2 : 1,
    teams: [other.ids, last.ids],
    firstRun: runOf(other.key, last.key),
    secondRun: runOf(last.key, other.key),
    startGroup: continues ? 1 : 0,
    startDay: continues ? last.length + 1 : 1,
    irregular: [last.key, other.key].some(key => new Set(fullLengths(key)).size > 1),
  }
}
