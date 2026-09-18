import { cn } from './cn'
import { haptics } from './haptics'

/**
 * Переключатель режима: «Месяц / Неделя», «Доходы / Зарплаты / Удержания».
 * Тёмная дорожка со светлой «пилюлей» активного пункта — вид iOS-сегмента.
 */
export function Segmented<T extends string>({ value, options, onChange, className }:{
  value:T
  options:{ value:T; label:string }[]
  onChange:(value:T) => void
  className?:string
}) {
  // inline-flex, а не flex: переключатель обнимает подписи, а не растягивается на экран.
  return <div className={cn('inline-flex flex-none rounded-sm bg-track p-[3px]', className)}>
    {options.map(option => {
      const active = option.value === value
      return <button
        key={option.value}
        type="button"
        aria-pressed={active}
        className={cn(
          'tap rounded-[9px] px-[13px] py-1.5 text-act font-medium',
          active ? 'bg-surface text-ink' : 'text-muted-strong',
        )}
        onClick={() => { if (!active) { haptics.tap(); onChange(option.value) } }}
      >{option.label}</button>
    })}
  </div>
}

/**
 * Счётчик «− N +»: число мест на смене, смен подряд, дней отдыха, часов на смене.
 * Кнопки по 34px, потому что их жмут подряд и промах стоит лишнего шага.
 */
export function Stepper({ value, min = 0, max = 99, onChange, suffix }:{
  value:number
  min?:number
  max?:number
  onChange:(value:number) => void
  suffix?:string
}) {
  const step = (delta:number) => {
    const next = Math.min(max, Math.max(min, value + delta))
    if (next === value) return
    haptics.tap()
    onChange(next)
  }
  return <div className="flex items-center gap-3">
    <button
      type="button"
      className="tap flex size-[34px] items-center justify-center rounded-sm border border-line bg-surface text-[17px] disabled:opacity-40"
      disabled={value <= min}
      onClick={() => step(-1)}
      aria-label="Уменьшить"
    >−</button>
    <div className="min-w-8 text-center text-title font-semibold tabular-nums">
      {value}{suffix && <span className="ml-1 text-sub font-normal text-muted">{suffix}</span>}
    </div>
    <button
      type="button"
      className="tap flex size-[34px] items-center justify-center rounded-sm border border-line bg-surface text-[17px] disabled:opacity-40"
      disabled={value >= max}
      onClick={() => step(1)}
      aria-label="Увеличить"
    >+</button>
  </div>
}
