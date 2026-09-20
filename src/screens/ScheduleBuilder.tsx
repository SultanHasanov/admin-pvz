import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { Screen, Header } from '../shared/kit/Screen'
import { Card } from '../shared/kit/Card'
import { Button, TextButton } from '../shared/kit/Button'
import { SectionTitle } from '../shared/kit/Text'
import { Banner } from '../shared/kit/Field'
import { ChoiceChips } from '../shared/kit/PickList'
import { Stepper } from '../shared/kit/Segmented'
import { MonthCalendar, type CalendarDay } from '../shared/kit/MonthCalendar'
import { dayLabel, monthLabel, weekStartOf } from '../shared/dates'
import { defaultShiftTimes } from '../shared/shiftTimes'
import type { PayMode, Shift, SlotConfig } from '../entities/types'
import { planCells, slotsForDay } from '../entities/slots'
import { makeSampleWeek, remainingWeeksOfMonth, repeatSampleWeek, type DraftDay, type DraftWeek, type Seats, type TeamRule } from '../features/schedule/guidedSchedule'
import { listShiftsRange, deleteShiftSafe } from '../services/shifts'
import { applyCells } from '../services/schedule'
import { listEmployees } from '../services/employees'
import { setSlotConfig } from '../services/points'
import { keys, scope } from '../services/queries'
import { useOrg } from '../app/OrgContext'
import { useNav } from '../app/nav'
import { useSheets } from '../app/sheets'
import { toastDone, toastWarn } from '../shared/kit/Toaster'

type Step = 1 | 2 | 3
const dateOf = (shift:Shift) => shift.workDate ?? dayjs(shift.startsAt).format('YYYY-MM-DD')
const isProtectedShift = (shift:Shift) => shift.status !== 'PLANNED' || !dayjs(shift.startsAt).isAfter(dayjs())
const nextMonday = () => dayjs(weekStartOf(dayjs().format('YYYY-MM-DD'))).add(7, 'day').format('YYYY-MM-DD')
const shortDate = (date:string) => dayjs(date).format('D MMM')

/** Настройка команды → исправление недели → её точное повторение. */
export default function ScheduleBuilder() {
  const { month, pointId, defaultPointId, points, setMonth, setPointId } = useOrg()
  const { back } = useNav()
  const { open } = useSheets()
  const client = useQueryClient()
  const activePoints = points.filter(point => !point.archivedAt)
  const [step, setStep] = useState<Step>(1)
  const [target, setTarget] = useState(pointId || defaultPointId || activePoints[0]?.id || '')
  const [seats, setSeats] = useState<Seats>(() => points.find(point => point.id === (pointId || defaultPointId || activePoints[0]?.id))?.slotConfig?.def === 2 ? 2 : 1)
  const [firstRun, setFirstRun] = useState(2)
  const [secondRun, setSecondRun] = useState(2)
  const [teams, setTeams] = useState<[string[], string[]]>([[], []])
  const [payMode, setPayMode] = useState<PayMode>('FULL')
  const [anchor, setAnchor] = useState(() => month === dayjs().format('YYYY-MM') ? nextMonday() : weekStartOf(`${month}-01`))
  const [edits, setEdits] = useState<DraftWeek>({})
  const [editing, setEditing] = useState<string | null>(null)
  const [targetWeeks, setTargetWeeks] = useState<string[]>([])
  const [monthLimit, setMonthLimit] = useState<string | undefined>()
  const [previewMonth, setPreviewMonth] = useState(() => month === dayjs().format('YYYY-MM') ? nextMonday().slice(0, 7) : month)
  const [failures, setFailures] = useState<string[]>([])

  const point = activePoints.find(item => item.id === target)
  const times = defaultShiftTimes(point)
  const staff = useQuery({ queryKey: keys.employees(), queryFn: () => listEmployees() })
  const people = (staff.data ?? []).filter(person => person.status === 'ACTIVE' && person.pickupPointIds.includes(target))
  const nameOf = (id:string | null) => id ? staff.data?.find(person => person.id === id)?.fullName ?? 'Сотрудник' : 'Не назначен'
  const sourceWeek = weekStartOf(anchor)
  const sourceMonth = anchor.slice(0, 7)
  const rule:TeamRule = { pointId: target, anchor, seats, firstRun, secondRun, teams, payMode }
  const generated = useMemo(() => makeSampleWeek(rule), [target, anchor, seats, firstRun, secondRun, teams, payMode]) // eslint-disable-line react-hooks/exhaustive-deps
  const sample = useMemo<DraftWeek>(() => ({ ...generated, ...edits }), [generated, edits])
  const repeat = useMemo(() => repeatSampleWeek(rule, sample, targetWeeks, monthLimit), [target, anchor, seats, firstRun, secondRun, teams, payMode, sample, targetWeeks, monthLimit]) // eslint-disable-line react-hooks/exhaustive-deps
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

  const toggleTeamMember = (teamIndex:0 | 1, employeeId:string) => setTeams(current => {
    const team = current[teamIndex]
    const selected = team.includes(employeeId)
    if (!selected && (team.length >= seats || current[teamIndex === 0 ? 1 : 0].includes(employeeId))) return current
    const next:[string[], string[]] = [[...current[0]], [...current[1]]]
    next[teamIndex] = selected ? team.filter(id => id !== employeeId) : [...team, employeeId]
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
    if (week <= sourceWeek) return
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
        setMonth(targetWeeks.length ? dayjs(targetWeeks.at(-1)!).add(3, 'day').format('YYYY-MM') : sourceMonth)
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

  const backStep = () => { if (step === 1) back(); else setStep(step === 3 ? 2 : 1) }
  const footer = step === 1
    ? <Button block disabled={!target || !hasWorker} onClick={() => setStep(2)}>Показать неделю</Button>
    : step === 2
      ? <Button block onClick={() => { setEditing(null); setPreviewMonth(sourceMonth); setStep(3) }}>Выбрать недели</Button>
      : <Button block disabled={existing.isLoading || !!existing.error || apply.isPending || !hasWorker} onClick={confirmSave}>
        Сохранить {repeat.cells.length} смен
      </Button>

  return <Screen header={<Header title="Заполнить график" onBack={backStep}/>} footer={footer}>
    <div className="text-sub font-semibold text-accent">Шаг {step} из 3 · {step === 1 ? 'Правило' : step === 2 ? 'Неделя образец' : 'Повторение'}</div>

    {step === 1 && <>
      <SectionTitle>1. Как работает ПВЗ</SectionTitle>
      {activePoints.length > 1 && <ChoiceChips value={target} onPick={choosePoint} options={activePoints.map(item => ({ value: item.id, label: item.name.replace(/^ПВЗ\s+/, '') }))}/>}
      <div className="mt-3 text-sub text-muted">Сколько менеджеров одновременно нужно в обычный день?</div>
      <ChoiceChips value={String(seats)} onPick={value => chooseSeats(Number(value) as Seats)} options={[{ value: '1', label: 'Один' }, { value: '2', label: 'Двое' }]}/>
      <SectionTitle>2. Как чередуются команды</SectionTitle>
      <div className="text-sub text-muted">Сначала работает команда А, затем команда Б. Выходные повторяются по кругу.</div>
      <ChoiceChips value={firstRun === secondRun && firstRun <= 3 ? String(firstRun) : 'custom'} onPick={value => {
        if (value !== 'custom') { setFirstRun(Number(value)); setSecondRun(Number(value)) }
        else { setFirstRun(2); setSecondRun(3) }
      }} options={[{ value: '1', label: '1/1' }, { value: '2', label: '2/2' }, { value: '3', label: '3/3' }, { value: 'custom', label: 'Свой формат' }]}/>
      {(firstRun !== secondRun || firstRun > 3) && <Card className="mt-3 p-3">
        <div className="flex items-center justify-between gap-2"><span>Команда А · дней подряд</span><Stepper value={firstRun} min={1} max={14} onChange={setFirstRun}/></div>
        <div className="mt-3 flex items-center justify-between gap-2"><span>Команда Б · дней подряд</span><Stepper value={secondRun} min={1} max={14} onChange={setSecondRun}/></div>
      </Card>}
      <SectionTitle>3. Кто в командах</SectionTitle>
      {([0, 1] as const).map(teamIndex => {
        const letter = teamIndex === 0 ? 'А' : 'Б'
        const chosen = teams[teamIndex]
        const other = teams[teamIndex === 0 ? 1 : 0]
        return <Card key={teamIndex} className="mb-3 p-3">
          <div role="group" aria-label={`Команда ${letter}`}>
            <div className="font-semibold">Команда {letter} · {teamIndex === 0 ? firstRun : secondRun} дн.</div>
            <div className="mt-1 text-sub text-muted">Отметьте {seats === 2 ? 'двух менеджеров' : 'одного менеджера'} · выбрано {chosen.length} из {seats}</div>
            {!people.length && <div className="mt-3 text-sub text-bad">Для этого ПВЗ пока нет активных сотрудников.</div>}
            <div className="mt-2 grid gap-1">
              {people.map(person => {
                const checked = chosen.includes(person.id)
                const inOtherTeam = other.includes(person.id)
                const disabled = !checked && (inOtherTeam || chosen.length >= seats)
                return <label key={person.id} className={`flex min-h-11 items-center gap-3 rounded-md px-3 py-2 ${checked ? 'bg-accent-faint' : 'bg-surface-soft'} ${disabled ? 'opacity-55' : ''}`}>
                  <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleTeamMember(teamIndex, person.id)}
                    className="size-5 flex-none" style={{ accentColor: 'var(--color-accent)' }}/>
                  <span className="min-w-0 flex-1 text-row text-ink">{person.fullName}</span>
                  {inOtherTeam && <span className="text-tiny text-muted">в команде {teamIndex === 0 ? 'Б' : 'А'}</span>}
                </label>
              })}
            </div>
            {chosen.length < seats && <div className="mt-2 text-sub text-bad">Свободных мест: {seats - chosen.length}. Их будет видно в календаре.</div>}
          </div>
        </Card>
      })}
      {people.length < seats * 2 && <Banner tone="info">Для полного чередования нужно {seats * 2} менеджера. Пустые места будут видны в неделе образце и календаре.</Banner>}
      {seats === 2 && <>
        <SectionTitle>Оплата двух менеджеров</SectionTitle>
        <ChoiceChips value={payMode} onPick={setPayMode} options={[{ value: 'FULL', label: 'Каждому полная смена' }, { value: 'HALF', label: 'Каждому ½ смены' }]}/>
        <div className="mt-2 text-sub text-muted">У каждого своя ставка. «½ смены» даёт половину его ставки; часы между менеджерами не делятся.</div>
      </>}
      <SectionTitle>Когда начинает команда А</SectionTitle>
      <input aria-label="Дата начала команды А" type="date" value={anchor} onChange={event => { if (event.target.value) setAnchor(event.target.value) }}
        className="w-full rounded-md border border-line bg-surface p-3 text-base text-ink"/>
      <div className="mt-2 text-sub text-muted">Откроем неделю с {dayLabel(sourceWeek)}. Сначала заполним её, потом выберем недели для повтора.</div>
    </>}

    {step === 2 && <>
      <SectionTitle action={<TextButton onClick={() => setStep(1)}>Изменить правило</TextButton>}>Неделя с {shortDate(sourceWeek)}</SectionTitle>
      <div className="text-sub text-muted">Неделя заполнена автоматически. Нажмите на день, чтобы заменить человека или изменить нужное число менеджеров.</div>
      <Card className="mt-3 p-2">
        {Array.from({ length: 7 }, (_, offset) => {
          const date = dayjs(sourceWeek).add(offset, 'day').format('YYYY-MM-DD')
          const day = sample[date]
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
      <div className="mt-2 text-sub text-muted">{Object.keys(edits).length ? `Исправлено дней: ${Object.keys(edits).length}. Эти правки повторятся на выбранных неделях.` : 'Правки не обязательны: можно сразу выбрать недели.'}</div>
    </>}

    {step === 3 && <>
      <SectionTitle action={<TextButton onClick={() => setStep(2)}>Исправить неделю</TextButton>}>Куда повторить неделю</SectionTitle>
      <div className="text-sub text-muted">Нажмите на день целевой недели в календаре. Каждая неделя точно повторит образец, включая замены и пустые места. Чередование начинается заново.</div>
      <Button block variant="secondary" className="mt-3" onClick={() => {
        setTargetWeeks(remainingWeeksOfMonth(sourceWeek, previewMonth))
        setMonthLimit(previewMonth)
      }}>До конца {monthLabel(previewMonth)}</Button>
      <SectionTitle action={<div className="flex gap-3"><TextButton onClick={() => setPreviewMonth(dayjs(`${previewMonth}-01`).subtract(1, 'month').format('YYYY-MM'))}>‹</TextButton><TextButton onClick={() => setPreviewMonth(dayjs(`${previewMonth}-01`).add(1, 'month').format('YYYY-MM'))}>›</TextButton></div>}>{monthLabel(previewMonth)}</SectionTitle>
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
