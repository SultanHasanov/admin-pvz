import type { Shift } from '../../entities/types'
import type { Tone } from '../../shared/kit/tokens'
import { isAbsent, type Absence } from '../../entities/slots'
import { initials } from '../../shared/shifts'

export interface DayView { tone:Tone; lines:string[]; strong?:boolean }

/**
 * Как день выглядит в сетке месяца.
 *
 * Пустой будущий день — красный: это и есть главная проблема графика, которую владелец
 * должен увидеть, не вглядываясь. Пустой прошлый день уже ничего не значит, поэтому
 * гасим его до нейтрального. Число мест на смене появится вместе с моделью мест (фаза 4);
 * пока «занят» значит «есть хотя бы одна смена».
 *
 * Отпуск человек не отрабатывает, поэтому его смена не считается занятой. Если после
 * этого в дне не осталось никого, день синий с пометкой «отп» — и всё равно `strong`:
 * это такой же незакрытый день, только с известной причиной.
 */
export function dayView(shifts:Shift[], date:string, today:string, nameOf:(id:string) => string, absences:Absence[] = []):DayView {
  const all = shifts.filter(shift => shift.status !== 'REPLACED')
  const live = all.filter(shift => !isAbsent(absences, shift.employeeId, date))

  if (!live.length) {
    if (all.length) return { tone: 'info', lines: ['отп'], strong: date >= today }
    return date >= today
      ? { tone: 'bad', lines: ['нет'], strong: true }
      : { tone: 'neutral', lines: [] }
  }

  const lines = live.slice(0, 2).map(shift => initials(nameOf(shift.employeeId)))
  if (live.length > 2) lines[1] = `+${live.length - 1}`

  if (live.some(shift => shift.status === 'NO_SHOW')) return { tone: 'bad', lines, strong: true }
  if (live.some(shift => shift.payMode !== 'FULL')) return { tone: 'warn', lines }
  if (live.every(shift => shift.status === 'COMPLETED')) return { tone: 'ok', lines }
  // План и идущая смена — акцентные, как `plan`/`now` в прототипе: синий занят отпуском.
  return { tone: 'accent', lines }
}
