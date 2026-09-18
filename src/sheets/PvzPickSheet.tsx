import { PickList } from '../shared/kit/PickList'
import { useOrg } from '../app/OrgContext'

/** Выбор ПВЗ в шапке. «Все ПВЗ» — пустая строка, как и в контексте организации. */
export default function PvzPickSheet({ close }:{ close:() => void }) {
  const { points, pointId, setPointId } = useOrg()
  const active = points.filter(point => !point.archivedAt)

  return <PickList
    value={pointId}
    onPick={value => { setPointId(value); close() }}
    options={[
      { value: '', name: 'Все ПВЗ', sub: `${active.length} активных` },
      ...active.map(point => ({ value: point.id, name: point.name, sub: point.address })),
    ]}
  />
}
