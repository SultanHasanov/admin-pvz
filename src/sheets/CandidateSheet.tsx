import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { Card } from '../shared/kit/Card'
import { Avatar, List, ListRow } from '../shared/kit/ListRow'
import { EmptyState } from '../shared/kit/Misc'
import { initials } from '../shared/shifts'
import { rubles } from '../shared/money'
import { keys, scope } from '../services/queries'
import { listShiftsRange, createShift, replaceShift } from '../services/shifts'
import { resolveShiftRequest } from '../services/requests'
import { useWrite } from '../features/write'
import { useMonthTotals } from '../features/money/useMonthTotals'
import { useOrg } from '../app/OrgContext'
import { defaultShiftTimes } from '../shared/shiftTimes'

/**
 * Кого поставить на день. Занятые в этот день показаны, но не выбираются: у сотрудника
 * не может быть двух пересекающихся смен — это же правило стоит триггером в базе,
 * и лучше объяснить его до запроса, чем показать ошибку после.
 */
export default function CandidateSheet({ pointId, date, shiftId, requestId, close }:{
  pointId:string
  date:string
  /** Задан — меняем сотрудника в существующей смене, иначе создаём новую. */
  shiftId?:string
  /**
   * Задан — ищем замену по заявке сотрудника. Тогда пишет не браузер, а RPC: он
   * переназначит все смены заявки разом и закроет её статусом «замена назначена».
   */
  requestId?:string
  close:() => void
}) {
  const { pointName, points } = useOrg()
  const totals = useMonthTotals()
  const times = defaultShiftTimes(points.find(point => point.id === pointId))

  // Занятость смотрим по всем точкам: человек может стоять в этот день на другом ПВЗ.
  const busy = useQuery({
    queryKey: keys.shiftsRange(date, date, ''),
    queryFn: () => listShiftsRange(date, date),
  })

  const staff = totals.staff.filter(person => person.pickupPointIds.includes(pointId) && person.status === 'ACTIVE')

  const write = useWrite({
    run: (employeeId:string) => requestId
      ? resolveShiftRequest(requestId, 'SUBSTITUTE_FOUND', employeeId)
      : shiftId
        ? replaceShift(shiftId, employeeId, 'Замена вручную')
        : createShift({ employeeId, pickupPointId: pointId, date, startsAt: times.startsAt, endsAt: times.endsAt }),
    invalidate: requestId
      ? [scope.shifts, scope.requests, scope.vacations, scope.upcomingShifts]
      : [scope.shifts],
    done: (employeeId:string) => {
      const name = totals.staff.find(person => person.id === employeeId)?.fullName ?? 'Сотрудник'
      return `${name.split(' ')[0]} · ${dayjs(date).format('D MMMM')}`
    },
    onDone: close,
  })

  if (!staff.length) return <Card>
    <EmptyState
      title="Некого поставить"
      sub={`К ПВЗ «${pointName(pointId)}» не привязан ни один активный сотрудник`}
    />
  </Card>

  return <Card>
    <List>
      {staff.map(person => {
        const taken = (busy.data ?? []).find(shift =>
          shift.employeeId === person.id && shift.status !== 'REPLACED' && shift.status !== 'NO_SHOW')
        return <ListRow
          key={person.id}
          leading={<Avatar initials={initials(person.fullName)} tone={taken ? 'neutral' : 'accent'}/>}
          title={taken ? <span className="text-muted">{person.fullName}</span> : person.fullName}
          sub={taken
            ? `Уже в смене · ${pointName(taken.pickupPointId)}`
            : `${times.startsAt}–${times.endsAt} · ${rubles(person.rateKopecks)}`}
          onClick={taken || write.isPending ? undefined : () => write.mutate(person.id)}
        />
      })}
    </List>
  </Card>
}
