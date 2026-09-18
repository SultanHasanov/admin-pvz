import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { Button } from '../shared/kit/Button'
import { Card } from '../shared/kit/Card'
import { Avatar, List, ListRow } from '../shared/kit/ListRow'
import { EmptyState, SkeletonRows } from '../shared/kit/Misc'
import { initials, statusTitles } from '../shared/shifts'
import { payModeTitles } from '../shared/salary'
import { rubles } from '../shared/money'
import { timeLabel, today } from '../shared/dates'
import { keys, scope } from '../services/queries'
import { listEmployees } from '../services/employees'
import { listShiftsRange, deleteShiftSafe, setShiftStatus } from '../services/shifts'
import { accrueShifts } from '../entities/calculations'
import { useWrite } from '../features/write'
import { useMonthTotals } from '../features/money/useMonthTotals'
import { useOrg } from '../app/OrgContext'
import { useSheets } from '../app/sheets'
import { toastWarn } from '../shared/kit/Toaster'

/**
 * День на точке: кто выходит, что с ними можно сделать и кого поставить, если пусто.
 *
 * Запрос идёт ровно на этот день, а не берётся из месячной выборки: шторку открывают
 * и из уведомления о дырке в графике, где месяц в шапке может быть другим.
 */
export default function DaySheet({ pointId, date, close }:{ pointId:string; date:string; close:() => void }) {
  const { pointName } = useOrg()
  const { open, replace } = useSheets()
  const totals = useMonthTotals()

  const shifts = useQuery({
    queryKey: keys.shiftsRange(date, date, pointId),
    queryFn: () => listShiftsRange(date, date, pointId),
  })
  const employees = useQuery({ queryKey: keys.employees(), queryFn: () => listEmployees() })
  const nameOf = (id:string) => employees.data?.find(employee => employee.id === id)?.fullName ?? 'Сотрудник'

  const remove = useWrite({
    run: async (shiftId:string) => {
      const outcome = await deleteShiftSafe(shiftId)
      // Смену, к которой привязано удержание, сервер удалить не даёт — говорим почему.
      if (outcome === 'linked') throw new Error('Смена связана с удержанием WB — сначала отвяжите удержание')
      return outcome
    },
    invalidate: [scope.shifts],
    done: 'Смена снята',
  })

  const noShow = useWrite({
    run: (shiftId:string) => setShiftStatus(shiftId, 'NO_SHOW'),
    invalidate: [scope.shifts],
    done: 'Отмечено: не вышел',
  })

  // В зарплату идут только подтверждённые смены (COMPLETED). Сотрудник закрывает смену
  // сам из кабинета, а здесь — владелец, если тот забыл или кабинета у него нет.
  const worked = useWrite({
    run: (shiftId:string) => setShiftStatus(shiftId, 'COMPLETED'),
    invalidate: [scope.shifts],
    done: 'Отмечено: вышел — смена в расчёте',
  })

  const rows = shifts.data ?? []
  const past = date < today()

  return <>
    {shifts.isLoading
      ? <Card><SkeletonRows rows={2}/></Card>
      : <Card>
        {rows.length === 0
          ? <EmptyState
            title="Смена не занята"
            sub={`${pointName(pointId)} в этот день останется без сотрудника`}
          />
          : <List>
            {rows.map(shift => {
              const rules = totals.rules.filter(rule => rule.employeeId === shift.employeeId)
              return <ListRow
                key={shift.id}
                leading={<Avatar
                  initials={initials(nameOf(shift.employeeId))}
                  tone={shift.status === 'NO_SHOW' ? 'bad' : 'accent'}
                />}
                title={nameOf(shift.employeeId)}
                sub={`${timeLabel(shift.startsAt)}–${timeLabel(shift.endsAt)}${shift.payMode === 'FULL' ? '' : ` · ${payModeTitles[shift.payMode]}`}`}
                right={rubles(accrueShifts(shift.status === 'COMPLETED' ? [shift] : [], rules))}
                rightSub={statusTitles[shift.status]}
                rightSubTone={shift.status === 'COMPLETED' ? 'ok' : shift.status === 'NO_SHOW' ? 'bad' : 'neutral'}
                chevron
                onClick={() => open('menu', {
                  title: nameOf(shift.employeeId),
                  rows: [
                    ...((shift.status === 'PLANNED' || shift.status === 'ON_DUTY') && date <= today()
                      ? [{ title: 'Вышел', sub: 'Подтвердить выход — смена попадёт в расчёт', onClick: () => worked.mutate(shift.id) }]
                      : []),
                    { title: 'Поменять сотрудника', sub: 'Смена останется на этом месте', onClick: () => open('cand', { pointId, date, shiftId: shift.id }) },
                    { title: 'Неполный выход', sub: 'Половина смены или часы', onClick: () => open('partial', { shiftId: shift.id, payMode: shift.payMode, startsAt: shift.startsAt }) },
                    ...(shift.status === 'PLANNED' || shift.status === 'ON_DUTY'
                      ? [{ title: 'Не вышел', sub: 'Смена не оплачивается', onClick: () => noShow.mutate(shift.id) }]
                      : []),
                    { title: 'Снять смену', tone: 'bad' as const, onClick: () => remove.mutate(shift.id) },
                  ],
                })}
              />
            })}
          </List>}
      </Card>}

    {past && !rows.length && <div className="mt-2 text-sub leading-[1.4] text-muted">
      День уже прошёл — поставить смену задним числом можно, но она не изменит закрытый расчёт.
    </div>}

    <Button
      block
      className="mt-3"
      onClick={() => {
        if (!totals.staff.some(person => person.pickupPointIds.includes(pointId))) {
          toastWarn('На этом ПВЗ нет сотрудников')
          return
        }
        replace('cand', { pointId, date })
      }}
    >Поставить сотрудника</Button>

    <Button block variant="secondary" className="mt-2" onClick={close}>Закрыть</Button>

    {/* Дату показываем в подзаголовке шторки, поэтому здесь только день недели. */}
    <div className="lbl mt-3 text-center">{dayjs(date).format('dddd')}</div>
  </>
}
