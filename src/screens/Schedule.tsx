import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { Screen, FilterRow } from '../shared/kit/Screen'
import { Card } from '../shared/kit/Card'
import { List, ListRow } from '../shared/kit/ListRow'
import { SectionTitle } from '../shared/kit/Text'
import { Button } from '../shared/kit/Button'
import { Segmented } from '../shared/kit/Segmented'
import { Chip, EmptyState, ErrorNote, SkeletonRows } from '../shared/kit/Misc'
import { MonthCalendar, type CalendarDay } from '../shared/kit/MonthCalendar'
import { PeriodNav } from '../shared/kit/PeriodNav'
import { useLayout } from '../shared/kit/layout'
import DaySheet from '../sheets/DaySheet'
import { WeekMatrix, type MatrixCell } from '../shared/kit/WeekMatrix'
import { tone as tones, type Tone } from '../shared/kit/tokens'
import { initials } from '../shared/shifts'
import { plural } from '../shared/format'
import { currentMonth, dayLabel, monthLabel, monthStart, timeLabel, today as todayDate, weekLabel, weekStartOf } from '../shared/dates'
import type { Shift } from '../entities/types'
import { keys } from '../services/queries'
import { listEmployees } from '../services/employees'
import { listShifts, listShiftsRange } from '../services/shifts'
import { dayView } from '../features/schedule/dayTone'
import { slotsForDay } from '../entities/slots'
import { useOrg } from '../app/OrgContext'
import { useNav } from '../app/nav'
import { useSheets } from '../app/sheets'
import { IconSchedule, IconSend } from '../shared/kit/icons'

type Mode = 'month' | 'week'
const dateOf = (shift:Shift) => shift.workDate ?? dayjs(shift.startsAt).format('YYYY-MM-DD')
const isWorking = (shift:Shift) => shift.status !== 'REPLACED' && shift.status !== 'NO_SHOW'

/**
 * График.
 *
 * Переключатель всегда «Месяц / Неделя», при любом фильтре. Месяц — сетка одной точки:
 * месяц на три точки в 390px не помещается и превращается в кашу, поэтому при «Все ПВЗ»
 * вместо сетки просим выбрать точку. Неделя — список дней одной точки или матрица
 * «неделя × ПВЗ» для всех.
 *
 * Неделя грузится по своим датам, а не из месяца: иначе дни соседнего месяца на стыке
 * выглядели пустыми и красными, хотя смены там стоят.
 *
 * На телефоне нажатие на день сразу открывает шторку дня; на десктопе день открывается
 * справа от сетки, без шторки.
 */
export default function Schedule() {
  const [params] = useSearchParams()
  // Одна точка — считаем выбранной: иначе у нового владельца «Все ПВЗ» прячет месяц,
  // хотя выбирать ему не из чего. Фильтр в шапке при этом не трогаем.
  const { scheduleMonth: month, setScheduleMonth, defaultPointId: pointId, points, pointName, pointTitle } = useOrg()
  const { open } = useSheets()
  const { push } = useNav()
  const { desktop } = useLayout()
  const today = todayDate()
  const activePoints = points.filter(point => !point.archivedAt)
  const point = points.find(item => item.id === pointId)

  const [mode, setMode] = useState<Mode>(() => pointId ? 'month' : 'week')
  const [picked, setPicked] = useState<string | undefined>()
  const [weekStart, setWeekStart] = useState(() => weekStartOf(month === today.slice(0, 7) ? today : monthStart(month)))
  const weekEnd = dayjs(weekStart).add(6, 'day').format('YYYY-MM-DD')

  // Месяц сменили стрелками или в шапке — неделя встаёт в него. Если неделя уже в этом
  // месяце (её пролистали и месяц пошёл следом), не трогаем.
  useEffect(() => {
    if (dayjs(weekStart).add(3, 'day').format('YYYY-MM') !== month) {
      setWeekStart(weekStartOf(month === today.slice(0, 7) ? today : monthStart(month)))
    }
    setPicked(current => current?.startsWith(month) ? current : undefined)
  }, [month]) // eslint-disable-line react-hooks/exhaustive-deps

  const monthShifts = useQuery({
    queryKey: keys.shifts(month, pointId),
    queryFn: () => listShifts(month, pointId),
    enabled: !!pointId && mode === 'month',
  })
  const weekShifts = useQuery({
    queryKey: keys.shiftsRange(weekStart, weekEnd, pointId),
    queryFn: () => listShiftsRange(weekStart, weekEnd, pointId || undefined),
    enabled: mode === 'week',
  })
  const current = mode === 'month' ? monthShifts : weekShifts
  const employees = useQuery({ queryKey: keys.employees(), queryFn: () => listEmployees() })
  const nameOf = (id:string) => employees.data?.find(employee => employee.id === id)?.fullName ?? 'Сотрудник'

  // Куда продолжать: день после последней запланированной смены пункта.
  const horizon = dayjs(today).add(120, 'day').format('YYYY-MM-DD')
  const ahead = useQuery({
    queryKey: keys.shiftsRange(today, horizon, pointId),
    queryFn: () => listShiftsRange(today, horizon, pointId),
    enabled: !!pointId,
  })
  const lastPlanned = (ahead.data ?? []).filter(isWorking).map(dateOf).sort().at(-1)
  const continueFrom = lastPlanned ? dayjs(lastPlanned).add(1, 'day').format('YYYY-MM-DD') : undefined
  const buildFrom = (date?:string) => push(pointId ? `/sched/build?point=${pointId}${date ? `&from=${date}` : ''}` : '/sched/build')

  const openDay = (id:string, date:string) => open('day', { pointId: id, date, pointLabel: pointName(id) })
  // Десктоп показывает день справа, телефон — шторкой: подсказка «нажмите на день» теперь правда.
  const pickDay = (date:string) => { if (desktop) setPicked(date); else if (pointId) openDay(pointId, date) }

  // `/sched?d=…&pvz=…` с главной: «что сегодня на этой точке» — сразу день этой точки.
  const linked = useRef(false)
  useEffect(() => {
    const date = params.get('d'), pvz = params.get('pvz') || pointId
    if (linked.current || !date || !pvz) return
    linked.current = true
    if (desktop && pvz === pointId) setPicked(date)
    else openDay(pvz, date)
  }, [params, pointId, desktop]) // eslint-disable-line react-hooks/exhaustive-deps

  // В клетке телефона помещается пять букв имени; на десктопе — имя целиком и инициал
  // фамилии, чтобы двух Ирин на одной точке можно было различить.
  const cellName = (shift:Shift) => {
    const [first, last] = nameOf(shift.employeeId).split(' ')
    return `${desktop ? `${first}${last ? ` ${last[0]}.` : ''}` : first.slice(0, 5)}${shift.payMode === 'HALF' ? ' ½' : ''}`
  }

  const byDate = useMemo(() => {
    const map = new Map<string, Shift[]>()
    for (const shift of current.data ?? []) map.set(dateOf(shift), [...(map.get(dateOf(shift)) ?? []), shift])
    return map
  }, [current.data])

  const monthDays = useMemo(() => {
    const first = dayjs(monthStart(month))
    const result = new Map<string, CalendarDay>()
    for (let index = 0; index < first.daysInMonth(); index += 1) {
      const date = first.add(index, 'day').format('YYYY-MM-DD')
      const need = slotsForDay(point?.slotConfig, date)
      result.set(date, { date, ...dayView(byDate.get(date) ?? [], date, today, nameOf, { need, label: cellName, max: desktop ? 3 : 2 }) })
    }
    return result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byDate, month, today, employees.data, point, desktop])

  const weekDates = Array.from({ length: 7 }, (_, index) => dayjs(weekStart).add(index, 'day').format('YYYY-MM-DD'))

  const matrixRows = useMemo(() => activePoints.map(item => {
    const cells = new Map<string, MatrixCell>()
    for (const date of weekDates) {
      const shifts = (byDate.get(date) ?? []).filter(shift => shift.pickupPointId === item.id)
      cells.set(date, dayView(shifts, date, today, nameOf, { need: slotsForDay(item.slotConfig, date) }))
    }
    return { id: item.id, label: item.name.replace(/^ПВЗ\s+/, ''), cells }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [activePoints, byDate, weekStart, today, employees.data])

  // Кто стоит за инициалами недели: «ИС» без расшифровки владелец угадывает, а не читает.
  const weekPeople = useMemo(() => {
    const ids = new Set<string>()
    for (const date of weekDates) for (const shift of byDate.get(date) ?? []) if (shift.status !== 'REPLACED') ids.add(shift.employeeId)
    return [...ids].map(nameOf).sort((a, b) => a.localeCompare(b, 'ru'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byDate, weekStart, employees.data])

  const days = [...monthDays.values()]
  const gaps = days.filter(day => day.vacant).length
  const pastEmpty = days.filter(day => day.date < today && !(byDate.get(day.date) ?? []).some(isWorking)).length

  const shiftMonth = (step:number) => setScheduleMonth(dayjs(`${month}-01`).add(step, 'month').format('YYYY-MM'))
  const shiftWeek = (step:number) => {
    const next = dayjs(weekStart).add(step, 'week').format('YYYY-MM-DD')
    setWeekStart(next)
    // Месяц в шапке идёт за неделей — по четвергу, как считают недели в календаре.
    const nextMonth = dayjs(next).add(3, 'day').format('YYYY-MM')
    if (nextMonth !== month) setScheduleMonth(nextMonth)
  }

  const legend = <Legend people={pointId ? [] : weekPeople}/>

  const monthView = !pointId
    ? <Card>
      <EmptyState
        title="Месяц показывается для одного ПВЗ"
        sub="Для всех точек сразу есть неделя. Чтобы увидеть месяц, выберите ПВЗ."
        action={<Button variant="secondary" onClick={() => open('pvzPick', { withAll: false })}>Выбрать ПВЗ</Button>}
      />
    </Card>
    : <>
      <PeriodNav unit="month" label={monthLabel(month)} onStep={shiftMonth}/>
      {!!gaps && !monthShifts.isLoading && <div role="status" className="mb-2 rounded-md border border-bad bg-bad-tint px-3 py-2 text-sub font-medium text-bad-strong">
        {gaps} {plural(gaps, 'день', 'дня', 'дней')} без сотрудника. Нажмите на день с пунктирной рамкой, чтобы поставить человека.
      </div>}
      {monthShifts.isLoading
        ? <Card><SkeletonRows rows={5}/></Card>
        : <MonthCalendar month={month} days={monthDays} selected={desktop ? picked : undefined} onPick={pickDay}/>}
      {!monthShifts.isLoading && <>
        {legend}
        {!gaps && !pastEmpty && <div className="mt-2 text-sub text-muted">Каждый день месяца закрыт сменой</div>}
        {!gaps && !!pastEmpty && <div className="mt-2 text-sub text-muted">Без смен прошло {pastEmpty} {plural(pastEmpty, 'день', 'дня', 'дней')}</div>}
      </>}
    </>

  const weekView = <>
    <PeriodNav unit="week" label={weekLabel(weekStart)} onStep={shiftWeek}/>
    {weekShifts.isLoading
      ? <Card><SkeletonRows rows={5}/></Card>
      : pointId
        ? <Card>
          <List>
            {weekDates.map(date => {
              const shifts = (byDate.get(date) ?? []).filter(shift => shift.status !== 'REPLACED')
              const need = slotsForDay(point?.slotConfig, date)
              const view = dayView(shifts, date, today, nameOf, { need })
              const working = shifts.filter(isWorking)
              const missing = need - working.length
              return <ListRow
                key={date}
                leading={<div className="w-8 flex-none text-center">
                  <div className="font-mono text-axis text-muted">{dayjs(date).format('dd')}</div>
                  <div className={`mx-auto flex h-6 min-w-6 items-center justify-center text-title leading-none font-semibold tabular-nums ${date === today ? 'rounded-full bg-accent px-1 text-white' : ''}`}>
                    {dayjs(date).date()}
                  </div>
                </div>}
                title={working.length
                  ? working.map(shift => nameOf(shift.employeeId)).join(', ')
                  : view.vacant
                    ? <span className="font-semibold text-bad-strong">Нужен сотрудник</span>
                    : <span className="text-muted">{shifts.length ? 'Не вышел' : 'Никто не работал'}</span>}
                sub={view.vacant && working.length
                  ? <span className="font-medium text-bad-strong">Не хватает ещё {missing} {plural(missing, 'сотрудника', 'сотрудников', 'сотрудников')}</span>
                  : working.map(shift => `${timeLabel(shift.startsAt)}–${timeLabel(shift.endsAt)}${shift.payMode === 'HALF' ? ' · ½ смены' : ''}`).join(' · ') || undefined}
                chevron
                className={view.vacant ? 'border-l-[3px] border-bad bg-bad-tint/60' : undefined}
                align="start"
                onClick={() => pickDay(date)}
              />
            })}
          </List>
        </Card>
        // В матрице клетка — это конкретная точка в конкретном дне, поэтому
        // открываем сразу день этой точки, а не общий список.
        : <WeekMatrix weekStart={weekStart} rows={matrixRows} onPick={openDay}/>}
    {!weekShifts.isLoading && !pointId && legend}
  </>

  const board = <>
    <Segmented
      className="mb-3"
      value={mode}
      onChange={setMode}
      options={[{ value: 'month', label: 'Месяц' }, { value: 'week', label: 'Неделя' }]}
    />
    {current.error && <div className="mb-3"><ErrorNote error={current.error}/></div>}
    {mode === 'month' ? monthView : weekView}
    <Button block className="mt-4" onClick={() => buildFrom(continueFrom)}>
      <span className="inline-flex items-center justify-center gap-2"><IconSchedule/>{continueFrom ? `Продолжить график с ${dayLabel(continueFrom)}` : 'Заполнить график'}</span>
    </Button>
    <Button block variant="secondary" className="mt-2" onClick={() => push('/sched/share')}>
      <span className="inline-flex items-center justify-center gap-2"><IconSend/>Поделиться</span>
    </Button>
  </>

  // Год в чипе — только когда он не текущий: «Январь» рядом с декабрём иначе читается как прошлый.
  const period = monthLabel(month).split(' ')[0] + (month.slice(0, 4) === currentMonth().slice(0, 4) ? '' : ` ${month.slice(0, 4)}`)
  const filters = <FilterRow>
    <Chip onClick={() => open('pvzPick')}>{pointTitle}</Chip>
    <Chip onClick={() => open('monthPick', { value: month, onPick: setScheduleMonth })}>{period}</Chip>
  </FilterRow>

  // Все ПВЗ: день открывается шторкой конкретной точки, правой колонке показывать нечего.
  if (!desktop || !pointId) return <Screen wide={desktop} filters={filters}>{board}</Screen>

  // Master–detail десктопа: сетка слева, выбранный день справа, а не под ней —
  // на широком экране день под сеткой уезжает за нижний край.
  return <Screen wide filters={filters}>
    <div className="grid grid-cols-[minmax(0,1fr)_340px] items-start gap-6">
      <div>{board}</div>
      {/* Первый блок колонки встаёт вровень с переключателем слева — без отступа заголовка раздела. */}
      <div className="sticky top-0 [&>:first-child]:mt-0">
        {picked
          ? <>
            <SectionTitle>{dayLabel(picked)} · {dayjs(picked).format('dddd')}</SectionTitle>
            <DaySheet key={`${pointId}-${picked}`} inline pointId={pointId} date={picked}/>
          </>
          : <Card><EmptyState title="Выберите день" sub="Смены дня появятся здесь — без шторки поверх сетки"/></Card>}
      </div>
    </div>
  </Screen>
}

const LEGEND:{ tone:Tone; label:string; dashed?:boolean }[] = [
  { tone: 'accent', label: 'по плану' },
  { tone: 'ok', label: 'отработана' },
  { tone: 'warn', label: '½ смены или часы' },
  { tone: 'bad', label: 'не вышел' },
  { tone: 'bad', label: 'нужен сотрудник', dashed: true },
]

/** Расшифровка сетки: ровно те клетки, что бывают в сетке, и, в матрице всех ПВЗ, чьи это инициалы. */
function Legend({ people }:{ people:string[] }) {
  return <div className="mt-2.5 text-lbl text-muted">
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {LEGEND.map(item => <span key={item.label} className="flex items-center gap-1.5">
        <span
          aria-hidden
          className={`size-3 rounded-[3px] ${item.dashed ? 'border-[1.5px] border-dashed' : 'border'}`}
          style={{ background: tones[item.tone].bg, borderColor: tones[item.tone].fg }}
        />
        {item.label}
      </span>)}
    </div>
    {!!people.length && <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
      {people.map(name => <span key={name}><b className="font-semibold text-muted-strong">{initials(name)}</b> {name}</span>)}
    </div>}
  </div>
}
