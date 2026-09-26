import type { Shift } from '../../entities/types'
import type { Tone } from '../../shared/kit/tokens'
import { initials } from '../../shared/shifts'

export interface DayView { tone:Tone; lines:string[]; strong?:boolean; vacant?:boolean }

/**
 * Как день выглядит в сетке месяца и в матрице недели.
 *
 * Незакрытое место в будущем — красная пунктирная клетка: это и есть главная проблема
 * графика, которую владелец должен увидеть, не вглядываясь. Считаем по числу мест точки
 * (`need`), а не «есть ли хоть кто-то»: при двух местах один человек — тоже дыра.
 * Пустой прошлый день уже ничего не значит, поэтому гасим его до нейтрального.
 *
 * Слова одни на весь график: «пусто» — никого нет, «нужен» — не хватает ещё одного.
 */
export function dayView(shifts:Shift[], date:string, today:string, nameOf:(id:string) => string, options:{
  need?:number
  /** Подпись человека в клетке: инициалы в узкой матрице, имя в сетке месяца. */
  label?:(shift:Shift) => string
  /** Сколько строк помещается в клетку. */
  max?:number
} = {}):DayView {
  const { need = 1, max = 2 } = options
  const label = options.label ?? ((shift:Shift) => initials(nameOf(shift.employeeId)))
  const live = shifts.filter(shift => shift.status !== 'REPLACED')
  const working = live.filter(shift => shift.status !== 'NO_SHOW')

  if (date >= today && working.length < need) {
    return { tone: 'bad', strong: true, vacant: true, lines: working.length ? [label(working[0]), 'нужен'] : ['пусто'] }
  }
  if (!live.length) return { tone: 'neutral', lines: [] }

  const lines = working.length ? working.slice(0, max).map(label) : ['не вышел']
  if (working.length > max) lines[max - 1] = `+${working.length - max + 1}`

  if (live.some(shift => shift.status === 'NO_SHOW')) return { tone: 'bad', lines, strong: true }
  if (live.some(shift => shift.payMode !== 'FULL')) return { tone: 'warn', lines }
  // Прошедший день со сменами — отработан: выход не подтверждают.
  if (date < today) return { tone: 'ok', lines }
  // План и идущая смена — акцентные, как `plan`/`now` в прототипе.
  return { tone: 'accent', lines }
}
