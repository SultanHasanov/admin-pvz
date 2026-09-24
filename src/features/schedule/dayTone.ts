import type { Shift } from '../../entities/types'
import type { Tone } from '../../shared/kit/tokens'
import { initials } from '../../shared/shifts'

export interface DayView { tone:Tone; lines:string[]; strong?:boolean }

/**
 * Как день выглядит в сетке месяца.
 *
 * Пустой будущий день — красный: это и есть главная проблема графика, которую владелец
 * должен увидеть, не вглядываясь. Пустой прошлый день уже ничего не значит, поэтому
 * гасим его до нейтрального.
 */
export function dayView(shifts:Shift[], date:string, today:string, nameOf:(id:string) => string):DayView {
  const live = shifts.filter(shift => shift.status !== 'REPLACED')

  if (!live.length) {
    return date >= today
      ? { tone: 'bad', lines: ['нет'], strong: true }
      : { tone: 'neutral', lines: [] }
  }

  const lines = live.slice(0, 2).map(shift => initials(nameOf(shift.employeeId)))
  if (live.length > 2) lines[1] = `+${live.length - 1}`

  if (live.some(shift => shift.status === 'NO_SHOW')) return { tone: 'bad', lines, strong: true }
  if (live.some(shift => shift.payMode !== 'FULL')) return { tone: 'warn', lines }
  // Прошедший день со сменами — отработан: выход не подтверждают.
  if (date < today) return { tone: 'ok', lines }
  // План и идущая смена — акцентные, как `plan`/`now` в прототипе.
  return { tone: 'accent', lines }
}
