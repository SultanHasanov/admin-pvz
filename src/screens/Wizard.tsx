import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { Screen, Header } from '../shared/kit/Screen'
import { Card } from '../shared/kit/Card'
import { Avatar, List, ListRow } from '../shared/kit/ListRow'
import { SectionTitle, Label } from '../shared/kit/Text'
import { Button } from '../shared/kit/Button'
import { Segmented, Stepper } from '../shared/kit/Segmented'
import { Banner } from '../shared/kit/Field'
import { ChoiceChips } from '../shared/kit/PickList'
import { EmptyState, SkeletonRows } from '../shared/kit/Misc'
import { MonthCalendar, type CalendarDay } from '../shared/kit/MonthCalendar'
import { cn } from '../shared/kit/cn'
import { toastDone, toastWarn } from '../shared/kit/Toaster'
import { initials } from '../shared/shifts'
import { dayLabel, monthLabel } from '../shared/dates'
import { applyCells } from '../services/schedule'
import { setSlotConfig } from '../services/points'
import { useMonthTotals } from '../features/money/useMonthTotals'
import { useSlotDraft, QUICK_CYCLES } from '../features/schedule/useSlotDraft'
import { dayView } from '../features/schedule/dayTone'
import { useOrg } from '../app/OrgContext'
import { defaultShiftTimes } from '../shared/shiftTimes'
import { useNav } from '../app/nav'
import { scope } from '../services/queries'
import { IconCheck, IconClock, IconPeople, IconRecurring } from '../shared/kit/icons'

/** Дни недели в нумерации dayjs: 0 — воскресенье, поэтому порядок начинается с 1. */
const WEEKDAYS = [[1, 'пн'], [2, 'вт'], [3, 'ср'], [4, 'чт'], [5, 'пт'], [6, 'сб'], [0, 'вс']] as const

/**
 * Мастер графика: сколько мест на смене, кто в очереди на каждом, на какой период.
 *
 * Очередь задаётся порядком нажатий, а не отдельным полем сдвига: «Ирина, потом
 * Дмитрий» читается однозначно, а фазы цикла из этого порядка считаются сами.
 */
export default function Wizard() {
  const { month, pointId, points, defaultPointId, pointName } = useOrg()
  const { back, canBack } = useNav()
  const client = useQueryClient()
  const totals = useMonthTotals()

  const active = points.filter(point => !point.archivedAt)
  const [target, setTarget] = useState(pointId || defaultPointId || active[0]?.id || '')
  const point = active.find(item => item.id === target)

  // Часы работы точки — время смен по умолчанию, как обещает экран точки.
  const times = useMemo(() => ({ ...defaultShiftTimes(point), payMode: 'FULL' as const }), [point])

  const draft = useSlotDraft({
    month,
    pointId: target,
    slotCount: point?.slotConfig?.def ?? 1,
    shifts: totals.shifts.filter(shift => shift.pickupPointId === target),
    times,
  })

  const staff = totals.staff.filter(person => person.pickupPointIds.includes(target) && person.status === 'ACTIVE')
  const slot = draft.slots[draft.active]

  const previewDays = useMemo(() => {
    const result = new Map<string, CalendarDay>()
    for (const [date, entries] of draft.preview) {
      const shifts = entries.filter(entry => entry.shift).map(entry => entry.shift!)
      const planned = entries.filter(entry => entry.preview).length
      const view = dayView(shifts, date, dayjs().format('YYYY-MM-DD'), () => '')
      result.set(date, {
        date,
        tone: planned ? 'accent' : view.tone,
        lines: [String(entries.length)],
      })
    }
    return result
  }, [draft.preview])

  const apply = useMutation({
    mutationFn: async () => {
      // Число мест — это настройка точки, а не разовый выбор: без неё дырки в графике
      // считать не от чего, и «нет второго человека» никто не увидит.
      if (point && (point.slotConfig?.def ?? 1) !== draft.slots.length) {
        await setSlotConfig(point.id, { ...point.slotConfig, def: draft.slots.length })
      }
      return applyCells(draft.plan, { ...times, strategy: draft.strategy })
    },
    onSuccess: result => {
      if (result.failed.length) toastWarn(`Записано ${result.added}, не удалось ${result.failed.length}`)
      else toastDone(`График применён: ${result.added} смен${result.replaced ? `, переписано ${result.replaced}` : ''}`)
      void client.invalidateQueries({ queryKey: scope.shifts })
      void client.invalidateQueries({ queryKey: scope.points })
      back()
    },
    onError: error => toastWarn(error instanceof Error ? error.message : 'Не удалось применить график'),
  })

  const header = <Header
    title="Мастер графика"
    onBack={canBack ? back : undefined}
  />

  if (totals.loading) return <Screen header={header}><Card><SkeletonRows rows={4}/></Card></Screen>
  if (!active.length) return <Screen header={header}>
    <Card><EmptyState title="Нет пунктов выдачи" sub="Сначала добавьте ПВЗ — график строится по точке"/></Card>
  </Screen>

  return <Screen
    header={header}
    footer={<Button
      block
      disabled={!draft.ready || apply.isPending}
      onClick={() => apply.mutate()}
    >
      {draft.plan.toAdd.length || draft.plan.conflicts.length
        ? `Поставить ${draft.strategy === 'replace' ? draft.plan.toAdd.length + draft.plan.conflicts.length : draft.plan.toAdd.length} смен`
        : 'Нечего добавлять'}
    </Button>}
  >
    {active.length > 1 && <>
      <Label>Пункт выдачи</Label>
      <div className="mt-[7px]">
        <ChoiceChips
          value={target}
          onPick={setTarget}
          options={active.map(item => ({ value: item.id, label: item.name.replace(/^ПВЗ\s+/, '') }))}
        />
      </div>
    </>}

    <SectionTitle><span className="inline-flex items-center gap-2"><IconPeople size={18}/>Сотрудников на смене</span></SectionTitle>
    <Card className="p-[13px]">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sub leading-[1.4] text-muted">
          Сколько человек должно выходить в день. Для каждой позиции задайте очередь сотрудников.
        </div>
        <Stepper value={draft.slots.length} min={1} max={4} onChange={draft.setSlotCount}/>
      </div>
    </Card>

    {draft.slots.length > 1 && <div className="mt-3">
      <Segmented
        value={String(draft.active)}
        onChange={value => draft.setActive(Number(value))}
        options={draft.slots.map((_, index) => ({ value: String(index), label: `Место ${index + 1}` }))}
      />
    </div>}

    <SectionTitle><span className="inline-flex items-center gap-2"><IconRecurring size={18}/>Как чередуются смены</span></SectionTitle>
    <Card className="p-[13px]">
      <Segmented
        value={slot.mode}
        onChange={mode => draft.patch(draft.active, { mode })}
        options={[{ value: 'cycle', label: 'Цикл N через M' }, { value: 'weekdays', label: 'По дням недели' }]}
      />

      {slot.mode === 'cycle' ? <div className="mt-3">
        <div className="flex flex-wrap gap-2">
          {QUICK_CYCLES.map(([on, off]) => <button
            key={`${on}/${off}`}
            type="button"
            className={cn(
              'tap rounded-sm border px-3 py-[7px] text-act font-medium',
              slot.on === on && slot.off === off ? 'border-accent bg-accent-tint text-accent' : 'border-line bg-surface',
            )}
            onClick={() => draft.patch(draft.active, { on, off })}
          >{on} через {off}</button>)}
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <Label>Смен подряд</Label>
          <Stepper value={slot.on} min={1} max={14} onChange={on => draft.patch(draft.active, { on })}/>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <Label>Дней отдыха</Label>
          <Stepper value={slot.off} min={0} max={14} onChange={off => draft.patch(draft.active, { off })}/>
        </div>
      </div> : <div className="mt-3 grid grid-cols-7 gap-1">
        {WEEKDAYS.map(([day, label]) => <button
          key={day}
          type="button"
          className={cn(
            'tap h-10 rounded-xs border text-[12px] font-semibold',
            slot.weekdays.includes(day) ? 'border-accent bg-accent-tint text-accent' : 'border-line bg-surface text-muted',
          )}
          onClick={() => draft.toggleWeekday(draft.active, day)}
        >{label}</button>)}
      </div>}
    </Card>

    <SectionTitle count={slot.employeeIds.length}><span className="inline-flex items-center gap-2"><IconPeople size={18}/>Очередь на место {draft.active + 1}</span></SectionTitle>
    <Card>
      {staff.length === 0
        ? <EmptyState title="Нет сотрудников" sub={`К ПВЗ «${pointName(target)}» никто не привязан`}/>
        : <List>
          {staff.map(person => {
            const order = slot.employeeIds.indexOf(person.id)
            return <ListRow
              key={person.id}
              leading={<Avatar initials={initials(person.fullName)} tone={order >= 0 ? 'accent' : 'neutral'}/>}
              title={person.fullName}
              sub={order >= 0 ? `${order + 1}-й в очереди` : 'не участвует'}
              rightSub={order >= 0 ? `${draft.counts.get(person.id) ?? 0} смен` : undefined}
              rightSubTone="accent"
              onClick={() => draft.toggleEmployee(draft.active, person.id)}
            />
          })}
        </List>}
    </Card>

    <SectionTitle><span className="inline-flex items-center gap-2"><IconClock size={18}/>Период</span></SectionTitle>
    <ChoiceChips
      value={draft.period}
      onPick={draft.setPeriod}
      options={[
        { value: 'week', label: 'Эта неделя' },
        { value: 'fourWeeks', label: '4 недели' },
        { value: 'month', label: monthLabel(month).split(' ')[0] },
      ]}
    />
    <div className="mt-2 text-sub text-muted">С {dayLabel(draft.from)} по {dayLabel(draft.to)}</div>

    <SectionTitle><span className="inline-flex items-center gap-2"><IconCheck size={18}/>Предпросмотр</span></SectionTitle>
    <MonthCalendar month={month} days={previewDays}/>

    <div className="mt-2 text-sub leading-[1.4] text-muted">
      Всего выходов: {draft.cells.length}
      {draft.gaps > 0 && ` · дней с незакрытыми местами: ${draft.gaps}`}
    </div>

    {draft.plan.conflicts.length > 0 && <div className="mt-3">
      <Banner>
        На {draft.plan.conflicts.length} мест уже стоят запланированные смены.
      </Banner>
      <ChoiceChips
        value={draft.strategy}
        onPick={draft.setStrategy}
        options={[
          { value: 'skip', label: 'Только свободные' },
          { value: 'replace', label: 'Заменить всё' },
        ]}
      />
    </div>}

    {draft.plan.locked.length > 0 && <div className="mt-2 text-sub leading-[1.4] text-muted">
      Не тронем {draft.plan.locked.length} смен: они идут, завершены или отменены.
    </div>}
  </Screen>
}
