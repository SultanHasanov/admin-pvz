import dayjs from 'dayjs'
import type { Shift, PayMode } from '../../entities/types'
import type { PlannedCell } from '../../entities/slots'
import { generateSlots } from '../../entities/schedule'
import { weekStartOf } from '../../shared/dates'

export type ComposerMethod = 'weekdays' | 'cycle' | 'copyWeek' | 'copyMonth'
export interface ComposerRule {
  method:ComposerMethod
  pointId:string
  from:string
  to:string
  firstId:string
  secondId:string
  firstDays:number[]
  secondDays:number[]
  firstRun:number
  secondRun:number
  rest:number
  together:boolean
  payMode:PayMode
  sourceWeek:string
  sourceMonth:string
  targetWeeks:string[]
}

const dateOf = (shift:Shift) => shift.workDate ?? dayjs(shift.startsAt).format('YYYY-MM-DD')
const timeOf = (shift:Shift) => ({
  startsAt: dayjs(shift.startsAt).format('HH:mm'),
  endsAt: dayjs(shift.endsAt).format('HH:mm'),
  payMode: shift.payMode,
})

export const weeksTouchingMonth = (month:string) => {
  const start = dayjs(weekStartOf(`${month}-01`))
  const end = dayjs(`${month}-01`).endOf('month')
  const weeks:string[] = []
  for (let cursor = start; !cursor.isAfter(end, 'day'); cursor = cursor.add(7, 'day')) weeks.push(cursor.format('YYYY-MM-DD'))
  return weeks
}

/** Повторяем фактическую раскладку дней и мест, включая время и половину оплаты. */
export function composeCells(rule:ComposerRule, source:Shift[]):PlannedCell[] {
  if (!rule.pointId) return []
  const cells:PlannedCell[] = []
  const add = (date:string, employeeId:string, slotIndex:number, extra:Partial<PlannedCell> = {}) => {
    if (!employeeId) return
    cells.push({ pointId: rule.pointId, date, employeeId, slotIndex, payMode: rule.payMode, ...extra })
  }

  if (rule.method === 'cycle' && rule.secondId && !rule.together) {
    for (const slot of generateSlots({ kind: 'alternatingBlocks', anchor: rule.from, firstId: rule.firstId, secondId: rule.secondId, firstDays: rule.firstRun, secondDays: rule.secondRun }, rule.from, rule.to)) add(slot.date, slot.employeeId, 0)
  } else if (rule.method === 'weekdays' || rule.method === 'cycle') {
    for (let cursor = dayjs(rule.from); !cursor.isAfter(dayjs(rule.to), 'day'); cursor = cursor.add(1, 'day')) {
      const date = cursor.format('YYYY-MM-DD')
      if (rule.method === 'weekdays') {
        if (rule.firstDays.includes(cursor.day())) add(date, rule.firstId, 0)
        if (rule.secondDays.includes(cursor.day())) add(date, rule.secondId, rule.firstDays.includes(cursor.day()) ? 1 : 0)
      } else {
        const elapsed = cursor.diff(dayjs(rule.from), 'day')
        const first = Math.max(1, rule.firstRun)
        const second = Math.max(0, rule.rest)
        const phase = elapsed % (first + second)
        if (phase < first) {
          add(date, rule.firstId, 0)
          if (rule.together) add(date, rule.secondId, 1)
        } else if (rule.secondId && !rule.together) add(date, rule.secondId, 0)
      }
    }
  } else if (rule.method === 'copyWeek') {
    const sourceWeek = dayjs(rule.sourceWeek)
    for (const shift of source) {
      const offset = dayjs(dateOf(shift)).diff(sourceWeek, 'day')
      if (shift.pickupPointId !== rule.pointId || offset < 0 || offset > 6 || shift.status === 'REPLACED' || shift.status === 'NO_SHOW') continue
      for (const week of rule.targetWeeks) add(dayjs(week).add(offset, 'day').format('YYYY-MM-DD'), shift.employeeId, shift.slotIndex ?? 0, timeOf(shift))
    }
  } else {
    const sourceWeeks = weeksTouchingMonth(rule.sourceMonth)
    const targetWeeks = weeksTouchingMonth(rule.to.slice(0, 7))
    const targetMonth = rule.to.slice(0, 7)
    for (let index = 0; index < targetWeeks.length; index += 1) {
      const fromWeek = dayjs(sourceWeeks[index % sourceWeeks.length])
      const toWeek = dayjs(targetWeeks[index])
      for (const shift of source) {
        const offset = dayjs(dateOf(shift)).diff(fromWeek, 'day')
        if (shift.pickupPointId !== rule.pointId || offset < 0 || offset > 6 || shift.status === 'REPLACED' || shift.status === 'NO_SHOW') continue
        const date = toWeek.add(offset, 'day').format('YYYY-MM-DD')
        if (date.startsWith(targetMonth)) add(date, shift.employeeId, shift.slotIndex ?? 0, timeOf(shift))
      }
    }
  }
  return cells.sort((a, b) => a.date.localeCompare(b.date) || a.slotIndex - b.slotIndex)
}
