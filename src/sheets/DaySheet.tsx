import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '../shared/kit/Button'
import { ChoiceChips } from '../shared/kit/PickList'
import { Card } from '../shared/kit/Card'
import { Avatar, List, ListRow } from '../shared/kit/ListRow'
import { EmptyState, SkeletonRows } from '../shared/kit/Misc'
import { initials, shiftState } from '../shared/shifts'
import { payModeTitles } from '../shared/salary'
import { rubles } from '../shared/money'
import { timeLabel, today } from '../shared/dates'
import type { Shift } from '../entities/types'
import { keys, scope } from '../services/queries'
import { listEmployees } from '../services/employees'
import { listShiftsRange, deleteShiftSafe } from '../services/shifts'
import { accrueShifts } from '../entities/calculations'
import { useWrite } from '../features/write'
import { useMonthTotals } from '../features/money/useMonthTotals'
import { useOrg } from '../app/OrgContext'
import { slotsForDay } from '../entities/slots'
import { setSlotConfig } from '../services/points'
import { useSheets } from '../app/sheets'
import { toastWarn } from '../shared/kit/Toaster'

/**
 * День на точке: кто выходит, что с ними можно сделать и кого поставить, если пусто.
 *
 * Запрос идёт ровно на этот день, а не берётся из месячной выборки: шторку открывают
 * и из уведомления о дырке в графике, где месяц в шапке может быть другим.
 *
 * `inline` — то же содержимое в правой колонке графика на десктопе, без шторки вокруг.
 * Закрывать там нечего, а «Кого поставить» открывается новой шторкой, а не подменой:
 * подменять нечего, и шторка без записи в истории потом не закрылась бы.
 */
export default function DaySheet({ pointId, date, inline }:{
  pointId:string
  date:string
  close?:() => void
  inline?:boolean
}) {
  const [requestedSeats, setRequestedSeats] = useState<number | null>(null)
  const { pointName, points } = useOrg()
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

  const rows = shifts.data ?? []
  // Заменить можно только ту смену, что ещё впереди или идёт сегодня.
  const canSwap = (shift:Shift) => (shift.status === 'PLANNED' || shift.status === 'ON_DUTY') && date >= today()
  const swap = (shiftId:string) => inline ? open('swap', { pointId, date, shiftId }) : replace('swap', { pointId, date, shiftId })
  const past = date < today()
  const point = points.find(item => item.id === pointId)
  const required = requestedSeats ?? slotsForDay(point?.slotConfig, date)
  const free = Math.max(0, required - rows.filter(shift => shift.status !== 'REPLACED' && shift.status !== 'NO_SHOW').length)
  const capacity = useWrite({
    run: async (count:number) => {
      const config = point?.slotConfig ?? { def: 1 }
      const dates = { ...config.dates }
      if (count === slotsForDay({ ...config, dates: undefined }, date)) delete dates[date]
      else dates[date] = count
      try { await setSlotConfig(pointId, { ...config, dates }) }
      catch (error) { setRequestedSeats(null); throw error }
    },
    invalidate: [scope.points],
    done: 'Число сотрудников на день изменено',
  })

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
                sub={`${timeLabel(shift.startsAt)}–${timeLabel(shift.endsAt)} · ${shift.payMode === 'HALF' ? '½ оплаты' : shift.payMode === 'FULL' ? 'весь день' : payModeTitles[shift.payMode]}`}
                right={rubles(shift.status === 'NO_SHOW' || shift.status === 'REPLACED' ? 0 : accrueShifts([shift], rules))}
                rightSub={shiftState(shift, today()).title}
                rightSubTone={shiftState(shift, today()).tone}
                chevron
                onClick={() => open('menu', {
                  title: nameOf(shift.employeeId),
                  rows: [
                    ...(canSwap(shift) ? [{ title: 'Заменить', sub: 'Не может выйти — найти, кто выйдет вместо', onClick: () => swap(shift.id) }] : []),
                    { title: 'Изменить сотрудника', sub: 'Смена останется на этом месте', onClick: () => open('cand', { pointId, date, shiftId: shift.id }) },
                    { title: 'Изменить оплату', sub: 'Весь день, ½ оплаты или часы', onClick: () => open('partial', { shiftId: shift.id, payMode: shift.payMode, startsAt: shift.startsAt }) },
                    { title: 'Убрать из графика', tone: 'bad' as const, onClick: () => remove.mutate(shift.id) },
                  ],
                })}
              />
            })}
          </List>}
        {rows.some(canSwap) && <div className="grid gap-2 border-t border-line p-3">
          {rows.filter(canSwap).map(shift => <Button key={shift.id} block variant="secondary" onClick={() => swap(shift.id)}>
            Заменить: {nameOf(shift.employeeId).split(' ')[0]}
          </Button>)}
        </div>}
      </Card>}

    {!shifts.isLoading && free > 0 && rows.length > 0 && <div className="mt-2 text-sub text-bad">Место свободно: {free}. Можно добавить сотрудника на этот день.</div>}

    <div className="mt-3 text-sub text-muted">Сколько человек нужно именно в этот день?</div>
    <ChoiceChips value={String(required)} onPick={value => {
      const count = Number(value)
      setRequestedSeats(count)
      capacity.mutate(count)
    }} options={[{ value: '1', label: 'Один' }, { value: '2', label: 'Двое' }]}/>

    {past && !rows.length && <div className="mt-2 text-sub leading-[1.4] text-muted">
      День уже прошёл — поставить смену задним числом можно, но она не изменит закрытый расчёт.
    </div>}

    <Button
      block
      className="mt-3"
      disabled={shifts.isLoading || capacity.isPending || free === 0}
      onClick={() => {
        if (!totals.staff.some(person => person.pickupPointIds.includes(pointId))) {
          toastWarn('На этом ПВЗ нет сотрудников')
          return
        }
        const cand = { pointId, date, seats: required }
        if (inline) open('cand', cand)
        else replace('cand', cand)
      }}
    >{free > 1 ? 'Добавить сотрудников' : 'Добавить сотрудника'}</Button>
    {/* Отдельной «Закрыть» нет: у шторки есть крестик и жест вниз, вторая кнопка
        закрытия спорила с главным действием. */}
  </>
}
