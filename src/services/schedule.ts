import type { PayMode } from '../entities/types'
import type { ApplyPlan, PlannedSlot } from '../entities/schedule'
import { createShiftsBulk, updateShiftPlan, type ShiftInput } from './shifts'

export interface ApplyOptions {
  pickupPointId:string
  startsAt:string
  endsAt:string
  payMode:PayMode
  /** «Пропустить занятые» или «переписать запланированные». */
  strategy:'skip' | 'replace'
}

export interface ApplyResult {
  added:number
  replaced:number
  skipped:number
  failed:{ employeeId:string; date:string; reason:string }[]
}

/** Личное время выхода перекрывает общий шаблон — так копирование недели сохраняет график каждого. */
const inputFrom = (slot:PlannedSlot, options:ApplyOptions):ShiftInput => ({
  employeeId: slot.employeeId,
  pickupPointId: options.pickupPointId,
  date: slot.date,
  startsAt: slot.startsAt ?? options.startsAt,
  endsAt: slot.endsAt ?? options.endsAt,
  payMode: slot.payMode ?? options.payMode,
})

const reasonOf = (error:unknown) => error instanceof Error ? error.message : String(error)

export async function applySchedule(plan:ApplyPlan, options:ApplyOptions):Promise<ApplyResult> {
  const result:ApplyResult = { added: 0, replaced: 0, skipped: plan.locked.length, failed: [] }

  if (options.strategy === 'replace') {
    // По одной: одна упавшая смена не должна отменять весь график.
    for (const { slot, shift } of plan.conflicts) {
      try {
        await updateShiftPlan(shift.id, inputFrom(slot, options))
        result.replaced += 1
      } catch (error) {
        result.failed.push({ employeeId: slot.employeeId, date: slot.date, reason: reasonOf(error) })
      }
    }
  } else {
    result.skipped += plan.conflicts.length
  }

  // Чанками, чтобы отказ на середине месяца не отменил уже вставленные недели.
  const chunk = 200
  for (let start = 0; start < plan.toAdd.length; start += chunk) {
    const slice = plan.toAdd.slice(start, start + chunk)
    try {
      await createShiftsBulk(slice.map(slot => inputFrom(slot, options)), chunk)
      result.added += slice.length
    } catch (error) {
      const reason = reasonOf(error)
      for (const slot of slice) result.failed.push({ employeeId: slot.employeeId, date: slot.date, reason })
    }
  }

  return result
}
