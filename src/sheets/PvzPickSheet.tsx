import { PickList } from '../shared/kit/PickList'
import { useOrg } from '../app/OrgContext'

/**
 * Выбор ПВЗ с поиском. В шапке «Все ПВЗ» — пустая строка, как и в контексте организации; это же
 * значение по умолчанию. Выбранный пункт запоминается и открывается при следующем входе.
 * Экран может передать свои `value`/`onPick` и `withAll: false` — тогда выбор не трогает шапку.
 *
 * В шапке при одной точке «Все ПВЗ» не показываем: это тот же пункт. В форме (свой `onPick`)
 * оставляем — там «все» значит «общий расход», и это другое.
 */
export default function PvzPickSheet({ close, value, onPick, withAll = true }:{
  close:() => void
  value?:string
  onPick?:(pointId:string) => void
  withAll?:boolean
}) {
  const { points, pointId, defaultPointId, setPointId } = useOrg()
  const active = points.filter(point => !point.archivedAt)
  const all = withAll && !(!onPick && active.length === 1)

  return <PickList
    value={value ?? (all ? pointId : defaultPointId)}
    searchPlaceholder={active.length > 4 ? 'Найти ПВЗ по названию или адресу' : undefined}
    onPick={picked => { (onPick ?? setPointId)(picked); close() }}
    options={[
      ...(all ? [{ value: '', name: 'Все ПВЗ', sub: `${active.length} активных` }] : []),
      ...active.map(point => ({ value: point.id, name: point.name, sub: point.address })),
    ]}
  />
}
