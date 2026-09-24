import { useState } from 'react'
import { cn } from './cn'
import { haptics } from './haptics'

export interface PickOption<T extends string> {
  value:T
  name:string
  sub?:string
}

/**
 * Выбор одного значения в шторке: ПВЗ, месяц, категория, сотрудник.
 * Выбранный пункт обведён акцентной рамкой и помечен галочкой — цвета рамки одной
 * недостаточно, если у человека нарушено цветовосприятие.
 */
/**
 * Тот же выбор, но чипами в ряд: когда вариантов немного и подписи короткие,
 * список из полноразмерных строк занимает пол-экрана формы без всякой пользы.
 */
export function ChoiceChips<T extends string>({ value, options, onPick }:{
  value:T
  options:{ value:T; label:string }[]
  onPick:(value:T) => void
}) {
  return <div className="flex flex-wrap gap-2">
    {options.map(option => {
      const active = option.value === value
      return <button
        key={option.value}
        type="button"
        aria-pressed={active}
        className={cn(
          'tap rounded-sm border px-3 py-[7px] text-act font-medium',
          active ? 'border-accent bg-accent-tint text-accent' : 'border-line bg-surface',
        )}
        onClick={() => { haptics.tap(); onPick(option.value) }}
      >{option.label}</button>
    })}
  </div>
}

export function PickList<T extends string>({ value, options, onPick, searchPlaceholder }:{
  value:T
  options:PickOption<T>[]
  onPick:(value:T) => void
  /** Поле поиска над списком — для длинных списков вроде ПВЗ. */
  searchPlaceholder?:string
}) {
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const shown = needle ? options.filter(option => `${option.name} ${option.sub ?? ''}`.toLowerCase().includes(needle)) : options
  return <div className="grid gap-2">
    {searchPlaceholder && <input
      type="search"
      aria-label={searchPlaceholder}
      placeholder={searchPlaceholder}
      value={query}
      onChange={event => setQuery(event.target.value)}
      className="w-full rounded-md border border-line-strong bg-surface px-[14px] py-3 text-base outline-none placeholder:text-muted-faint focus:border-accent"
    />}
    {!shown.length && <div className="px-1 py-3 text-sub text-muted">Ничего не найдено</div>}
    {shown.map(option => {
      const active = option.value === value
      return <button
        key={option.value}
        type="button"
        aria-pressed={active}
        className={cn(
          'tap flex w-full items-center gap-3 rounded-md border bg-surface px-[14px] py-3 text-left',
          active ? 'border-accent' : 'border-line',
        )}
        onClick={() => { haptics.tap(); onPick(option.value) }}
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-row font-medium">{option.name}</div>
          {option.sub && <div className="mt-0.5 truncate text-sub text-muted">{option.sub}</div>}
        </div>
        <span className={cn('flex-none text-[15px] font-semibold', active ? 'text-accent' : 'text-transparent')}>✓</span>
      </button>
    })}
  </div>
}
