import type { ShiftStatus } from '../entities/types'

export const statusTitles:Record<ShiftStatus, string> = {
  PLANNED: 'Запланирована', ON_DUTY: 'На смене', COMPLETED: 'Завершена', REPLACED: 'Замена', NO_SHOW: 'Не вышел',
}

export const statusTone:Record<ShiftStatus, 'slate' | 'green' | 'amber' | 'red'> = {
  PLANNED: 'slate', ON_DUTY: 'amber', COMPLETED: 'green', REPLACED: 'slate', NO_SHOW: 'red',
}

/**
 * Цвет сотрудника в календаре месяца. В клетке шириной 46px имя не помещается,
 * поэтому человек обозначается цветом — и обязательной легендой под сеткой,
 * потому что цвет сам по себе ничего не говорит и не читается при дальтонизме.
 */
const palette = ['#16a34a', '#2563eb', '#d97706', '#7c3aed', '#dc2626', '#0891b2', '#db2777', '#65a30d']
export const employeeTone = (index:number) => palette[index % palette.length]

/** «Иванов Иван Иванович» → «ИИ»: инициалы влезают в клетку на десктопе. */
export const initials = (fullName:string) =>
  fullName.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('')

/** Цвета плашки смены в конструкторе: статус должен читаться боковым зрением. */
export const statusColors:Record<ShiftStatus, { background:string; border:string; color:string }> = {
  PLANNED: { background: '#f0fdf4', border: '#86efac', color: '#15803d' },
  ON_DUTY: { background: '#fffbeb', border: '#fcd34d', color: '#b45309' },
  COMPLETED: { background: '#16a34a', border: '#16a34a', color: '#ffffff' },
  REPLACED: { background: '#f1f5f9', border: '#cbd5e1', color: '#475569' },
  NO_SHOW: { background: '#fef2f2', border: '#fca5a5', color: '#b91c1c' },
}
