import dayjs from 'dayjs'
import type { PayMode } from '../../entities/types'
import type { PlannedCell } from '../../entities/slots'
import { dayIndex } from '../../entities/schedule'
import { weekStartOf } from '../../shared/dates'

export type Seats = 1 | 2
export interface TeamRule {
  pointId:string
  anchor:string
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

/** Команда А выходит в anchor; дальше А и Б сменяют друг друга блоками дней. */
export function makeSampleWeek(rule:TeamRule):DraftWeek {
  const week = weekStartOf(rule.anchor)
  const result:DraftWeek = {}
  const first = Math.max(1, rule.firstRun), second = Math.max(1, rule.secondRun)
  for (let offset = 0; offset < 7; offset += 1) {
    const date = dateAt(week, offset)
    const phase = ((dayIndex(date, rule.anchor) % (first + second)) + first + second) % (first + second)
    const team = rule.teams[phase < first ? 0 : 1]
    result[date] = {
      required: rule.seats,
      employeeIds: Array.from({ length: rule.seats }, (_, index) => team[index] || null),
      payMode: rule.seats === 2 ? rule.payMode : 'FULL',
    }
  }
  return result
}

/** Образец переносится по дням недели точно, в том числе ручные замены и пустые места. */
export function repeatSampleWeek(rule:TeamRule, sample:DraftWeek, targetWeeks:string[], monthLimit?:string):RepeatedWeek {
  const sourceWeek = weekStartOf(rule.anchor)
  const days:DraftWeek = {}
  for (const week of [sourceWeek, ...targetWeeks.filter(value => value !== sourceWeek)]) {
    for (let offset = 0; offset < 7; offset += 1) {
      const sourceDate = dateAt(sourceWeek, offset)
      const targetDate = dateAt(week, offset)
      if (week !== sourceWeek && monthLimit && !targetDate.startsWith(monthLimit)) continue
      const source = sample[sourceDate]
      if (!source) continue
      days[targetDate] = { required: source.required, employeeIds: [...source.employeeIds], payMode: source.payMode }
    }
  }
  const cells:PlannedCell[] = Object.entries(days).flatMap(([date, day]) =>
    day.employeeIds.slice(0, day.required).flatMap((employeeId, slotIndex) =>
      employeeId ? [{ pointId: rule.pointId, date, slotIndex, employeeId, payMode: day.payMode }] : []))
  return { days, cells: cells.sort((a, b) => a.date.localeCompare(b.date) || a.slotIndex - b.slotIndex) }
}

/** Выбрать все недели после образца, которые затрагивают указанный месяц. */
export function remainingWeeksOfMonth(sourceWeek:string, month:string):string[] {
  const first = dayjs(weekStartOf(`${month}-01`))
  const end = dayjs(`${month}-01`).endOf('month')
  const weeks:string[] = []
  const next = dayjs(sourceWeek).add(7, 'day')
  for (let cursor = first.isAfter(next, 'day') ? first : next; !cursor.isAfter(end, 'day'); cursor = cursor.add(7, 'day')) {
    weeks.push(cursor.format('YYYY-MM-DD'))
  }
  return weeks
}
