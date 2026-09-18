import type { ShiftStatus } from '../entities/types'

export const statusTitles:Record<ShiftStatus, string> = {
  PLANNED: 'Запланирована', ON_DUTY: 'На смене', COMPLETED: 'Завершена', REPLACED: 'Замена', NO_SHOW: 'Не вышел',
}

/** «Иванов Иван Иванович» → «ИИ»: инициалы в аватаре и в клетке сетки. */
export const initials = (fullName:string) =>
  fullName.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('')

