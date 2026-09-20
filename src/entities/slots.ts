import dayjs from 'dayjs'
import type { Shift, SlotConfig } from './types'
import { generateSlots, type PlannedSlot, type SchedulePattern } from './schedule'

/**
 * Места на смене.
 *
 * У точки задано, сколько человек должно выходить в день: `{def:1}` — один,
 * `{def:1, wd:{4:2,5:2,6:2}}` — по одному, но с пятницы по воскресенье по два.
 * У каждого места своя очередь сотрудников, поэтому «двое по 2/2 на первом месте
 * и двое подменных на втором» — это два независимых правила, а не одно общее.
 *
 * Ключи `wd` — дни недели от понедельника (0) до воскресенья (6): так «выходные»
 * читаются как 4,5,6, а не как 5,6,0.
 *
 * ВНИМАНИЕ: в `WeekdayPattern` из schedule.ts нумерация другая — dayjs, с воскресенья.
 * Две нумерации живут рядом осознанно (одна пришла из прототипа и базы, другая из dayjs),
 * и переводить между ними можно только через `mondayIndex`.
 */
export type { SlotConfig }

export const DEFAULT_SLOTS:SlotConfig = { def: 1 }

/** День недели от понедельника: 0 — пн, 6 — вс. */
export const mondayIndex = (date:string) => (dayjs(date).day() + 6) % 7

/** Сколько человек должно выйти на точку в этот день. */
export function slotsForDay(config:SlotConfig | null | undefined, date:string):number {
  const settings = config ?? DEFAULT_SLOTS
  const dayOverride = settings.dates?.[date]
  const exception = settings.wd?.[mondayIndex(date)]
  return Math.max(1, dayOverride ?? exception ?? settings.def)
}

/** Отсутствие сотрудника: отпуск, больничный или согласованная заявка. */
export interface Absence { employeeId:string; from:string; to:string }

export const isAbsent = (absences:Absence[], employeeId:string, date:string) =>
  absences.some(absence => absence.employeeId === employeeId && date >= absence.from && date <= absence.to)

/** Правило для одного места на смене. */
export interface SlotPlan { slotIndex:number; pattern:SchedulePattern }

/** Ячейка графика: точка, день и место на смене. */
export interface Cell { pointId:string; date:string; slotIndex:number }

export interface PlannedCell extends PlannedSlot, Cell {}

/**
 * Раскрывает правила по местам в список выходов.
 *
 * Отсутствующих не ставим: в отпуске человек не выходит, и место остаётся пустым —
 * это и есть сигнал «нужна замена», который потом ловит `findHoles`.
 * Лишние выходы за пределами числа мест в этот день отбрасываем: правило могло быть
 * задано на два места, а в будни точка работает с одним.
 */
export function generateCells({ plans, pointId, from, to, config, absences = [] }:{
  plans:SlotPlan[]
  pointId:string
  from:string
  to:string
  config?:SlotConfig | null
  absences?:Absence[]
}):PlannedCell[] {
  const cells:PlannedCell[] = []
  const taken = new Set<string>()

  for (const plan of plans) {
    for (const slot of generateSlots(plan.pattern, from, to)) {
      if (plan.slotIndex >= slotsForDay(config, slot.date)) continue
      if (isAbsent(absences, slot.employeeId, slot.date)) continue

      // Одно место — один человек, и один человек — одна смена в день, даже если
      // он попал в очереди двух разных мест.
      const cellKey = `${slot.date}|${plan.slotIndex}`
      const personKey = `${slot.date}|${slot.employeeId}`
      if (taken.has(cellKey) || taken.has(personKey)) continue
      taken.add(cellKey)
      taken.add(personKey)

      cells.push({ ...slot, pointId, slotIndex: plan.slotIndex })
    }
  }

  return cells.sort((first, second) => first.date.localeCompare(second.date) || first.slotIndex - second.slotIndex)
}

export interface CellPlan {
  toAdd:PlannedCell[]
  /** Место занято запланированной сменой — её можно переписать. */
  conflicts:{ cell:PlannedCell; shift:Shift }[]
  /** Смена идёт, завершена или отменена — не трогаем никогда. */
  locked:{ cell:PlannedCell; shift:Shift }[]
}

const shiftCell = (shift:Shift) => `${shift.workDate ?? dayjs(shift.startsAt).format('YYYY-MM-DD')}|${shift.slotIndex ?? 0}`

/**
 * Раскладывает выходы на «добавить», «переписать» и «не трогать» по ячейкам.
 *
 * Ключ — точка, день и место, а не сотрудник и день: иначе повторное применение графика
 * с другой очередью создало бы вторую смену на то же место.
 */
export function planCells(cells:PlannedCell[], existing:Shift[]):CellPlan {
  const byCell = new Map<string, Shift[]>()
  for (const shift of existing) {
    const key = `${shift.pickupPointId}|${shiftCell(shift)}`
    byCell.set(key, [...(byCell.get(key) ?? []), shift])
  }

  const plan:CellPlan = { toAdd: [], conflicts: [], locked: [] }
  for (const cell of cells) {
    const shifts = byCell.get(`${cell.pointId}|${cell.date}|${cell.slotIndex}`) ?? []
    const blocking = shifts.find(shift => shift.status !== 'PLANNED')
    if (blocking) { plan.locked.push({ cell, shift: blocking }); continue }
    const planned = shifts[0]
    if (planned) plan.conflicts.push({ cell, shift: planned })
    else plan.toAdd.push(cell)
  }
  return plan
}

export interface Hole extends Cell {
  /** Почему место пустое: никого не поставили или поставленный в отпуске. */
  reason:'empty' | 'absence'
  /** Сколько мест занято и сколько нужно — для строки «1 из 2 на смене». */
  occupied:number
  need:number
}

/**
 * Дырки в графике: места, на которые никто не выйдет.
 *
 * Прошлое не проверяем — там уже ничего не изменить, и красить закрытые дни в тревожный
 * цвет значит топить настоящую проблему в шуме. Смены со статусами «не вышел» и «замена»
 * место не занимают.
 */
export function findHoles({ pointId, config, shifts, from, to, absences = [] }:{
  pointId:string
  config?:SlotConfig | null
  shifts:Shift[]
  from:string
  to:string
  absences?:Absence[]
}):Hole[] {
  const holes:Hole[] = []
  const last = dayjs(to)

  for (let cursor = dayjs(from); !cursor.isAfter(last, 'day'); cursor = cursor.add(1, 'day')) {
    const date = cursor.format('YYYY-MM-DD')
    const need = slotsForDay(config, date)
    const onDay = shifts.filter(shift =>
      shift.pickupPointId === pointId
      && (shift.workDate ?? dayjs(shift.startsAt).format('YYYY-MM-DD')) === date
      && shift.status !== 'NO_SHOW' && shift.status !== 'REPLACED')

    const filled = new Map<number, Shift>()
    for (const shift of onDay) filled.set(shift.slotIndex ?? 0, shift)

    const occupied = [...filled.values()].filter(shift => !isAbsent(absences, shift.employeeId, date)).length
    if (occupied >= need) continue

    for (let slotIndex = 0; slotIndex < need; slotIndex += 1) {
      const shift = filled.get(slotIndex)
      if (shift && !isAbsent(absences, shift.employeeId, date)) continue
      holes.push({
        pointId,
        date,
        slotIndex,
        reason: shift ? 'absence' : 'empty',
        occupied,
        need,
      })
    }
  }

  return holes
}
