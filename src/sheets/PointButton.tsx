import { Chevron } from '../shared/kit/icons'
import { Field } from '../shared/kit/Field'
import { useOrg } from '../app/OrgContext'
import { useSheets } from '../app/sheets'

/**
 * Пункт выдачи в форме: строка с названием, по нажатию — общий выбор ПВЗ с поиском.
 * С `withAll` можно выбрать «Все ПВЗ» — это пустая строка, как и в шапке.
 */
export function PointButton({ value, onPick, withAll = false }:{ value:string; onPick:(pointId:string) => void; withAll?:boolean }) {
  const { points } = useOrg()
  const { open } = useSheets()
  const active = points.filter(point => !point.archivedAt)
  const point = active.find(item => item.id === value)
  if (active.length < 2 && !withAll) return null

  return <Field label="Пункт выдачи">
    <button
      type="button"
      aria-label="Выбрать ПВЗ"
      onClick={() => open('pvzPick', { value, withAll, onPick })}
      className="tap flex w-full items-center gap-3 rounded-md border border-line bg-surface px-[14px] py-3 text-left"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-row font-medium">{point?.name ?? (withAll && !value ? 'Все ПВЗ' : 'Выберите ПВЗ')}</div>
        {point?.address
          ? <div className="mt-0.5 truncate text-sub text-muted">{point.address}</div>
          : withAll && !value && <div className="mt-0.5 truncate text-sub text-muted">Общий расход на все пункты</div>}
      </div>
      <span className="text-muted"><Chevron size={20}/></span>
    </button>
  </Field>
}
