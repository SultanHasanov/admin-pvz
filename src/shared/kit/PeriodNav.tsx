import { Chevron } from './icons'

/**
 * «‹ Сентябрь 2026 ›» — листание месяца или недели. Один вид у обоих режимов графика:
 * раньше у месяца и недели были стрелки разного размера и цвета, и казалось, что это разные вещи.
 */
export function PeriodNav({ label, unit, onStep }:{
  label:string
  /** Для подписи стрелок: «месяц» или «неделя». */
  unit:'month' | 'week'
  onStep:(step:-1 | 1) => void
}) {
  const [prev, next] = unit === 'month' ? ['Предыдущий месяц', 'Следующий месяц'] : ['Предыдущая неделя', 'Следующая неделя']
  const arrow = 'tap flex size-11 flex-none items-center justify-center rounded-md border border-line bg-surface text-accent'
  return <div className="mb-2 flex items-center justify-between gap-2">
    <button type="button" aria-label={prev} className={arrow} onClick={() => onStep(-1)}><Chevron dir="left" size={22}/></button>
    <span className="text-row font-semibold">{label}</span>
    <button type="button" aria-label={next} className={arrow} onClick={() => onStep(1)}><Chevron size={22}/></button>
  </div>
}
