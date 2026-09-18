import type { PickupPoint } from '../entities/types'
import { Banner } from '../shared/kit/Field'
import { cn } from '../shared/kit/cn'
import { haptics } from '../shared/kit/haptics'

/**
 * Выбор нескольких точек карточками с флажком — как шаг «На каких ПВЗ работает»
 * в прототипе. Общий для мастера нового сотрудника и правки карточки.
 */
export function PointChecklist({ points, picked, onChange }:{
  points:PickupPoint[]
  picked:string[]
  onChange:(picked:string[]) => void
}) {
  return <div className="flex flex-col gap-2">
    {!points.length && <Banner tone="warn">Сначала добавьте пункт выдачи в разделе «Ещё» → «Пункты выдачи».</Banner>}
    {points.map(point => {
      const on = picked.includes(point.id)
      return <button
        key={point.id}
        type="button"
        role="checkbox"
        aria-checked={on}
        className={cn('tap flex items-center gap-[11px] rounded-md border-[1.5px] px-[15px] py-[14px] text-left', on ? 'border-accent bg-accent-faint' : 'border-line bg-surface')}
        onClick={() => { haptics.tap(); onChange(on ? picked.filter(id => id !== point.id) : [...picked, point.id]) }}
      >
        <div className={cn('flex size-5 flex-none items-center justify-center rounded-[6px] border-[1.5px] text-[11px] font-bold text-white', on ? 'border-accent bg-accent' : 'border-line-hard bg-surface')}>
          {on ? '✓' : ''}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-medium">{point.name}</div>
          <div className="mt-0.5 text-sub text-muted">{[point.hours ? `${point.hours.from}–${point.hours.to}` : null, point.address].filter(Boolean).join(' · ')}</div>
        </div>
      </button>
    })}
  </div>
}
