import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { Screen, Header } from '../shared/kit/Screen'
import { Card } from '../shared/kit/Card'
import { Button, TextButton } from '../shared/kit/Button'
import { SectionTitle } from '../shared/kit/Text'
import { Banner } from '../shared/kit/Field'
import { SkeletonRows } from '../shared/kit/Misc'
import { ChoiceChips } from '../shared/kit/PickList'
import { Stepper } from '../shared/kit/Segmented'
import { MonthCalendar, type CalendarDay } from '../shared/kit/MonthCalendar'
import { DateField } from '../shared/kit/DateField'
import { dayLabel, monthLabel, today, weekStartOf } from '../shared/dates'
import { defaultShiftTimes } from '../shared/shiftTimes'
import type { PayMode, Shift, SlotConfig } from '../entities/types'
import { planCells, slotsForDay } from '../entities/slots'
import { anchorFrom, inferRule, positionOf, makeSampleWeek, repeatSampleWeek, weeksOfMonth, type DraftDay, type DraftWeek, type Seats, type TeamRule } from '../features/schedule/guidedSchedule'
import { QuickAddEmployee } from '../features/schedule/QuickAddEmployee'
import { listShiftsRange, deleteShiftSafe } from '../services/shifts'
import { applyCells } from '../services/schedule'
import { listEmployees } from '../services/employees'
import { setSlotConfig } from '../services/points'
import { keys, scope } from '../services/queries'
import { useOrg } from '../app/OrgContext'
import { useNav } from '../app/nav'
import { useSheets } from '../app/sheets'
import { toastDone, toastError, toastWarn } from '../shared/kit/Toaster'
import { Chevron } from '../shared/kit/icons'

type Step = 1 | 2 | 3
const dateOf = (shift:Shift) => shift.workDate ?? dayjs(shift.startsAt).format('YYYY-MM-DD')
const isProtectedShift = (shift:Shift) => shift.status !== 'PLANNED' || !dayjs(shift.startsAt).isAfter(dayjs())
const shortDate = (date:string) => dayjs(date).format('D MMM')

/** Настройка команды → исправление недели → её точное повторение. */
export default function ScheduleBuilder() {
  // Мастер открывают из графика: месяц — листаемый там, и туда же возвращаемся после сохранения.
  const { scheduleMonth: month, pointId, defaultPointId, points, setScheduleMonth, setPointId } = useOrg()
  const { back } = useNav()
  const { open } = useSheets()
  const client = useQueryClient()
  const activePoints = points.filter(point => !point.archivedAt)
  const [step, setStep] = useState<Step>(1)
  // `?point=…&from=…` — «Продолжить график» и «Новый график с этого дня» с экрана графика.
  const [params] = useSearchParams()
  const pointParam = activePoints.some(item => item.id === params.get('point')) ? params.get('point')! : ''
  const fromParam = /^\d{4}-\d{2}-\d{2}$/.test(params.get('from') ?? '') ? params.get('from')! : ''
  const [target, setTarget] = useState(pointParam || pointId || defaultPointId || activePoints[0]?.id || '')
  const [seats, setSeats] = useState<Seats>(() => points.find(point => point.id === (pointParam || pointId || defaultPointId || activePoints[0]?.id))?.slotConfig?.def === 2 ? 2 : 1)
  const [firstRun, setFirstRun] = useState(2)
  const [secondRun, setSecondRun] = useState(2)
  const [teams, setTeams] = useState<[string[], string[]]>([[], []])
  const [payMode, setPayMode] = useState<PayMode>('FULL')
  // Как график идёт сейчас: в этот день работает первый/второй, и это его N-й день подряд.
  // Отсюда считается начало очереди — так график из тетради переносится без вычислений в уме.
  const [startDate, setStartDate] = useState(() => fromParam || (month > dayjs().format('YYYY-MM') ? `${month}-01` : today()))
  const [startGroup, setStartGroup] = useState<0 | 1>(0)
  const [startDayRaw, setStartDay] = useState(1)
  const [edits, setEdits] = useState<DraftWeek>({})
  const [editing, setEditing] = useState<string | null>(null)
  const [targetWeeks, setTargetWeeks] = useState<string[]>([])
  const [monthLimit, setMonthLimit] = useState<string | undefined>()
  const [previewMonth, setPreviewMonth] = useState(month)
  const [failures, setFailures] = useState<string[]>([])
  // Показываем незаполненное только после попытки идти дальше, а не с порога.
  const [triedNext, setTriedNext] = useState(false)

  const point = activePoints.find(item => item.id === target)
  const times = defaultShiftTimes(point)
  const staff = useQuery({ queryKey: keys.employees(), queryFn: () => listEmployees() })
  // Прежний график пункта до выбранного дня: мастер продолжает его, а не начинает с нуля.
  const historyFrom = dayjs(startDate).subtract(42, 'day').format('YYYY-MM-DD')
  const historyTo = dayjs(startDate).subtract(1, 'day').format('YYYY-MM-DD')
  const history = useQuery({
    queryKey: keys.shiftsRange(historyFrom, historyTo, target),
    queryFn: () => listShiftsRange(historyFrom, historyTo, target),
    enabled: !!target,
  })
  const [inferredFor, setInferredFor] = useState<string>()
  const [inferred, setInferred] = useState<ReturnType<typeof inferRule>>(null)
  useEffect(() => {
    // Один раз на пункт: дальше правило принадлежит человеку, и повторная подстановка стёрла бы его правки.
    if (!history.data || inferredFor === target) return
    const rule = inferRule(history.data, startDate)
    setInferredFor(target)
    setInferred(rule)
    if (!rule) return
    setSeats(rule.seats); setTeams(rule.teams); setFirstRun(rule.firstRun); setSecondRun(rule.secondRun)
    setStartGroup(rule.startGroup); setStartDay(rule.startDay)
  }, [history.data, target]) // eslint-disable-line react-hooks/exhaustive-deps
  const people = (staff.data ?? []).filter(person => person.status === 'ACTIVE' && person.pickupPointIds.includes(target))
  const nameOf = (id:string | null) => id ? staff.data?.find(person => person.id === id)?.fullName ?? 'Сотрудник' : 'Не назначен'
  const runOf = (group:0 | 1) => group === 0 ? firstRun : secondRun
  const startDay = Math.min(startDayRaw, runOf(startGroup))
  const anchor = anchorFrom(startDate, startGroup, startDay, firstRun)
  // Заполняем с выбранного дня, но не раньше сегодняшнего: прошлое не переписываем.
  const fillFrom = startDate > today() ? startDate : today()
  const sourceWeek = weekStartOf(startDate)
  const sourceMonth = startDate.slice(0, 7)
  const rule:TeamRule = { pointId: target, anchor, start: startDate, seats, firstRun, secondRun, teams, payMode }
  const generated = useMemo(() => makeSampleWeek(rule), [target, anchor, startDate, seats, firstRun, secondRun, teams, payMode]) // eslint-disable-line react-hooks/exhaustive-deps
  const sample = useMemo<DraftWeek>(() => ({ ...generated, ...edits }), [generated, edits])
  const repeat = useMemo(() => repeatSampleWeek(rule, edits, targetWeeks, monthLimit, today()), [target, anchor, startDate, seats, firstRun, secondRun, teams, payMode, edits, targetWeeks, monthLimit]) // eslint-disable-line react-hooks/exhaustive-deps
  const selectedDates = Object.keys(repeat.days).sort()
  const monthFirst = `${previewMonth}-01`
  const monthLast = dayjs(monthFirst).endOf('month').format('YYYY-MM-DD')
  const rangeFrom = [sourceWeek, monthFirst, selectedDates[0]].filter(Boolean).sort()[0]
  const rangeTo = [dayjs(sourceWeek).add(6, 'day').format('YYYY-MM-DD'), monthLast, selectedDates.at(-1)].filter(Boolean).sort().at(-1)!
  const existing = useQuery({
    queryKey: keys.shiftsRange(rangeFrom, rangeTo, target),
    queryFn: () => listShiftsRange(rangeFrom, rangeTo, target),
    enabled: !!target && step >= 2,
  })

  const plan = useMemo(() => {
    const changed = repeat.cells.filter(cell => !(existing.data ?? []).some(shift =>
      !isProtectedShift(shift) && dateOf(shift) === cell.date && shift.pickupPointId === cell.pointId
      && (shift.slotIndex ?? 0) === cell.slotIndex && shift.employeeId === cell.employeeId
      && shift.payMode === cell.payMode
      && dayjs(shift.startsAt).format('HH:mm') === times.startsAt
      && dayjs(shift.endsAt).format('HH:mm') === times.endsAt,
    ))
    return planCells(changed, (existing.data ?? []).map(shift => isProtectedShift(shift) && shift.status === 'PLANNED' ? { ...shift, status: 'ON_DUTY' } : shift))
  }, [repeat.cells, existing.data, times.startsAt, times.endsAt])
  const toRemove = useMemo(() => (existing.data ?? []).filter(shift => {
    const day = repeat.days[dateOf(shift)]
    return !isProtectedShift(shift) && day && !repeat.cells.some(cell =>
      cell.date === dateOf(shift) && cell.slotIndex === (shift.slotIndex ?? 0))
  }), [existing.data, repeat.days, repeat.cells])
  const protectedShifts = useMemo(() => (existing.data ?? []).filter(shift => {
    const day = repeat.days[dateOf(shift)]
    return day && isProtectedShift(shift) && shift.status !== 'REPLACED'
      && !repeat.cells.some(cell => cell.date === dateOf(shift) && cell.slotIndex === (shift.slotIndex ?? 0))
  }), [existing.data, repeat.days, repeat.cells])
  const gaps = selectedDates.filter(date => repeat.days[date].employeeIds.filter(Boolean).length < repeat.days[date].required).length
  const hasWorker = teams.some(team => team.some(Boolean))
  const incomplete = teams.map(team => team.length < seats)
  const selectedWeekDates = new Set(targetWeeks.flatMap(week => Array.from({ length: 7 }, (_, offset) => dayjs(week).add(offset, 'day').format('YYYY-MM-DD'))))

  const calendar = useMemo(() => {
    const result = new Map<string, CalendarDay>()
    const first = dayjs(`${previewMonth}-01`)
    for (let offset = 0; offset < first.daysInMonth(); offset += 1) {
      const date = first.add(offset, 'day').format('YYYY-MM-DD')
      const draft = repeat.days[date]
      const saved = (existing.data ?? []).filter(shift => dateOf(shift) === date && shift.status !== 'REPLACED' && shift.status !== 'NO_SHOW')
      const planned = draft?.employeeIds.filter(Boolean) ?? []
      const names = draft ? planned.map(id => nameOf(id).split(' ')[0].slice(0, 5)) : saved.map(shift => nameOf(shift.employeeId).split(' ')[0].slice(0, 5))
      const changed = draft && (plan.toAdd.some(item => item.date === date) || toRemove.some(item => dateOf(item) === date))
      const replaced = draft && plan.conflicts.some(item => item.cell.date === date)
      const missing = draft && planned.length < draft.required
      result.set(date, {
        date,
        lines: missing ? [...names.slice(0, 1), 'своб.'] : names.length ? names.slice(0, 2) : ['нет'],
        tone: replaced ? 'warn' : missing ? 'bad' : changed ? 'accent' : saved.length ? 'neutral' : 'neutral',
        strong: Boolean(replaced || missing),
      })
    }
    return result
  }, [previewMonth, repeat.days, existing.data, plan, toRemove, staff.data]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Имена в очереди: «Иван», «Ирина и Дмитрий»; пока не выбраны — «Первый сотрудник». */
  const groupLabel = (group:0 | 1) => teams[group].length ? teams[group].map(id => nameOf(id).split(' ')[0]).join(' и ') : groupName(group)
  /** Ближайшие дни словами: «чт 24 — Иван (2-й день) · пт 25–сб 26 — Миша · …». */
  const runsFrom = (date:string) => {
    const runs:{ from:string; to:string; group:0 | 1; day:number }[] = []
    for (let offset = 0; offset < 7; offset += 1) {
      const current = dayjs(date).add(offset, 'day').format('YYYY-MM-DD')
      const position = positionOf(rule, current)
      const last = runs.at(-1)
      if (last && last.group === position.group) last.to = current
      else runs.push({ from: current, to: current, group: position.group, day: position.day })
    }
    const short = (value:string) => dayjs(value).format('dd D')
    return runs.map((run, index) => `${run.from === run.to ? short(run.from) : `${short(run.from)}–${short(run.to)}`} — ${groupLabel(run.group)}${index === 0 && run.day > 1 ? ` (${run.day}-й день)` : ''}`).join(' · ')
  }
  const groupName = (index:0 | 1) => seats === 2
    ? (index === 0 ? 'Первая пара' : 'Вторая пара')
    : (index === 0 ? 'Первый сотрудник' : 'Второй сотрудник')
  const toggleTeamMember =(teamIndex:0 | 1, employeeId:string) => setTeams(current => {
    const otherIndex = teamIndex === 0 ? 1 : 0
    const team = current[teamIndex], other = current[otherIndex]
    const next:[string[], string[]] = [[...current[0]], [...current[1]]]
    if (team.includes(employeeId)) { next[teamIndex] = team.filter(id => id !== employeeId); return next }
    // Один в смене: выбор заменяется, а если человек стоял в другой очереди — они меняются местами.
    if (seats === 1) {
      next[teamIndex] = [employeeId]
      if (other.includes(employeeId)) next[otherIndex] = team.slice(0, 1)
      return next
    }
    if (team.length >= seats) return current
    next[teamIndex] = [...team, employeeId]
    next[otherIndex] = other.filter(id => id !== employeeId)
    return next
  })
  /** Новый сотрудник встаёт на первое свободное место. */
  const addToFreeSlot = (employeeId:string) => setTeams(current => {
    const free = current.findIndex(team => team.length < seats)
    if (free < 0) return current
    const next:[string[], string[]] = [[...current[0]], [...current[1]]]
    next[free] = [...next[free], employeeId]
    return next
  })
  const editDay = (date:string, change:Partial<DraftDay>) => {
    const current = sample[date]
    if (!current) return
    setEdits(previous => ({ ...previous, [date]: { ...current, ...change } }))
  }
  const chooseSeats = (count:Seats) => {
    setSeats(count)
    setTeams(current => [current[0].slice(0, count), current[1].slice(0, count)])
    if (count === 1) setPayMode('FULL')
  }
  const choosePoint = (id:string) => {
    setTarget(id)
    setSeats(activePoints.find(item => item.id === id)?.slotConfig?.def === 2 ? 2 : 1)
    setTeams([[], []]); setEdits({}); setTargetWeeks([])
  }
  const selectWeek = (week:string) => {
    if (week === sourceWeek || dayjs(week).add(6, 'day').format('YYYY-MM-DD') < fillFrom) return
    setMonthLimit(undefined)
    setTargetWeeks(current => current.includes(week) ? current.filter(item => item !== week) : [...current, week].sort())
  }

  const apply = useMutation({
    mutationFn: async () => {
      const failed:string[] = []
      let removed = 0
      for (const shift of toRemove) {
        try {
          const outcome = await deleteShiftSafe(shift.id)
          if (outcome === 'linked') failed.push(`${shortDate(dateOf(shift))}: смена связана с удержанием`)
          else removed += 1
        } catch (error) { failed.push(`${shortDate(dateOf(shift))}: ${error instanceof Error ? error.message : 'не удалось убрать смену'}`) }
      }
      const written = await applyCells(plan, { ...times, payMode, strategy: 'replace' })
      failed.push(...written.failed.map(item => `${shortDate(item.date)}: ${item.reason}`))
      if (!failed.length && point) {
        const dates = { ...point.slotConfig?.dates }
        for (const [date, day] of Object.entries(repeat.days)) {
          if (day.required === seats) delete dates[date]
          else dates[date] = day.required
        }
        try { await setSlotConfig(point.id, { def: seats, dates }) }
        catch (error) { failed.push(`Настройка числа сотрудников: ${error instanceof Error ? error.message : 'не сохранена'}`) }
      }
      return { ...written, removed, failed }
    },
    onSuccess: result => {
      void client.invalidateQueries({ queryKey: scope.shifts })
      void client.invalidateQueries({ queryKey: scope.points })
      if (result.failed.length) {
        setFailures(result.failed)
        toastWarn(`Сохранено ${result.added + result.replaced + result.removed}, ошибок ${result.failed.length}`)
      } else {
        setPointId(target)
        setScheduleMonth(targetWeeks.length ? dayjs(targetWeeks.at(-1)!).add(3, 'day').format('YYYY-MM') : sourceMonth)
        toastDone(`График сохранён: ${result.added} новых, ${result.replaced} замен, ${result.removed} снято`)
        back()
      }
    },
    onError: error => toastWarn(error instanceof Error ? error.message : 'Не удалось сохранить график'),
  })
  const confirmSave = () => {
    const message = `Новых смен: ${plan.toAdd.length}. Замен: ${plan.conflicts.length}. Снимается: ${toRemove.length}.`
      + (gaps ? ` Дней с незакрытыми местами: ${gaps}.` : '')
      + (plan.locked.length || protectedShifts.length ? ` Начавшиеся и закрытые смены не изменятся: ${plan.locked.length + protectedShifts.length}.` : '')
      + ' Проверьте календарь перед сохранением.'
    open('confirm', { text: message, yesLabel: 'Сохранить график', onYes: () => apply.mutate() })
  }

  /** Дальше только с полностью заполненным правилом: иначе показываем, что осталось. */
  const showWeek = () => {
    const missing = incomplete.findIndex(Boolean) as -1 | 0 | 1
    if (missing === -1) { setStep(2); return }
    setTriedNext(true)
    const who = seats === 2 ? `Отметьте двух менеджеров: ${groupName(missing).toLowerCase()}` : `Выберите: ${groupName(missing).toLowerCase()}`
    toastError(people.length < seats * 2 ? `${who}. Не хватает сотрудников — добавьте их ниже` : who)
    document.getElementById(`guide-group-${missing}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
  const backStep = () => { if (step === 1) back(); else setStep(step === 3 ? 2 : 1) }
  const footer = step === 1
    ? <Button block disabled={!target} onClick={showWeek}>Показать неделю</Button>
    : step === 2
      ? <Button block onClick={() => { setEditing(null); setPreviewMonth(sourceMonth); setStep(3) }}>Выбрать недели</Button>
      : <Button block disabled={existing.isLoading || !!existing.error || apply.isPending || !hasWorker} onClick={confirmSave}>
        Сохранить {repeat.cells.length} смен
      </Button>

  return <Screen header={<Header title="Заполнить график" onBack={backStep}/>} footer={footer}>
    <div className="text-sub font-semibold text-accent">Шаг {step} из 3 · {step === 1 ? 'Правило' : step === 2 ? 'Неделя образец' : 'Повторение'}</div>

    {step === 1 && <>
      {inferredFor === target && (inferred || !!history.data?.length) && <Banner tone="info">{inferred
        ? `Продолжаем прежний график: ${groupLabel(0)} и ${groupLabel(1)}, ${inferred.firstRun === inferred.secondRun ? `${inferred.firstRun} через ${inferred.secondRun}` : `${inferred.firstRun} и ${inferred.secondRun} дн. подряд`}.${inferred.irregular ? ' Прежний график был неровным — проверьте формат.' : ''} Поменяйте то, что меняется с ${dayLabel(startDate)}.`
        : `Прежний график до ${dayLabel(startDate)} не распознан — задайте правило.`}</Banner>}
      <SectionTitle>1. Как работает ПВЗ</SectionTitle>
      {activePoints.length > 1 && <button type="button" aria-label="Выбрать ПВЗ"
        onClick={() => open('pvzPick', { value: target, withAll: false, onPick: choosePoint })}
        className="tap flex w-full items-center gap-3 rounded-md border border-line bg-surface px-[14px] py-3 text-left">
        <div className="min-w-0 flex-1">
          <div className="truncate text-row font-medium">{point?.name ?? 'Выберите ПВЗ'}</div>
          {point?.address && <div className="mt-0.5 truncate text-sub text-muted">{point.address}</div>}
        </div>
        <span className="flex-none text-sub font-medium text-accent">Сменить</span>
      </button>}
      {/* Правило показываем, когда прежний график уже прочитан: иначе подстановка пришла бы поверх выбора человека. */}
      {target && inferredFor !== target && !history.error ? <Card className="mt-3"><SkeletonRows rows={4}/></Card> : <>
      <div className="mt-3 text-sub text-muted">Сколько менеджеров одновременно нужно в обычный день?</div>
      <ChoiceChips value={String(seats)} onPick={value => chooseSeats(Number(value) as Seats)} options={[{ value: '1', label: 'Один' }, { value: '2', label: 'Двое' }]}/>
      <SectionTitle>2. График работы</SectionTitle>
      <ChoiceChips value={firstRun === secondRun && firstRun <= 3 ? String(firstRun) : 'custom'} onPick={value => {
        if (value !== 'custom') { setFirstRun(Number(value)); setSecondRun(Number(value)) }
        else { setFirstRun(2); setSecondRun(3) }
      }} options={[{ value: '1', label: '1 через 1' }, { value: '2', label: '2 через 2' }, { value: '3', label: '3 через 3' }, { value: 'custom', label: 'Свой формат' }]}/>
      {(firstRun !== secondRun || firstRun > 3) && <Card className="mt-3 p-3">
        <div className="flex items-center justify-between gap-2"><span>{groupName(0)} работает дней подряд</span><Stepper value={firstRun} min={1} max={14} onChange={setFirstRun}/></div>
        <div className="mt-3 flex items-center justify-between gap-2"><span>{groupName(1)} работает дней подряд</span><Stepper value={secondRun} min={1} max={14} onChange={setSecondRun}/></div>
      </Card>}
      <div className="mt-2 text-sub text-muted">{seats === 2 ? 'Пока одна пара работает, другая отдыхает.' : 'Пока один работает, другой отдыхает.'} Дальше так же по кругу.</div>
      <SectionTitle>{seats === 2 ? '3. Кто в парах' : '3. Кто работает'}</SectionTitle>
      {([0, 1] as const).map(teamIndex => {
        const chosen = teams[teamIndex]
        const other = teams[teamIndex === 0 ? 1 : 0]
        const flagged = triedNext && incomplete[teamIndex]
        return <div key={teamIndex} id={`guide-group-${teamIndex}`} className="scroll-mt-4"><Card className={`mb-3 p-3 ${flagged ? '!border-2 !border-bad' : ''}`}>
          <div role="group" aria-label={groupName(teamIndex)}>
            <div className="font-semibold">{groupName(teamIndex)}</div>
            <div className="mt-1 text-sub text-muted">{seats === 2 ? `Отметьте двух менеджеров · выбрано ${chosen.length} из 2` : 'Выберите сотрудника'}</div>
            {!people.length && <div className="mt-3 text-sub text-bad">Для этого ПВЗ пока нет активных сотрудников.</div>}
            <div className="mt-2 grid gap-1">
              {people.map(person => {
                const checked = chosen.includes(person.id)
                const inOtherTeam = other.includes(person.id)
                const disabled = !checked && seats === 2 && chosen.length >= seats
                return <label key={person.id} className={`flex min-h-11 items-center gap-3 rounded-md px-3 py-2 ${checked ? 'bg-accent-faint' : 'bg-surface-soft'} ${disabled ? 'opacity-55' : ''}`}>
                  <input type={seats === 1 ? 'radio' : 'checkbox'} name={`group-${teamIndex}`} checked={checked} disabled={disabled} onChange={() => toggleTeamMember(teamIndex, person.id)}
                    className="size-5 flex-none" style={{ accentColor: 'var(--color-accent)' }}/>
                  <span className="min-w-0 flex-1 text-row text-ink">{person.fullName}</span>
                  {inOtherTeam && <span className="text-tiny text-muted">{seats === 2 ? (teamIndex === 0 ? 'во второй паре' : 'в первой паре') : (teamIndex === 0 ? 'выходит вторым' : 'выходит первым')}</span>}
                </label>
              })}
            </div>
            {flagged && <div className="mt-2 text-sub font-medium text-bad">{seats === 1 ? 'Выберите сотрудника, без него график не построить.' : `Отметьте ещё ${seats - chosen.length}, без этого график не построить.`}</div>}
          </div>
        </Card></div>
      })}
      {people.length < seats * 2 && <>
        <Banner tone="info">{seats === 1 ? 'Для такого графика нужно два сотрудника.' : 'Для такого графика нужно 4 менеджера.'} Не хватает {seats * 2 - people.length}, добавьте прямо здесь.</Banner>
        <QuickAddEmployee pointId={target} onAdded={addToFreeSlot}/>
      </>}
      {seats === 2 && <>
        <SectionTitle>Оплата двух менеджеров</SectionTitle>
        <ChoiceChips value={payMode} onPick={setPayMode} options={[{ value: 'FULL', label: 'Каждому полная смена' }, { value: 'HALF', label: 'Каждому ½ смены' }]}/>
        <div className="mt-2 text-sub text-muted">У каждого своя ставка. «½ смены» даёт половину его ставки; часы между менеджерами не делятся.</div>
      </>}
      <SectionTitle>4. Как идёт график сейчас</SectionTitle>
      <div className="mb-3 text-sub text-muted">Укажите день и кто в него работает — как в вашей тетради. Дальше очередь продолжится сама.</div>
      <DateField label="День" value={startDate} onChange={setStartDate} hint="С этого дня заполним график. Прошлые дни не трогаем."/>
      <div className="text-sub text-muted">{seats === 2 ? 'Какая пара работает в этот день?' : 'Кто работает в этот день?'}</div>
      <ChoiceChips value={String(startGroup)} onPick={value => setStartGroup(Number(value) as 0 | 1)}
        options={([0, 1] as const).map(group => ({ value: String(group), label: groupLabel(group) }))}/>
      {runOf(startGroup) > 1 && <>
        <div className="mt-3 text-sub text-muted">Какой это день подряд?</div>
        <ChoiceChips value={String(startDay)} onPick={value => setStartDay(Number(value))}
          options={Array.from({ length: runOf(startGroup) }, (_, index) => ({ value: String(index + 1), label: `${index + 1}-й` }))}/>
      </>}
      <div className="mt-3 grid grid-cols-7 gap-1" aria-label="Кто работает на неделе">
        {Array.from({ length: 7 }, (_, offset) => {
          const date = dayjs(sourceWeek).add(offset, 'day').format('YYYY-MM-DD')
          const { group } = positionOf(rule, date)
          const ids = generated[date]?.employeeIds ?? []
          const before = date < fillFrom
          return <button type="button" key={date} aria-pressed={date === startDate} aria-label={`${dayjs(date).format('dd D')}: ${groupLabel(group)}`}
            onClick={() => { const position = positionOf(rule, date); setStartDate(date); setStartGroup(position.group); setStartDay(position.day) }}
            className={`tap min-w-0 rounded-md py-2 text-center ${group === 0 ? 'bg-accent-soft' : 'border border-line bg-surface'} ${date === startDate ? 'ring-2 ring-accent' : ''} ${before ? 'opacity-40' : ''}`}>
            <div className="text-tiny text-muted">{dayjs(date).format('dd D')}</div>
            {ids.map((id, index) => <div key={index} className={`text-[10px] leading-tight tracking-tight [overflow-wrap:anywhere] ${id ? 'font-semibold text-ink' : 'text-muted'}`}>
              {id ? nameOf(id).split(' ')[0] : group === 0 ? '1-й' : '2-й'}
            </div>)}
          </button>
        })}
      </div>
      <div className="mt-2 text-sub text-muted">{runsFrom(startDate)}. Не совпадает с тетрадью — нажмите на нужный день и поправьте ответы.</div>
      </>}
    </>}

    {step === 2 && <>
      <SectionTitle action={<TextButton onClick={() => setStep(1)}>Изменить правило</TextButton>}>Неделя с {shortDate(sourceWeek)}</SectionTitle>
      <div className="text-sub text-muted">Неделя заполнена автоматически. Нажмите на день, чтобы заменить человека или изменить нужное число менеджеров.</div>
      <Card className="mt-3 p-2">
        {Array.from({ length: 7 }, (_, offset) => {
          const date = dayjs(sourceWeek).add(offset, 'day').format('YYYY-MM-DD')
          const day = sample[date]
          if (date < fillFrom) return <div key={date} className="flex items-center gap-2 border-b border-line p-3 text-muted last:border-0">
            <span className="w-14 flex-none font-semibold">{dayjs(date).format('dd D')}</span>
            <span className="flex-1 text-sub">Не заполняем — раньше выбранного дня</span>
          </div>
          return <div key={date} className="border-b border-line last:border-0">
            <button type="button" className="tap flex w-full items-center gap-2 p-3 text-left" onClick={() => setEditing(editing === date ? null : date)}>
              <span className="w-14 flex-none font-semibold">{dayjs(date).format('dd D')}</span>
              <span className="flex-1 text-sub">{day.employeeIds.filter(Boolean).map(id => nameOf(id).split(' ')[0]).join(', ') || 'Никто не назначен'}{day.payMode === 'HALF' ? ' · ½ смены' : ''}</span>
              <span className={day.employeeIds.filter(Boolean).length < day.required ? 'text-bad' : 'text-muted'}>{day.employeeIds.filter(Boolean).length}/{day.required}</span>
            </button>
            {editing === date && <div className="px-3 pb-3">
              <div className="text-sub text-muted">Сколько менеджеров нужно в этот день?</div>
              <ChoiceChips value={String(day.required)} onPick={value => {
                const required = Number(value) as Seats
                editDay(date, { required, employeeIds: required === 1 ? day.employeeIds.slice(0, 1) : [day.employeeIds[0] ?? null, day.employeeIds[1] ?? null], payMode: required === 1 ? 'FULL' : payMode })
              }} options={[{ value: '1', label: 'Один' }, { value: '2', label: 'Двое' }]}/>
              {Array.from({ length: day.required }, (_, slot) => <label key={slot} className="mt-2 block text-sub text-muted">Место {slot + 1}
                <select value={day.employeeIds[slot] ?? ''} onChange={event => {
                  const employeeIds = [...day.employeeIds]
                  employeeIds[slot] = event.target.value || null
                  editDay(date, { employeeIds })
                }} className="mt-1 w-full rounded-md border border-line bg-surface p-3 text-base text-ink">
                  <option value="">Никто не назначен</option>
                  {people.filter(person => person.id === day.employeeIds[slot] || !day.employeeIds.some((id, index) => id === person.id && index !== slot))
                    .map(person => <option key={person.id} value={person.id}>{person.fullName}</option>)}
                </select>
              </label>)}
              {day.required === 2 && <div className="mt-2"><ChoiceChips value={day.payMode} onPick={value => editDay(date, { payMode: value as PayMode })} options={[{ value: 'FULL', label: 'Полная смена' }, { value: 'HALF', label: '½ смены' }]}/></div>}
              <div className="mt-2"><TextButton onClick={() => setEditing(null)}>Готово</TextButton></div>
            </div>}
          </div>
        })}
      </Card>
      <div className="mt-2 text-sub text-muted">{Object.keys(edits).length ? `Исправлено дней: ${Object.keys(edits).length}. Эти правки повторятся в те же дни недели на выбранных неделях.` : 'Правки не обязательны: можно сразу выбрать недели.'}</div>
    </>}

    {step === 3 && <>
      <SectionTitle action={<TextButton onClick={() => setStep(2)}>Исправить неделю</TextButton>}>Куда повторить неделю</SectionTitle>
      <div className="text-sub text-muted">Нажмите на любой день недели в календаре, чтобы заполнить её. Очередь продолжается без сбоя, уже поставленные смены заменятся. Прошедшие дни не меняются.</div>
      <Button block variant="secondary" className="mt-3" onClick={() => {
        setTargetWeeks(weeksOfMonth(sourceWeek, previewMonth, fillFrom))
        setMonthLimit(previewMonth)
      }}>Заполнить весь {monthLabel(previewMonth).toLowerCase()}</Button>
      <SectionTitle action={<div className="flex gap-2">
        <button type="button" aria-label="Предыдущий месяц" className="tap flex size-11 items-center justify-center rounded-md border border-line bg-surface text-accent" onClick={() => setPreviewMonth(dayjs(`${previewMonth}-01`).subtract(1, 'month').format('YYYY-MM'))}><Chevron dir="left" size={22}/></button>
        <button type="button" aria-label="Следующий месяц" className="tap flex size-11 items-center justify-center rounded-md border border-line bg-surface text-accent" onClick={() => setPreviewMonth(dayjs(`${previewMonth}-01`).add(1, 'month').format('YYYY-MM'))}><Chevron size={22}/></button>
      </div>}>{monthLabel(previewMonth)}</SectionTitle>
      <MonthCalendar month={previewMonth} days={calendar} selectedDates={selectedWeekDates} onPick={date => selectWeek(weekStartOf(date))}/>
      <div className="mt-2 text-sub text-muted">Выбрано недель: {targetWeeks.length}. Розовый — новая смена, жёлтый — замена, «своб.» — не хватает менеджера.</div>
      {!!targetWeeks.length && <div className="mt-2 flex flex-wrap gap-2">{targetWeeks.map(week => <Button key={week} variant="secondary" className="!p-2 !text-sub" onClick={() => selectWeek(week)}>С {shortDate(week)} ×</Button>)}</div>}
      <Card className="mt-3 p-3">
        <div className="font-semibold">Добавится {plan.toAdd.length} · заменится {plan.conflicts.length} · снимется {toRemove.length}</div>
        {!!gaps && <div className="mt-1 text-sub text-bad">Дней с пустыми местами: {gaps}. Их можно сохранить и заполнить позже.</div>}
        {!!(plan.locked.length + protectedShifts.length) && <div className="mt-1 text-sub text-muted">Начавшиеся и закрытые смены останутся без изменений: {plan.locked.length + protectedShifts.length}.</div>}
      </Card>
      {!!failures.length && <Banner tone="info">Не сохранилось: {failures.slice(0, 4).join('; ')}. Проверьте календарь и повторите сохранение.</Banner>}
      {!!existing.error && <Banner tone="info">Не удалось загрузить существующие смены. Проверьте соединение и откройте экран снова.</Banner>}
    </>}
  </Screen>
}
