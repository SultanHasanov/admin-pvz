import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { Screen, Header } from '../../shared/kit/Screen'
import { Card } from '../../shared/kit/Card'
import { List, ListRow } from '../../shared/kit/ListRow'
import { SectionTitle } from '../../shared/kit/Text'
import { Button } from '../../shared/kit/Button'
import { EmptyState, ErrorNote, SkeletonRows } from '../../shared/kit/Misc'
import { plural } from '../../shared/format'
import { hoursLabel } from '../../shared/shiftTimes'
import { keys } from '../../services/queries'
import { listPickupPoints } from '../../services/points'
import { listEmployees } from '../../services/employees'
import { useNav } from '../../app/nav'

/** Пункты выдачи: активные сверху, архив отдельной группой — прошлые расчёты по нему остаются. */
export default function Points() {
  const { push, back, canBack } = useNav()
  // Десктоп: список стоит слева от карточки пункта, и открытый пункт подсвечен.
  const { id: selected } = useParams()
  const points = useQuery({ queryKey: keys.pointsAll, queryFn: () => listPickupPoints(true) })
  const employees = useQuery({ queryKey: keys.employees(), queryFn: () => listEmployees() })

  const staffOn = (pointId:string) => (employees.data ?? []).filter(person => person.pickupPointIds.includes(pointId)).length
  const groups = [
    { label: 'Активные', rows: (points.data ?? []).filter(point => !point.archivedAt) },
    { label: 'Архив', rows: (points.data ?? []).filter(point => point.archivedAt) },
  ].filter(group => group.rows.length)

  return <Screen header={<Header title="Пункты выдачи" onBack={canBack ? back : undefined}/>}>
    {points.error && <div className="mb-3"><ErrorNote error={points.error}/></div>}
    {points.isLoading && <Card><SkeletonRows rows={3}/></Card>}
    {!points.isLoading && !groups.length && <Card>
      <EmptyState title="Пунктов пока нет" sub="Добавьте первый ПВЗ — по нему строятся график и деньги"/>
    </Card>}

    {groups.map(group => <div key={group.label}>
      <SectionTitle count={group.rows.length}>{group.label}</SectionTitle>
      <Card>
        <List>
          {group.rows.map(point => {
            const staff = staffOn(point.id)
            return <ListRow
              key={point.id}
              title={point.name}
              sub={point.archivedAt ? point.address || undefined : [point.address, hoursLabel(point)].filter(Boolean).join(' · ')}
              right={point.archivedAt ? 'в архиве' : `${staff} ${plural(staff, 'сотрудник', 'сотрудника', 'сотрудников')}`}
              chevron
              align="start"
              selected={point.id === selected}
              onClick={() => push(`/more/points/${point.id}`)}
            />
          })}
        </List>
      </Card>
    </div>)}

    <Button block className="mt-3" onClick={() => push('/more/points/new')}>Добавить пункт выдачи</Button>
  </Screen>
}
