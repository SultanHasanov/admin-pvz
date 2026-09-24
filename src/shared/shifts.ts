import dayjs from 'dayjs'
import type { Shift, ShiftStatus } from '../entities/types'

export const statusTitles:Record<ShiftStatus, string> = {
  PLANNED: 'Запланирована', ON_DUTY: 'На смене', COMPLETED: 'Завершена', REPLACED: 'Замена', NO_SHOW: 'Не вышел',
}

/**
 * Подпись смены в списках. Выход не подтверждают: смена в графике на прошедший день —
 * отработана, сегодняшняя — идёт, будущая — в плане.
 */
export function shiftState(shift:Shift, today:string):{ title:string; tone:'ok' | 'bad' | 'neutral' } {
  if (shift.status === 'REPLACED') return { title: statusTitles.REPLACED, tone: 'neutral' }
  if (shift.status === 'NO_SHOW') return { title: statusTitles.NO_SHOW, tone: 'bad' }
  const date = shift.workDate ?? dayjs(shift.startsAt).format('YYYY-MM-DD')
  if (date < today) return { title: 'Отработана', tone: 'ok' }
  return { title: date === today ? 'Сегодня' : 'Запланирована', tone: 'neutral' }
}

/** «Иванов Иван Иванович» → «ИИ»: инициалы в аватаре и в клетке сетки. */
export const initials = (fullName:string) =>
  fullName.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('')
