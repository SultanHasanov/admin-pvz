import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { Button } from '../shared/kit/Button'
import { Card } from '../shared/kit/Card'
import { SectionTitle } from '../shared/kit/Text'
import { Avatar, List, ListRow } from '../shared/kit/ListRow'
import { SkeletonRows } from '../shared/kit/Misc'
import { initials } from '../shared/shifts'
import { dayLabel } from '../shared/dates'
import { keys, scope } from '../services/queries'
import { listEmployees } from '../services/employees'
import { deleteShiftSafe, listShiftsRange, replaceShift } from '../services/shifts'
import { setSlotConfig } from '../services/points'
import { rankSubstitutes } from '../features/schedule/swap'
import { QuickAddEmployee } from '../features/schedule/QuickAddEmployee'
import { useWrite } from '../features/write'
import { useOrg } from '../app/OrgContext'

const firstName = (name:string) => name.split(' ')[0]

/**
 * Быстрая замена: сотрудник не может выйти в этот день. Сначала — кто выйдет вместо
 * (напарник по графику первым), затем обмен сменами, «оставить одного», если на смене двое,
 * и что делать, если никто из своих не может.
 */
export default function SwapSheet({ pointId, date, shiftId, close }:{ pointId:string; date:string; shiftId:string; close:() => void }) {
  const { points, pointName } = useOrg()
  const point = points.find(item => item.id === pointId)
  const from = dayjs(date).subtract(14, 'day').format('YYYY-MM-DD')
  const to = dayjs(date).add(14, 'day').format('YYYY-MM-DD')
  const around = useQuery({ queryKey: keys.shiftsRange(from, to, pointId), queryFn: () => listShiftsRange(from, to, pointId) })
  const day = useQuery({ queryKey: keys.shiftsRange(date, date, ''), queryFn: () => listShiftsRange(date, date) })
  const employees = useQuery({ queryKey: keys.employees(), queryFn: () => listEmployees() })
  const nameOf = (id:string) => employees.data?.find(person => person.id === id)?.fullName ?? 'Сотрудник'

  const shift = around.data?.find(row => row.id === shiftId)
  const absent = shift ? nameOf(shift.employeeId) : ''
  const staffIds = (employees.data ?? []).filter(person => person.status === 'ACTIVE' && person.pickupPointIds.includes(pointId)).map(person => person.id)
  const ranked = shift ? rankSubstitutes({ date, absentId: shift.employeeId, staffIds, pointShifts: around.data ?? [], dayShifts: day.data ?? [] }) : []
  const free = ranked.filter(row => !row.busyAt)
  // Второй человек на этой же смене: если он остаётся, день можно отработать одному.
  const mate = (day.data ?? []).find(row => row.pickupPointId === pointId && row.id !== shiftId && row.status !== 'REPLACED' && row.status !== 'NO_SHOW')

  const invalidate = [scope.shifts, scope.points]
  const replace = useWrite({
    run: (employeeId:string) => replaceShift(shiftId, employeeId, 'Быстрая замена'),
    invalidate,
    done: (employeeId:string) => `Замена на ${dayLabel(date)}: ${firstName(nameOf(employeeId))}`,
    onDone: close,
  })
  const exchange = useWrite({
    run: async ({ employeeId, otherShiftId }:{ employeeId:string; otherShiftId:string }) => {
      await replaceShift(shiftId, employeeId, 'Обмен сменами')
      await replaceShift(otherShiftId, shift!.employeeId, 'Обмен сменами')
    },
    invalidate,
    done: 'Смены обменяны',
    onDone: close,
  })
  // Убрать смену: день либо остаётся на одного (напарник), либо становится свободным местом.
  const drop = useWrite({
    run: async (keepOne:boolean) => {
      const outcome = await deleteShiftSafe(shiftId)
      if (outcome === 'linked') throw new Error('Смена связана с удержанием WB — сначала отвяжите удержание')
      if (keepOne && point) {
        const config = point.slotConfig ?? { def: 1 }
        await setSlotConfig(pointId, { ...config, dates: { ...config.dates, [date]: 1 } })
      }
    },
    invalidate,
    done: (keepOne:boolean) => keepOne ? `${dayLabel(date)} на смене один: ${firstName(nameOf(mate!.employeeId))}` : `${dayLabel(date)} — свободное место в графике`,
    onDone: close,
  })
  const busy = replace.isPending || exchange.isPending || drop.isPending

  if (around.isLoading || day.isLoading || employees.isLoading) return <Card><SkeletonRows rows={3}/></Card>
  if (!shift) return <Card className="p-4 text-row text-muted">Смена не найдена — возможно, её уже изменили.</Card>

  const swaps = free.filter(row => row.swapShift).slice(0, 2)

  return <>
    <div className="mb-3 text-row leading-[1.45] text-muted">
      {firstName(absent)} не может выйти. Кто выйдет вместо?
    </div>

    {mate && <Card className="mb-3 p-4">
      <div className="text-row font-semibold">Оставить одного</div>
      <div className="mt-1 text-sub text-muted">В этот день на смене двое. {firstName(nameOf(mate.employeeId))} отработает день один, свободного места не будет.</div>
      <Button block variant="secondary" className="mt-3" disabled={busy} onClick={() => drop.mutate(true)}>
        Пусть работает один: {firstName(nameOf(mate.employeeId))}
      </Button>
    </Card>}

    <SectionTitle>Кто может выйти</SectionTitle>
    <Card>
      {!ranked.length
        ? <div className="p-4 text-sub text-muted">На пункте больше никого нет — добавьте сотрудника ниже.</div>
        : <List>
          {ranked.map((row, index) => {
            const notes = row.busyAt ? [`Уже в смене · ${pointName(row.busyAt)}`]
              : [
                index === 0 && row.regular > 0 ? 'Напарник' : row.regular > 0 ? `Смен здесь: ${row.regular}` : 'Здесь не работает',
                row.workedBefore && row.workedAfter ? 'без выходных' : row.workedBefore ? 'после смены' : row.workedAfter ? 'завтра на смене' : 'отдохнул',
              ]
            return <ListRow
              key={row.employeeId}
              leading={<Avatar initials={initials(nameOf(row.employeeId))} tone={row.busyAt ? 'neutral' : 'accent'}/>}
              title={row.busyAt ? <span className="text-muted">{nameOf(row.employeeId)}</span> : nameOf(row.employeeId)}
              sub={notes.join(' · ')}
              right={row.busyAt ? undefined : <span className="text-sub font-semibold text-accent">Поставить</span>}
              onClick={row.busyAt || busy ? undefined : () => replace.mutate(row.employeeId)}
            />
          })}
        </List>}
    </Card>

    {!!swaps.length && <>
      <SectionTitle>Поменяться сменами</SectionTitle>
      <div className="mb-2 text-sub text-muted">Никто не выходит лишний день: выручают друг друга.</div>
      <div className="grid gap-2">
        {swaps.map(row => <Button key={row.employeeId} block variant="secondary" className="!h-auto !py-3 !text-row !font-medium" disabled={busy}
          onClick={() => exchange.mutate({ employeeId: row.employeeId, otherShiftId: row.swapShift!.id })}>
          {firstName(nameOf(row.employeeId))} выйдет {dayLabel(date)}, {firstName(absent)} — {dayLabel(row.swapShift!.workDate ?? dayjs(row.swapShift!.startsAt).format('YYYY-MM-DD'))}
        </Button>)}
      </div>
    </>}

    <SectionTitle>Никто не может?</SectionTitle>
    <Card className="p-4">
      <div className="text-sub leading-[1.45] text-muted">
        {free.length ? 'Если никто из своих не выйдет — ' : 'Свободных сотрудников на этот день нет. '}
        добавьте нового человека или оставьте место свободным.
      </div>
      <QuickAddEmployee pointId={pointId} onAdded={employeeId => replace.mutate(employeeId)}/>
      <Button block variant="danger" className="mt-2" disabled={busy} onClick={() => drop.mutate(false)}>
        Оставить место свободным
      </Button>
    </Card>
  </>
}
