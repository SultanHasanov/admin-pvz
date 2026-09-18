import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { Button } from '../shared/kit/Button'
import { Card } from '../shared/kit/Card'
import { List, ListRow } from '../shared/kit/ListRow'
import { Banner } from '../shared/kit/Field'
import { EmptyState } from '../shared/kit/Misc'
import { toastDone, toastWarn } from '../shared/kit/Toaster'
import { planCells, type PlannedCell } from '../entities/slots'
import { weekLabel, weekStartOf } from '../shared/dates'
import { applyCells } from '../services/schedule'
import { weekOptions } from '../features/schedule/useCopyWeek'
import { useMonthTotals } from '../features/money/useMonthTotals'
import { useOrg } from '../app/OrgContext'

/**
 * Копирование заполненной недели на другие.
 *
 * Берём не «правило», а фактическую неделю: место, сотрудника и его личное время.
 * Так повторяется именно то, что владелец уже собрал руками, включая неровности вроде
 * «в пятницу выходят двое».
 */
export default function CopyWeekSheet({ pointId, weekStart: initial, close }:{
  pointId?:string
  weekStart?:string
  close:() => void
}) {
  const { month, pointId: selected, points } = useOrg()
  const totals = useMonthTotals()
  const target = pointId || selected || points.find(point => !point.archivedAt)?.id || ''
  const weekStart = initial ?? weekStartOf(`${month}-01`)

  const [weeks, setWeeks] = useState<string[]>([])
  const options = useMemo(() => weekOptions(month, weekStart), [month, weekStart])

  /** Смены недели-образца: по ним и строим копии. */
  const source = useMemo(() => totals.shifts.filter(shift => {
    const date = shift.workDate ?? dayjs(shift.startsAt).format('YYYY-MM-DD')
    return shift.pickupPointId === target
      && date >= weekStart
      && date <= dayjs(weekStart).add(6, 'day').format('YYYY-MM-DD')
      && shift.status !== 'REPLACED'
  }), [totals.shifts, target, weekStart])

  const cells = useMemo<PlannedCell[]>(() => weeks.flatMap(week => source.map(shift => {
    const date = shift.workDate ?? dayjs(shift.startsAt).format('YYYY-MM-DD')
    const shiftInWeek = dayjs(date).diff(dayjs(weekStart), 'day')
    return {
      pointId: target,
      date: dayjs(week).add(shiftInWeek, 'day').format('YYYY-MM-DD'),
      slotIndex: shift.slotIndex ?? 0,
      employeeId: shift.employeeId,
      // Личное время сохраняем: «Иванов 09:00–21:00, Петров 12:00–00:00» должно пережить копирование.
      startsAt: dayjs(shift.startsAt).format('HH:mm'),
      endsAt: dayjs(shift.endsAt).format('HH:mm'),
      payMode: shift.payMode,
    }
  })), [weeks, source, weekStart, target])

  const apply = useMutation({
    mutationFn: () => applyCells(
      planCells(cells, totals.shifts.filter(shift => shift.pickupPointId === target)),
      { startsAt: '09:00', endsAt: '21:00', payMode: 'FULL', strategy: 'skip' },
    ),
    onSuccess: result => {
      if (!result.added) toastWarn('На выбранных неделях места уже заняты')
      else toastDone(`Скопировано смен: ${result.added}`)
      close()
    },
    onError: error => toastWarn(error instanceof Error ? error.message : 'Не удалось скопировать неделю'),
  })

  if (!source.length) return <Card>
    <EmptyState title="На этой неделе нет смен" sub={`Неделя ${weekLabel(weekStart)} пустая — копировать нечего`}/>
  </Card>

  return <>
    <Banner tone="info">
      Возьмём неделю {weekLabel(weekStart)}: {source.length} смен. Личное время каждого сохранится.
    </Banner>

    <Card>
      <List>
        {options.map(week => {
          const chosen = weeks.includes(week)
          return <ListRow
            key={week}
            title={weekLabel(week)}
            pill={chosen ? { label: 'копируем', tone: 'accent' } : undefined}
            onClick={() => setWeeks(current => chosen ? current.filter(item => item !== week) : [...current, week])}
          />
        })}
      </List>
    </Card>

    <Button
      block
      className="mt-3"
      disabled={!weeks.length || apply.isPending}
      onClick={() => apply.mutate()}
    >Применить на {weeks.length} нед.</Button>
  </>
}
