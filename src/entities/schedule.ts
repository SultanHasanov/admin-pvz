import dayjs from 'dayjs'
import type { PayMode, Shift } from './types'

/** Один запланированный выход: сотрудник и день. Время необязательно — обычно берётся общее из шаблона. */
export interface PlannedSlot {
  employeeId:string
  date:string
  startsAt?:string
  endsAt?:string
  payMode?:PayMode
}

/** Дни недели в нумерации dayjs().day(): 0 — воскресенье, 6 — суббота. */
export interface WeekdayPattern { kind:'weekdays'; byEmployee:Record<string, number[]> }

export interface CycleParticipant { employeeId:string; offset:number }
/** «N через M»: сотрудники разнесены по фазам одного цикла длиной on + off. */
export interface CyclePattern { kind:'cycle'; on:number; off:number; anchor:string; participants:CycleParticipant[] }

export type SchedulePattern = WeekdayPattern | CyclePattern

/**
 * Разница в календарных днях. Считаем через startOf('day'), иначе переход на летнее время
 * даёт 23 или 25 часов, и деление на сутки уезжает на день.
 */
export const dayIndex = (date:string, anchor:string) =>
  Math.round((dayjs(date).startOf('day').valueOf() - dayjs(anchor).startOf('day').valueOf()) / 86_400_000)

/**
 * Сдвиги фаз по умолчанию: следующий выходит в день, когда предыдущий заканчивает.
 * Для 2/2 на двоих это даёт полное чередование, для 5/2 — три общих дня, и это правильно.
 * `even` разносит участников равномерно по циклу — нужно, когда людей больше, чем фаз.
 */
export const defaultOffsets = (count:number, on:number, off:number, even = false) => {
  const length = on + off
  return Array.from({ length: count }, (_, index) => even
    ? Math.round(index * length / count) % length
    : (index * on) % length)
}

const worksOnCycle = (pattern:CyclePattern, participant:CycleParticipant, date:string) => {
  const length = pattern.on + pattern.off
  // Диапазон применения может начинаться раньше якоря, поэтому приводим остаток к неотрицательному.
  const phase = ((dayIndex(date, pattern.anchor) - participant.offset) % length + length) % length
  return phase < pattern.on
}

/** Раскрывает график в список выходов на отрезке дат включительно с обеих сторон. */
export function generateSlots(pattern:SchedulePattern, from:string, to:string):PlannedSlot[] {
  const slots:PlannedSlot[] = []
  const last = dayjs(to)
  if (pattern.kind === 'cycle' && (pattern.on <= 0 || pattern.off < 0)) return slots

  for (let cursor = dayjs(from); !cursor.isAfter(last, 'day'); cursor = cursor.add(1, 'day')) {
    const date = cursor.format('YYYY-MM-DD')
    if (pattern.kind === 'weekdays') {
      for (const [employeeId, days] of Object.entries(pattern.byEmployee)) {
        if (days.includes(cursor.day())) slots.push({ employeeId, date })
      }
    } else {
      for (const participant of pattern.participants) {
        if (worksOnCycle(pattern, participant, date)) slots.push({ employeeId: participant.employeeId, date })
      }
    }
  }
  return slots
}

export interface ApplyPlan {
  toAdd:PlannedSlot[]
  /** День занят запланированной сменой — её можно переписать. */
  conflicts:{ slot:PlannedSlot; shift:Shift }[]
  /** Смена идёт, завершена или отменена — не трогаем никогда. */
  locked:{ slot:PlannedSlot; shift:Shift }[]
}

const slotKey = (employeeId:string, date:string) => `${employeeId}|${date}`
export const shiftDate = (shift:Shift) => dayjs(shift.startsAt).format('YYYY-MM-DD')

/**
 * Раскладывает выходы на «добавить», «переписать» и «не трогать».
 * В таблице смен нет уникального ограничения, поэтому дедупликация входа здесь —
 * единственное, что не даёт повторному применению графика наплодить дубли.
 */
export function planApply(slots:PlannedSlot[], existing:Shift[]):ApplyPlan {
  const byKey = new Map<string, Shift[]>()
  for (const shift of existing) {
    const key = slotKey(shift.employeeId, shiftDate(shift))
    byKey.set(key, [...(byKey.get(key) ?? []), shift])
  }

  const plan:ApplyPlan = { toAdd: [], conflicts: [], locked: [] }
  const seen = new Set<string>()

  for (const slot of slots) {
    const key = slotKey(slot.employeeId, slot.date)
    if (seen.has(key)) continue
    seen.add(key)

    const shifts = byKey.get(key) ?? []
    const blocking = shifts.find(shift => shift.status !== 'PLANNED')
    if (blocking) { plan.locked.push({ slot, shift: blocking }); continue }
    const planned = shifts[0]
    if (planned) plan.conflicts.push({ slot, shift: planned })
    else plan.toAdd.push(slot)
  }
  return plan
}

export interface WeekTimes { startsAt:string; endsAt:string; payMode:PayMode }

/**
 * Снимает график с уже заполненной недели, чтобы повторить его на других неделях.
 * Время берём у первой смены сотрудника: «Иванов 09:00–21:00, Петров 12:00–00:00»
 * должно пережить копирование, а не схлопнуться в один общий шаблон.
 */
export function deriveWeekPattern(weekStart:string, shifts:Shift[]):{ pattern:WeekdayPattern; times:Record<string, WeekTimes> } {
  const start = dayjs(weekStart).startOf('day')
  const end = start.add(6, 'day')
  const byEmployee:Record<string, number[]> = {}
  const times:Record<string, WeekTimes> = {}

  for (const shift of [...shifts].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
    const moment = dayjs(shift.startsAt)
    if (moment.isBefore(start, 'day') || moment.isAfter(end, 'day')) continue
    const days = byEmployee[shift.employeeId] ?? []
    if (!days.includes(moment.day())) byEmployee[shift.employeeId] = [...days, moment.day()]
    times[shift.employeeId] ??= {
      startsAt: moment.format('HH:mm'),
      endsAt: dayjs(shift.endsAt).format('HH:mm'),
      payMode: shift.payMode,
    }
  }

  return { pattern: { kind: 'weekdays', byEmployee }, times }
}

/** Подставляет в выходы personal время сотрудника, если оно снято с недели-образца. */
export const withTimes = (slots:PlannedSlot[], times:Record<string, WeekTimes>) =>
  slots.map(slot => times[slot.employeeId] ? { ...slot, ...times[slot.employeeId] } : slot)
