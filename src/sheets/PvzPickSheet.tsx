import { PickList } from '../shared/kit/PickList'
import { useOrg } from '../app/OrgContext'

/** Выбор конкретного ПВЗ для всех разделов приложения. */
export default function PvzPickSheet({ close }:{ close:() => void }) {
  const { points, pointId, setPointId } = useOrg()
  const active = points.filter(point => !point.archivedAt)

  return <PickList
    value={pointId}
    onPick={value => { setPointId(value); close() }}
    options={[
      ...active.map(point => ({ value: point.id, name: point.name, sub: point.address })),
    ]}
  />
}
