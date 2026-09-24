import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { Button } from '../shared/kit/Button'
import { Card } from '../shared/kit/Card'
import { Avatar, List, ListRow } from '../shared/kit/ListRow'
import { EmptyState, ErrorNote } from '../shared/kit/Misc'
import { initials } from '../shared/shifts'
import { rubles } from '../shared/money'
import { keys, scope } from '../services/queries'
import { listShiftsRange, createShift, createShiftsBulk, replaceShift } from '../services/shifts'
import { resolveShiftRequest } from '../services/requests'
import { useWrite } from '../features/write'
import { useMonthTotals } from '../features/money/useMonthTotals'
import { useOrg } from '../app/OrgContext'
import { defaultShiftTimes } from '../shared/shiftTimes'
import { slotsForDay } from '../entities/slots'

/**
 * Кого поставить на день. Занятые в этот день показаны, но не выбираются: у сотрудника
 * не может быть двух пересекающихся смен — это же правило стоит триггером в базе,
 * и лучше объяснить его до запроса, чем показать ошибку после.
 */
export default function CandidateSheet({ pointId, date, seats, shiftId, requestId, close }:{
  pointId:string
  date:string
  /** Норма дня из шторки дня; нужна сразу после её изменения, до обновления кэша ПВЗ. */
  seats?:number
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
  const [selected, setSelected] = useState<string[]>([])
  const addingPair = !shiftId && !requestId && (seats ?? slotsForDay(points.find(point => point.id === pointId)?.slotConfig, date)) === 2

  // Занятость смотрим по всем точкам: человек может стоять в этот день на другом ПВЗ.
  const busy = useQuery({
    queryKey: keys.shiftsRange(date, date, ''),
    queryFn: () => listShiftsRange(date, date),
  })

  const staff = totals.staff.filter(person => person.pickupPointIds.includes(pointId) && person.status === 'ACTIVE')
  const occupied = (busy.data ?? []).filter(shift => shift.pickupPointId === pointId && shift.status !== 'REPLACED' && shift.status !== 'NO_SHOW')
  const takenSlots = new Set(occupied.map(shift => shift.slotIndex ?? 0))
  const freeSlots = [0, 1].filter(slot => !takenSlots.has(slot))

  const write = useWrite({
    run: (employeeId:string) => requestId
      ? resolveShiftRequest(requestId, 'SUBSTITUTE_FOUND', employeeId)
      : shiftId
        ? replaceShift(shiftId, employeeId, 'Замена вручную')
        : createShift({ employeeId, pickupPointId: pointId, date, startsAt: times.startsAt, endsAt: times.endsAt }),
    invalidate: requestId
      ? [scope.shifts, scope.requests, scope.upcomingShifts]
      : [scope.shifts],
    done: (employeeId:string) => {
      const name = totals.staff.find(person => person.id === employeeId)?.fullName ?? 'Сотрудник'
      return `${name.split(' ')[0]} · ${dayjs(date).format('D MMMM')}`
    },
    onDone: close,
  })

  const writePair = useWrite<string[]>({
    run: employeeIds => createShiftsBulk(employeeIds.map((employeeId, index) => ({
      employeeId, pickupPointId: pointId, date, startsAt: times.startsAt, endsAt: times.endsAt,
      slotIndex: freeSlots[index],
    }))),
    invalidate: [scope.shifts],
    done: employeeIds => `Назначено сотрудников: ${employeeIds.length} · ${dayjs(date).format('D MMMM')}`,
    onDone: close,
  })

  if (!staff.length) return <Card>
    <EmptyState
      title="Некого поставить"
      sub={`К ПВЗ «${pointName(pointId)}» не привязан ни один активный сотрудник`}
    />
  </Card>

  if (addingPair) return <>
    {busy.error && <ErrorNote error={busy.error}/>}
    <div className="mb-2 text-sub text-muted">Отметьте {freeSlots.length === 2 ? 'одного или двух сотрудников' : 'сотрудника'} для свободных мест. Выбрано {selected.length} из {freeSlots.length}.</div>
    <Card>
      <div className="divide-y divide-line">
        {staff.map(person => {
          const taken = (busy.data ?? []).find(shift => shift.employeeId === person.id && shift.status !== 'REPLACED' && shift.status !== 'NO_SHOW')
          const checked = selected.includes(person.id)
          const disabled = !!taken || busy.isLoading || !!busy.error || writePair.isPending || (!checked && selected.length >= freeSlots.length)
          return <label key={person.id} className={`flex min-h-14 items-center gap-3 px-3 py-2 ${disabled ? 'opacity-55' : ''}`}>
            <input type="checkbox" checked={checked} disabled={disabled} onChange={() => setSelected(current =>
              current.includes(person.id) ? current.filter(id => id !== person.id) : [...current, person.id])}
              className="size-5 flex-none" style={{ accentColor: 'var(--color-accent)' }}/>
            <Avatar initials={initials(person.fullName)} tone={taken ? 'neutral' : 'accent'}/>
            <span className="min-w-0 flex-1">
              <span className="block text-row font-medium">{person.fullName}</span>
              <span className="block text-sub text-muted">{taken ? `Уже в смене · ${pointName(taken.pickupPointId)}` : `${times.startsAt}–${times.endsAt} · ${rubles(person.rateKopecks)}`}</span>
            </span>
          </label>
        })}
      </div>
    </Card>
    <Button block className="mt-3" disabled={!selected.length || busy.isLoading || !!busy.error || writePair.isPending || !freeSlots.length}
      onClick={() => writePair.mutate(selected)}>
      Назначить {selected.length ? `${selected.length} ${selected.length === 1 ? 'сотрудника' : 'сотрудников'}` : 'сотрудников'}
    </Button>
  </>

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
