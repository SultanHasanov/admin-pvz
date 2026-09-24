import { PickList } from '../shared/kit/PickList'
import { useOrg } from '../app/OrgContext'

/**
 * Выбор ПВЗ с поиском. В шапке «Все ПВЗ» — пустая строка, как и в контексте организации; это же
 * значение по умолчанию. Выбранный пункт запоминается и открывается при следующем входе.
 * Экран может передать свои `value`/`onPick` и `withAll: false` — тогда выбор не трогает шапку.
 */
export default function PvzPickSheet({ close, value, onPick, withAll = true }:{
  close:() => void
  value?:string
  onPick?:(pointId:string) => void
  withAll?:boolean
}) {
  const { points, pointId, setPointId } = useOrg()
  const active = points.filter(point => !point.archivedAt)

  return <PickList
    value={value ?? pointId}
    searchPlaceholder={active.length > 4 ? 'Найти ПВЗ по названию или адресу' : undefined}
    onPick={picked => { (onPick ?? setPointId)(picked); close() }}
    options={[
      ...(withAll ? [{ value: '', name: 'Все ПВЗ', sub: `${active.length} активных` }] : []),
      ...active.map(point => ({ value: point.id, name: point.name, sub: point.address })),
    ]}
  />
}
