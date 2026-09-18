import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { Screen, FilterRow } from '../shared/kit/Screen'
import { Card } from '../shared/kit/Card'
import { Avatar, List, ListRow } from '../shared/kit/ListRow'
import { SectionTitle } from '../shared/kit/Text'
import { Button, TextButton } from '../shared/kit/Button'
import { Segmented } from '../shared/kit/Segmented'
import { Chip, EmptyState, ErrorNote, SkeletonRows } from '../shared/kit/Misc'
import { MonthCalendar, type CalendarDay } from '../shared/kit/MonthCalendar'
import { WeekMatrix, type MatrixCell } from '../shared/kit/WeekMatrix'
import { Fab } from '../shared/kit/TabBar'
import { initials, statusTitles } from '../shared/shifts'
import { payModeTitles } from '../shared/salary'
import { dayLabel, monthLabel, monthStart, timeLabel, today as todayDate, weekStartOf } from '../shared/dates'
import { keys } from '../services/queries'
import { listEmployees } from '../services/employees'
import { dayView } from '../features/schedule/dayTone'
import { useVacations } from '../features/schedule/useVacations'
import { useMonthTotals } from '../features/money/useMonthTotals'
import { useOrg } from '../app/OrgContext'
import { useNav } from '../app/nav'
import { useSheets } from '../app/sheets'

/**
 * График за месяц.
 *
 * Вид зависит от фильтра, как в прототипе: на одной точке — сетка месяца с инициалами,
 * на всех точках — матрица «неделя × ПВЗ», потому что месяц на три точки в 390px
 * не помещается и превращается в кашу. Отдельный режим «Неделя» даёт подробности по дням.
 */
export default function Schedule() {
  const [params] = useSearchParams()
  const { month, pointId, points, pointName } = useOrg()
  const { open } = useSheets()
  const { push } = useNav()
  const totals = useMonthTotals()
  const { absences } = useVacations(month)
  const employees = useQuery({ queryKey: keys.employees(), queryFn: () => listEmployees() })

  const today = todayDate()
  const [mode, setMode] = useState<'month' | 'week'>('month')
  const [picked, setPicked] = useState<string | undefined>(() => params.get('d') ?? undefined)
  const [weekStart, setWeekStart] = useState(() => weekStartOf(
    month === today.slice(0, 7) ? today : monthStart(month)))

  // Месяц меняется из шторки: матрица недели и выбранный день должны пойти за ним.
  useEffect(() => {
    setWeekStart(weekStartOf(month === today.slice(0, 7) ? today : monthStart(month)))
    setPicked(current => current?.startsWith(month) ? current : undefined)
  }, [month]) // eslint-disable-line react-hooks/exhaustive-deps

  const period = monthLabel(month).split(' ')[0]
  const nameOf = (id:string) => employees.data?.find(employee => employee.id === id)?.fullName ?? 'Сотрудник'
  const activePoints = points.filter(point => !point.archivedAt)

  const byDate = useMemo(() => {
    const map = new Map<string, typeof totals.shifts>()
    for (const shift of totals.shifts) {
      const date = dayjs(shift.startsAt).format('YYYY-MM-DD')
      map.set(date, [...(map.get(date) ?? []), shift])
    }
    return map
  }, [totals.shifts])

  // Сетка месяца — только когда выбрана одна точка: иначе в клетке пришлось бы
  // показывать сумму по трём ПВЗ, и пустой день одной из них потерялся бы.
  const monthDays = useMemo(() => {
    const first = dayjs(monthStart(month))
    const result = new Map<string, CalendarDay>()
    for (let index = 0; index < first.daysInMonth(); index += 1) {
      const date = first.add(index, 'day').format('YYYY-MM-DD')
      result.set(date, { date, ...dayView(byDate.get(date) ?? [], date, today, nameOf, absences) })
    }
    return result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byDate, month, today, employees.data, absences])

  const matrixRows = useMemo(() => activePoints.map(point => {
    const cells = new Map<string, MatrixCell>()
    for (let index = 0; index < 7; index += 1) {
      const date = dayjs(weekStart).add(index, 'day').format('YYYY-MM-DD')
      const shifts = (byDate.get(date) ?? []).filter(shift => shift.pickupPointId === point.id)
      const view = dayView(shifts, date, today, nameOf, absences)
      cells.set(date, { label: shifts.length ? view.lines[0] ?? '·' : 'нет', tone: view.tone, strong: view.strong })
    }
    return { id: point.id, label: point.name.replace(/^ПВЗ\s+/, ''), cells }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [activePoints, byDate, weekStart, today, employees.data, absences])

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = dayjs(weekStart).add(index, 'day').format('YYYY-MM-DD')
    const shifts = byDate.get(date) ?? []
    return { date, shifts, view: dayView(shifts, date, today, nameOf, absences) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [weekStart, byDate, today, employees.data, absences])

  const gaps = [...monthDays.values()].filter(day => day.strong).length
  const dayShifts = picked ? (byDate.get(picked) ?? []) : []
  const openDay = (point:string, date:string) => open('day', { pointId: point, date, pointLabel: pointName(point) })

  return <Screen
    filters={<FilterRow>
      <Chip onClick={() => open('pvzPick')}>{pointId ? pointName(pointId) : 'Все ПВЗ'}</Chip>
      <Chip onClick={() => open('monthPick')}>{period}</Chip>
    </FilterRow>}
  >
    <Segmented
      className="mb-3"
      value={mode}
      onChange={setMode}
      options={[{ value: 'month', label: 'Месяц' }, { value: 'week', label: 'Неделя' }]}
    />

    {totals.error && <div className="mb-3"><ErrorNote error={totals.error}/></div>}

    {totals.loading
      ? <Card><SkeletonRows rows={5}/></Card>
      : mode === 'week'
        ? <Card>
          <List>
            {weekDays.map(day => <ListRow
              key={day.date}
              leading={<div className="w-8 flex-none text-center">
                <div className="font-mono text-axis text-muted-soft">{dayjs(day.date).format('dd')}</div>
                <div className="text-title font-semibold tabular-nums" style={{ color: day.date === today ? 'var(--color-accent)' : undefined }}>
                  {dayjs(day.date).date()}
                </div>
              </div>}
              title={day.shifts.length
                ? [...new Set(day.shifts.map(shift => nameOf(shift.employeeId)))].join(', ')
                : <span className="text-bad">Нет сотрудника</span>}
              sub={day.shifts.length
                ? day.shifts.map(shift => `${pointName(shift.pickupPointId)} ${timeLabel(shift.startsAt)}`).join(' · ')
                : 'Смена не занята'}
              pill={{ label: day.shifts.length ? `${day.shifts.length} смен` : 'пусто', tone: day.view.tone }}
              align="start"
              onClick={() => { setPicked(day.date); setMode('month') }}
            />)}
          </List>
        </Card>
        : pointId
          ? <MonthCalendar month={month} days={monthDays} selected={picked} onPick={setPicked}/>
          : <WeekMatrix
            weekStart={weekStart}
            rows={matrixRows}
            onWeek={setWeekStart}
            // В матрице клетка — это конкретная точка в конкретном дне, поэтому
            // открываем сразу день этой точки, а не общий список.
            onPick={(point, date) => openDay(point, date)}
          />}

    {!totals.loading && mode === 'month' && pointId && <div className="mt-2 text-sub text-muted">
      {gaps ? `Дней без сотрудника: ${gaps}` : 'Каждый день месяца закрыт сменой'}
    </div>}

    {picked && !totals.loading && <>
      <SectionTitle
        count={dayShifts.length}
        action={pointId
          ? <TextButton onClick={() => openDay(pointId, picked)}>Изменить</TextButton>
          : undefined}
      >{dayLabel(picked)}</SectionTitle>
      <Card>
        {dayShifts.length === 0
          ? <EmptyState
            title="В этот день никто не выходит"
            sub={pointId ? `ПВЗ «${pointName(pointId)}» останется без сотрудника` : 'Ни на одном ПВЗ нет смены'}
          />
          : <List>
            {dayShifts.map(shift => <ListRow
              key={shift.id}
              leading={<Avatar initials={initials(nameOf(shift.employeeId))}/>}
              title={nameOf(shift.employeeId)}
              sub={`${pointName(shift.pickupPointId)}${shift.payMode === 'FULL' ? '' : ` · ${payModeTitles[shift.payMode]}`}`}
              right={`${timeLabel(shift.startsAt)}–${timeLabel(shift.endsAt)}`}
              rightSub={statusTitles[shift.status]}
              rightSubTone={shift.status === 'COMPLETED' ? 'ok' : shift.status === 'NO_SHOW' ? 'bad' : 'neutral'}
              chevron
              onClick={() => openDay(shift.pickupPointId, picked)}
            />)}
          </List>}
      </Card>

      {!dayShifts.length && <Button
        block
        className="mt-3"
        onClick={() => openDay(pointId || activePoints[0]?.id || '', picked)}
      >Поставить сотрудника</Button>}
    </>}

    <Fab onClick={() => open('menu', { title: 'Заполнить график', rows: [
      { title: 'Мастер графика', sub: 'Места на смене, очередь, период', onClick: () => push('/sched/wizard') },
      { title: 'Применить шаблон', sub: 'Сохранённые графики', onClick: () => push('/sched/templates') },
      { title: 'Скопировать неделю', sub: 'Повторить на следующие недели', onClick: () => open('copyWeek', { pointId, weekStart }) },
      { title: 'Поделиться графиком', sub: 'Картинка для сотрудников', onClick: () => push('/sched/share') },
    ] })}/>
  </Screen>
}
