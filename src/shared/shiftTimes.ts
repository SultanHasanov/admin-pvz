import type { PickupPoint } from '../entities/types'

/**
 * Время смены по умолчанию: часы работы точки, иначе то, что запомнил старый
 * конструктор (тот же ключ localStorage — настройка одна на оба дерева), иначе 09–21.
 * Прототип прямо говорит: «Часы работы станут временем смен по умолчанию».
 */
export function defaultShiftTimes(point?:PickupPoint | null):{ startsAt:string; endsAt:string } {
  if (point?.hours) return { startsAt: point.hours.from, endsAt: point.hours.to }
  try {
    const saved = JSON.parse(localStorage.getItem('pvz.shiftTemplate') ?? '{}')
    return { startsAt: saved.startsAt ?? '09:00', endsAt: saved.endsAt ?? '21:00' }
  } catch { return { startsAt: '09:00', endsAt: '21:00' } }
}

/** «09:00–21:00» — так часы показаны в прототипе. */
export const hoursLabel = (point?:PickupPoint | null) =>
  point?.hours ? `${point.hours.from}–${point.hours.to}` : 'часы не заданы'
