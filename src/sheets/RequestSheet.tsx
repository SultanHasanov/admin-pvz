import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { Card } from '../shared/kit/Card'
import { List, ListRow } from '../shared/kit/ListRow'
import { Label } from '../shared/kit/Text'
import { EmptyState, SkeletonRows } from '../shared/kit/Misc'
import { slotsForDay } from '../entities/slots'
import { dayLabel } from '../shared/dates'
import { keys, scope } from '../services/queries'
import { listShiftRequests, resolveShiftRequest } from '../services/requests'
import { listShiftsRange, deleteShiftSafe } from '../services/shifts'
import { useWrite } from '../features/write'
import { useMonthTotals } from '../features/money/useMonthTotals'
import { useOrg } from '../app/OrgContext'
import { useSheets } from '../app/sheets'

/** Решение по заявке трогает смены и отпуска, поэтому сбрасываем и график тоже. */
const INVALIDATE = [scope.requests, scope.vacations, scope.shifts, scope.upcomingShifts]

/**
 * Решение владельца по заявке сотрудника.
 *
 * Набор решений зависит от дня: «оставить одного» предлагается только там, где на смене
 * больше одного места и кто-то на этот день уже стоит — иначе это не «без замены»,
 * а закрытая точка. Записывает всё RPC `resolve_shift_request`: замена переписывает
 * смены и историю в одной транзакции.
 */
export default function RequestSheet({ id, close }:{ id:string; close:() => void }) {
  const { points, pointName } = useOrg()
  const { open } = useSheets()
  const totals = useMonthTotals()

  const requests = useQuery({ queryKey: keys.requests('open'), queryFn: () => listShiftRequests(['SENT']) })
  const request = requests.data?.find(row => row.id === id)

  const date = request?.dateFrom ?? ''
  const pointId = request?.pickupPointId ?? ''

  const dayShifts = useQuery({
    queryKey: keys.shiftsRange(date, date, pointId),
    queryFn: () => listShiftsRange(date, date, pointId || undefined),
    enabled: !!date,
  })

  const nameOf = (employeeId:string) => totals.staff.find(person => person.id === employeeId)?.fullName ?? 'Сотрудник'

  const live = (dayShifts.data ?? []).filter(shift => shift.status !== 'REPLACED' && shift.status !== 'NO_SHOW')
  const mine = live.find(shift => shift.employeeId === request?.employeeId)
  const partner = live.find(shift => shift.employeeId !== request?.employeeId)
  const point = points.find(row => row.id === pointId)
  const need = point && date ? slotsForDay(point.slotConfig, date) : 1

  const approve = useWrite({
    run: () => resolveShiftRequest(id, 'APPROVED'),
    invalidate: INVALIDATE,
    done: 'Отпуск подтверждён',
    onDone: close,
  })

  const alone = useWrite({
    // Сначала снимаем смену просившего, потом фиксируем решение: наоборот заявка
    // закрылась бы, а человек остался бы стоять в графике.
    run: async () => {
      if (mine) await deleteShiftSafe(mine.id)
      await resolveShiftRequest(id, 'ALONE', null, 'В этот день работает один')
    },
    invalidate: INVALIDATE,
    done: partner ? `Сотрудник увидит: выйдет один ${nameOf(partner.employeeId)}` : 'Решение сохранено',
    onDone: close,
  })

  const decline = useWrite({
    run: () => resolveShiftRequest(id, 'DECLINED'),
    invalidate: INVALIDATE,
    done: 'Запрос отклонён',
    onDone: close,
  })

  if (requests.isLoading) return <Card><SkeletonRows rows={3}/></Card>

  // Заявку могли решить с другого устройства, а уведомление осталось висеть.
  if (!request) return <Card>
    <EmptyState title="Запрос уже обработан" sub="Решение по нему принято — в ленте его больше нет"/>
  </Card>

  const busy = approve.isPending || alone.isPending || decline.isPending
  const vacation = request.kind !== 'SHIFT'

  const rows = [
    ...(vacation ? [{
      key: 'approve',
      title: 'Подтвердить отпуск',
      sub: `${dayLabel(request.dateFrom)} – ${dayLabel(request.dateTo)} · дни станут «нужна замена»`,
      tone: 'accent' as const,
      onClick: () => approve.mutate(undefined as void),
    }] : []),
    {
      key: 'substitute',
      title: 'Назначить замену',
      sub: `Выбрать сотрудника на ${dayLabel(request.dateFrom)}`,
      tone: 'accent' as const,
      onClick: () => open('cand', { pointId, date, requestId: id }),
    },
    ...(need > 1 && partner ? [{
      key: 'alone',
      title: 'Оставить одного, без замены',
      sub: `Выйдет ${nameOf(partner.employeeId)}`,
      tone: undefined,
      onClick: () => alone.mutate(undefined as void),
    }] : []),
    {
      key: 'decline',
      title: 'Отказать',
      sub: 'Сотрудник увидит отказ',
      tone: 'bad' as const,
      onClick: () => decline.mutate(undefined as void),
    },
  ]

  const what = request.kind === 'SHIFT'
    ? `не сможет выйти ${dayLabel(request.dateFrom)}`
    : `просит отпуск ${dayLabel(request.dateFrom)}–${dayLabel(request.dateTo)}`

  return <>
    <div className="mb-3 text-row leading-[1.45] text-muted">
      {nameOf(request.employeeId)} {what} · причина: {request.reason || 'не указана'}
      {pointId && <> · {pointName(pointId)}</>}
    </div>

    <Label>Решение</Label>
    <Card className="mt-1.5">
      <List>
        {rows.map(row => <ListRow
          key={row.key}
          title={<span className={row.tone === 'bad' ? 'text-bad' : row.tone === 'accent' ? 'text-accent' : undefined}>{row.title}</span>}
          sub={row.sub}
          align="start"
          chevron
          onClick={busy ? undefined : row.onClick}
        />)}
      </List>
    </Card>

    <div className="lbl mt-3 text-center">
      Отправлено {dayjs(request.createdAt).format('D MMMM')}
    </div>
  </>
}
