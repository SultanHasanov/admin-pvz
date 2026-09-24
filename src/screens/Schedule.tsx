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
import { useLayout } from '../shared/kit/layout'
import DaySheet from '../sheets/DaySheet'
import { WeekMatrix, type MatrixCell } from '../shared/kit/WeekMatrix'
import { tone as tones, type Tone } from '../shared/kit/tokens'
import { initials, statusTitles } from '../shared/shifts'
import { payModeTitles } from '../shared/salary'
import { dayLabel, monthLabel, monthStart, timeLabel, today as todayDate, weekStartOf } from '../shared/dates'
import { keys } from '../services/queries'
import { listEmployees } from '../services/employees'
import { dayView } from '../features/schedule/dayTone'
import { slotsForDay } from '../entities/slots'
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
  const { desktop } = useLayout()
  const totals = useMonthTotals()
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
  // В клетке телефона помещается пять букв имени; на десктопе — имя целиком и инициал
  // фамилии, чтобы двух Ирин на одной точке можно было различить.
  const cellName = (fullName:string) => {
    const [first, last] = fullName.split(' ')
    return desktop ? `${first}${last ? ` ${last[0]}.` : ''}` : first.slice(0, 5)
  }
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
      const shifts = (byDate.get(date) ?? []).filter(shift => !pointId || shift.pickupPointId === pointId)
      const view = dayView(shifts, date, today, nameOf)
      const working = shifts.filter(shift => shift.status !== 'REPLACED' && shift.status !== 'NO_SHOW')
      const names = working.slice(0, desktop ? 3 : 2).map(shift => `${cellName(nameOf(shift.employeeId))}${shift.payMode === 'HALF' ? ' ½' : ''}`)
      const need = pointId ? slotsForDay(points.find(point => point.id === pointId)?.slotConfig, date) : 1
      const missing = date >= today && names.length < need
      result.set(date, {
        date, ...view,
        tone: missing ? 'bad' : names.length ? 'neutral' : view.tone,
        strong: missing || view.strong,
        vacant: missing,
        lines: missing ? names.length ? [names[0], 'ещё 1'] : ['НУЖЕН'] : names.length ? names : shifts.some(shift => shift.status === 'NO_SHOW') ? ['не выш.'] : view.lines,
      })
    }
    return result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byDate, month, today, employees.data, pointId, points, desktop])

  const matrixRows = useMemo(() => activePoints.map(point => {
    const cells = new Map<string, MatrixCell>()
    for (let index = 0; index < 7; index += 1) {
      const date = dayjs(weekStart).add(index, 'day').format('YYYY-MM-DD')
      const shifts = (byDate.get(date) ?? []).filter(shift => shift.pickupPointId === point.id)
      const view = dayView(shifts, date, today, nameOf)
      cells.set(date, { label: shifts.length ? view.lines[0] ?? '·' : 'нет', tone: view.tone, strong: view.strong })
    }
    return { id: point.id, label: point.name.replace(/^ПВЗ\s+/, ''), cells }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [activePoints, byDate, weekStart, today, employees.data])

  // Кто стоит за инициалами недели: «ИС» без расшифровки владелец угадывает, а не читает.
  const weekPeople = useMemo(() => {
    const ids = new Set<string>()
    for (let index = 0; index < 7; index += 1) {
      const date = dayjs(weekStart).add(index, 'day').format('YYYY-MM-DD')
      for (const shift of byDate.get(date) ?? []) if (shift.status !== 'REPLACED') ids.add(shift.employeeId)
    }
    return [...ids].map(id => nameOf(id)).sort((a, b) => a.localeCompare(b, 'ru'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byDate, weekStart, employees.data])

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = dayjs(weekStart).add(index, 'day').format('YYYY-MM-DD')
    const shifts = byDate.get(date) ?? []
    return { date, shifts, view: dayView(shifts, date, today, nameOf) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [weekStart, byDate, today, employees.data])

  const gaps = [...monthDays.values()].filter(day => day.vacant).length
  const gapUnit = gaps % 10 === 1 && gaps % 100 !== 11 ? 'день' : gaps % 10 >= 2 && gaps % 10 <= 4 && (gaps % 100 < 12 || gaps % 100 > 14) ? 'дня' : 'дней'
  const dayShifts = picked ? (byDate.get(picked) ?? []) : []
  const openDay = (point:string, date:string) => open('day', { pointId: point, date, pointLabel: pointName(point) })

  const links = <div className="mt-4 grid grid-cols-2 gap-2">
    <Button variant="secondary" onClick={() => push('/sched/templates')}>Шаблоны</Button>
    <Button variant="secondary" onClick={() => push('/sched/share')}>Поделиться</Button>
  </div>

  const board = <>
    <Segmented
      className="mb-3"
      value={mode}
      onChange={setMode}
      options={pointId
        ? [{ value: 'month', label: 'Месяц' }, { value: 'week', label: 'Неделя' }]
        : [{ value: 'month', label: 'ПВЗ за неделю' }, { value: 'week', label: 'Дни недели' }]}
    />

    <Button block className="mb-2" onClick={() => push('/sched/build')}>Заполнить график</Button>
    <div className="mb-3 text-sub text-muted">{pointId
      ? 'Нажмите на день, чтобы поставить или заменить человека.'
      : 'Нажмите на клетку, чтобы поставить человека. Месяц целиком — у одного ПВЗ, выберите его вверху.'}</div>

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
                : <span className="font-semibold text-bad-strong">Нужен сотрудник</span>}
              sub={day.shifts.length
                ? day.shifts.map(shift => `${pointName(shift.pickupPointId)} ${timeLabel(shift.startsAt)}`).join(' · ')
                : 'Смена не занята'}
              pill={{ label: day.shifts.length ? `${day.shifts.length} смен` : day.date >= today ? 'назначить' : 'пусто', tone: day.shifts.length ? 'neutral' : day.date >= today ? 'bad' : 'neutral' }}
              className={!day.shifts.length && day.date >= today ? 'border-l-[3px] border-bad bg-bad-tint/60' : undefined}
              align="start"
              onClick={() => { setPicked(day.date); setMode('month') }}
            />)}
          </List>
        </Card>
        : pointId
          ? <>
            {!!gaps && <div role="status" className="mb-2 rounded-md border border-bad bg-bad-tint px-3 py-2 text-sub font-medium text-bad-strong">
              {gaps} {gapUnit} без сотрудника. Нажмите на день с красной рамкой, чтобы назначить.
            </div>}
            <MonthCalendar month={month} days={monthDays} selected={picked} onPick={setPicked}/>
          </>
          : <WeekMatrix
            weekStart={weekStart}
            rows={matrixRows}
            onWeek={setWeekStart}
            // В матрице клетка — это конкретная точка в конкретном дне, поэтому
            // открываем сразу день этой точки, а не общий список.
            onPick={(point, date) => openDay(point, date)}
          />}

    {!totals.loading && mode === 'month' && <Legend people={pointId ? [] : weekPeople}/>}

    {!totals.loading && mode === 'month' && pointId && !gaps && <div className="mt-2 text-sub text-muted">Каждый день месяца закрыт сменой</div>}
  </>

  const dayPanel = picked && !totals.loading && <>
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
              sub={`${pointName(shift.pickupPointId)} · ${shift.payMode === 'HALF' ? '½ оплаты' : shift.payMode === 'FULL' ? 'весь день' : payModeTitles[shift.payMode]}`}
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
    </>

  const filters = <FilterRow>
    <Chip onClick={() => open('pvzPick')}>{pointId ? pointName(pointId) : 'Все ПВЗ'}</Chip>
    <Chip onClick={() => open('monthPick')}>{period}</Chip>
  </FilterRow>

  if (!desktop) return <Screen filters={filters}>{board}{dayPanel}{links}</Screen>

  // Master–detail десктопа: календарь слева, выбранный день справа, а не под календарём —
  // на широком экране день под сеткой уезжает за нижний край.
  return <Screen wide filters={filters}>
    <div className="grid grid-cols-[minmax(0,1fr)_340px] items-start gap-6">
      <div>{board}{links}</div>
      {/* Первый блок колонки встаёт вровень с переключателем слева — без отступа заголовка раздела. */}
      <div className="sticky top-0 [&>:first-child]:mt-0">
        {/* День точки правится прямо здесь — то же содержимое, что в шторке дня на телефоне. */}
        {picked && pointId
          ? <>
            <SectionTitle>{dayLabel(picked)} · {dayjs(picked).format('dddd')}</SectionTitle>
            <DaySheet key={`${pointId}-${picked}`} inline pointId={pointId} date={picked}/>
          </>
          : dayPanel || <Card><EmptyState title="Выберите день" sub="Смены дня появятся здесь — без шторки поверх календаря"/></Card>}
      </div>
    </div>
  </Screen>
}

const LEGEND:{ tone:Tone; label:string }[] = [
  { tone: 'accent', label: 'по плану' },
  { tone: 'ok', label: 'отработана' },
  { tone: 'warn', label: 'неполная' },
  { tone: 'bad', label: 'нет человека' },
]

/** Расшифровка сетки: цвета клеток и, в матрице всех ПВЗ, чьи это инициалы. */
function Legend({ people }:{ people:string[] }) {
  return <div className="mt-2.5 text-lbl text-muted">
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {LEGEND.map(item => <span key={item.tone} className="flex items-center gap-1.5">
        <span aria-hidden className="size-2.5 rounded-[3px] border" style={{ background: tones[item.tone].bg, borderColor: tones[item.tone].fg }}/>
        {item.label}
      </span>)}
    </div>
    {!!people.length && <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
      {people.map(name => <span key={name}><b className="font-semibold text-muted-strong">{initials(name)}</b> {name}</span>)}
    </div>}
  </div>
}
