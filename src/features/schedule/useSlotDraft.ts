import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import type { PayMode, Shift } from '../../entities/types'
import { defaultOffsets, type SchedulePattern } from '../../entities/schedule'
import { generateCells, isAbsent, planCells, slotsForDay, type Absence, type SlotPlan } from '../../entities/slots'
import { monthEnd, monthStart, weekStartOf } from '../../shared/dates'
import { countByEmployee, previewEntries } from './board'

export type SlotMode = 'cycle' | 'weekdays'

/** Правило одного места: как чередуются смены и кто в очереди. */
export interface SlotDraft {
  mode:SlotMode
  on:number
  off:number
  /** Дни недели в нумерации dayjs: 0 — воскресенье. */
  weekdays:number[]
  /** Очередь: порядок важен, он задаёт фазы цикла. */
  employeeIds:string[]
}

const emptySlot = ():SlotDraft => ({ mode: 'cycle', on: 2, off: 2, weekdays: [1, 2, 3, 4, 5], employeeIds: [] })

/** Готовые циклы: «два через два» и соседи закрывают почти все графики ПВЗ. */
export const QUICK_CYCLES = [[2, 2], [3, 3], [5, 2], [1, 3]] as const

export type Period = 'week' | 'fourWeeks' | 'month' | 'custom'

/**
 * Черновик графика с местами на смене.
 *
 * Главное отличие от прежнего мастера: правило задаётся не на точку, а на каждое место.
 * «Двое по 2/2 на первом месте и двое подменных на втором» — это два независимых
 * правила, и только так получается прототипный график «будни один, выходные два».
 */
export function useSlotDraft({ month, pointId, slotCount, shifts, times, absences = [] }:{
  month:string
  pointId:string
  /** Сколько мест на точке по умолчанию — начальное число правил. */
  slotCount:number
  /** Существующие смены: по ним считаются конфликты и предпросмотр. */
  shifts:Shift[]
  times:{ startsAt:string; endsAt:string; payMode:PayMode }
  /** Отпуска: в эти дни человека не ставим, место остаётся пустым и попадает в дырки. */
  absences?:Absence[]
}) {
  const today = dayjs().format('YYYY-MM-DD')
  const weekStart = weekStartOf(month === today.slice(0, 7) ? today : monthStart(month))

  const [slots, setSlots] = useState<SlotDraft[]>(() => Array.from({ length: Math.max(1, slotCount) }, emptySlot))
  const [active, setActive] = useState(0)
  const [period, setPeriod] = useState<Period>('month')
  const [from, setFrom] = useState(weekStart)
  const [to, setTo] = useState(dayjs(monthEnd(month)).subtract(1, 'day').format('YYYY-MM-DD'))
  const [strategy, setStrategy] = useState<'skip' | 'replace'>('skip')

  const ranges:Record<Exclude<Period, 'custom'>, { from:string; to:string }> = {
    week: { from: weekStart, to: dayjs(weekStart).add(6, 'day').format('YYYY-MM-DD') },
    fourWeeks: { from: weekStart, to: dayjs(weekStart).add(27, 'day').format('YYYY-MM-DD') },
    month: { from: monthStart(month), to: dayjs(monthEnd(month)).subtract(1, 'day').format('YYYY-MM-DD') },
  }

  const setPeriodPreset = (next:Period) => {
    setPeriod(next)
    if (next !== 'custom') { setFrom(ranges[next].from); setTo(ranges[next].to) }
  }

  const patch = (index:number, change:Partial<SlotDraft>) =>
    setSlots(current => current.map((slot, position) => position === index ? { ...slot, ...change } : slot))

  const setSlotCount = (count:number) => setSlots(current => count > current.length
    ? [...current, ...Array.from({ length: count - current.length }, emptySlot)]
    : current.slice(0, count))

  /** Очередь меняется тапом: второй тап убирает человека, порядок задаёт фазу цикла. */
  const toggleEmployee = (index:number, employeeId:string) => setSlots(current => current.map((slot, position) => {
    if (position !== index) return slot
    const inQueue = slot.employeeIds.includes(employeeId)
    return {
      ...slot,
      employeeIds: inQueue
        ? slot.employeeIds.filter(id => id !== employeeId)
        : [...slot.employeeIds, employeeId],
    }
  }))

  const toggleWeekday = (index:number, day:number) => setSlots(current => current.map((slot, position) => {
    if (position !== index) return slot
    return {
      ...slot,
      weekdays: slot.weekdays.includes(day) ? slot.weekdays.filter(item => item !== day) : [...slot.weekdays, day],
    }
  }))

  const plans = useMemo<SlotPlan[]>(() => slots.map((slot, slotIndex) => {
    const pattern:SchedulePattern = slot.mode === 'cycle'
      ? {
        kind: 'cycle', on: slot.on, off: slot.off, anchor: from,
        participants: slot.employeeIds.map((employeeId, index) => ({
          employeeId,
          offset: defaultOffsets(slot.employeeIds.length, slot.on, slot.off)[index],
        })),
      }
      : {
        kind: 'weekdays',
        byEmployee: Object.fromEntries(slot.employeeIds.map(employeeId => [employeeId, slot.weekdays])),
      }
    return { slotIndex, pattern }
  }), [slots, from])

  // Число мест берём из черновика, а не из настроек точки: мастер и задаёт это число.
  const config = { def: slots.length }

  // Сначала без отпусков, потом вычитаем их сами: так видно, сколько выходов съел отпуск.
  // Без этого числа мастер поставил бы меньше смен, чем обещает очередь, и это
  // выглядело бы как ошибка генератора.
  const allCells = useMemo(
    () => pointId ? generateCells({ plans, pointId, from, to, config: { def: slots.length } }) : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plans, pointId, from, to, slots.length])
  const cells = useMemo(
    () => allCells.filter(cell => !isAbsent(absences, cell.employeeId, cell.date)),
    [allCells, absences])
  const skippedForVacation = allCells.length - cells.length

  const plan = useMemo(() => planCells(cells, shifts), [cells, shifts])
  const counts = useMemo(() => countByEmployee(cells), [cells])
  const preview = useMemo(() => previewEntries(shifts, cells), [shifts, cells])

  /** Дни, в которые правило ставит меньше людей, чем мест: очередь пустая или короткая. */
  const gaps = useMemo(() => {
    const byDate = new Map<string, number>()
    for (const cell of cells) byDate.set(cell.date, (byDate.get(cell.date) ?? 0) + 1)
    let count = 0
    for (let cursor = dayjs(from); !cursor.isAfter(dayjs(to), 'day'); cursor = cursor.add(1, 'day')) {
      const date = cursor.format('YYYY-MM-DD')
      if ((byDate.get(date) ?? 0) < slotsForDay(config, date)) count += 1
    }
    return count
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells, from, to, slots.length])

  return {
    slots, active, setActive, setSlotCount, patch, toggleEmployee, toggleWeekday,
    period, setPeriod: setPeriodPreset, from, setFrom, to, setTo,
    strategy, setStrategy,
    cells, plan, counts, preview, gaps, skippedForVacation,
    times,
    ready: cells.length > 0 && Boolean(pointId),
    /** Правила в виде, пригодном для сохранения шаблоном. */
    plans,
  }
}
