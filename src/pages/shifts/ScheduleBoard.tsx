import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Card, Dropdown, Segmented, Select, Space, TimePicker, Typography } from 'antd'
import dayjs from 'dayjs'
import { CalendarRange, CopyPlus, Wand2 } from 'lucide-react'
import type { PayMode, Shift } from '../../entities/types'
import { planApply, shiftDate, type ApplyPlan, type PlannedSlot } from '../../entities/schedule'
import { monthEnd, monthStart, weekLabel, weekStartOf } from '../../shared/dates'
import { EmptyState, ErrorNote, Loading } from '../../shared/ui'
import { createShift, deleteShiftSafe, listShiftsRange, moveShift } from '../../services/shifts'
import { applySchedule, type ApplyOptions, type ApplyResult } from '../../services/schedule'
import { listScheduleTemplates, type ScheduleTemplate } from '../../services/scheduleTemplates'
import { listEmployees } from '../../services/employees'
import { useOrg } from '../../app/OrgContext'
import { MonthGrid, MonthLegend, MonthSummary, type DayEntry } from './MonthGrid'
import { WeekEditor, WeekNav, WeekTotals, cellKey } from './WeekEditor'
import { DaySheet } from './DaySheet'
import { CopyWeekModal } from './CopyWeekModal'
import { PatternWizard, type WizardResult } from './PatternWizard'
import { ApplyConfirm } from './ApplyConfirm'

const TIME = 'HH:mm'
const STORE_KEY = 'pvz.shiftTemplate'

interface Template { startsAt:string; endsAt:string; payMode:PayMode }
const defaults:Template = { startsAt: '09:00', endsAt: '21:00', payMode: 'FULL' }
const readTemplate = ():Template => {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') } } catch { return defaults }
}
const writeTemplate = (value:Template) => {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(value)) } catch { /* приватный режим браузера */ }
}

export function ScheduleBoard({ onPay, onReplace }:{ onPay:(shift:Shift) => void; onReplace:(shift:Shift) => void }) {
  const queryClient = useQueryClient()
  const { month, setMonth, pointId, points, defaultPointId, pointName } = useOrg()

  const [view, setView] = useState<'month' | 'week'>('month')
  const [weekStart, setWeekStart] = useState(() => weekStartOf(
    month === dayjs().format('YYYY-MM') ? dayjs().format('YYYY-MM-DD') : monthStart(month)))
  const [template, setTemplate] = useState<Template>(readTemplate)
  const [targetPoint, setTargetPoint] = useState(pointId || defaultPointId || points[0]?.id || '')
  const [selectedDay, setSelectedDay] = useState<string>()
  const [dimmed, setDimmed] = useState<string>()
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [linked, setLinked] = useState(false)

  const [copying, setCopying] = useState(false)
  const [wizard, setWizard] = useState<ScheduleTemplate | null | undefined>(undefined)
  const [plan, setPlan] = useState<{ plan:ApplyPlan; options:Omit<ApplyOptions, 'strategy'> } | null>(null)
  const [result, setResult] = useState<ApplyResult | null>(null)

  useEffect(() => { if (pointId) setTargetPoint(pointId) }, [pointId])
  useEffect(() => { writeTemplate(template) }, [template])

  // Конструктору нужны недели, залезающие в соседние месяцы, поэтому запрос идёт по отрезку.
  const range = useMemo(() => ({
    from: dayjs(monthStart(month)).subtract(7, 'day').format('YYYY-MM-DD'),
    to: dayjs(monthEnd(month)).add(7, 'day').format('YYYY-MM-DD'),
  }), [month])
  const queryKey = useMemo(() => ['shifts', 'range', range.from, range.to, pointId] as const, [range, pointId])

  const shifts = useQuery({ queryKey, queryFn: () => listShiftsRange(range.from, range.to, pointId || undefined) })
  const employees = useQuery({ queryKey: ['employees', false], queryFn: () => listEmployees() })
  const templates = useQuery({
    queryKey: ['schedule-templates'],
    queryFn: () => listScheduleTemplates((employees.data ?? []).map(e => e.id)),
    enabled: Boolean(employees.data),
  })

  const staff = useMemo(
    () => (employees.data ?? []).filter(e => !targetPoint || e.pickupPointIds.includes(targetPoint)),
    [employees.data, targetPoint])

  /**
   * Месяц в шапке и открытая неделя ходят друг за другом. Ref помнит месяц, который
   * протолкнули мы сами — без него два эффекта начинают переставлять друг друга по кругу.
   */
  const pushedMonth = useRef(month)
  useEffect(() => {
    const dominant = dayjs(weekStart).add(3, 'day').format('YYYY-MM')
    if (dominant !== month) { pushedMonth.current = dominant; setMonth(dominant) }
  }, [weekStart, month, setMonth])
  useEffect(() => {
    if (month === pushedMonth.current) return
    pushedMonth.current = month
    const start = weekStartOf(month === dayjs().format('YYYY-MM') ? dayjs().format('YYYY-MM-DD') : monthStart(month))
    setWeekStart(start)
  }, [month])

  const board = useMemo(() => {
    const map = new Map<string, Shift[]>()
    for (const shift of shifts.data ?? []) {
      const key = cellKey(shift.employeeId, shiftDate(shift))
      map.set(key, [...(map.get(key) ?? []), shift])
    }
    return map
  }, [shifts.data])

  const entriesByDate = useMemo(() => {
    const map = new Map<string, DayEntry[]>()
    for (const shift of shifts.data ?? []) {
      const date = shiftDate(shift)
      map.set(date, [...(map.get(date) ?? []), { employeeId: shift.employeeId, shift }])
    }
    return map
  }, [shifts.data])

  const invalidate = () => { void queryClient.invalidateQueries({ queryKey: ['shifts'] }) }
  const mark = (key:string, busy:boolean) => setPending(current => {
    const next = new Set(current)
    busy ? next.add(key) : next.delete(key)
    return next
  })

  const optimistic = async (apply:(rows:Shift[]) => Shift[]) => {
    await queryClient.cancelQueries({ queryKey })
    const previous = queryClient.getQueryData<Shift[]>(queryKey)
    queryClient.setQueryData<Shift[]>(queryKey, rows => apply(rows ?? []))
    return { previous }
  }
  const rollback = (context:{ previous?:Shift[] } | undefined) => {
    if (context?.previous) queryClient.setQueryData(queryKey, context.previous)
  }

  const add = useMutation({
    mutationFn: ({ employeeId, date }:{ employeeId:string; date:string }) =>
      createShift({ employeeId, pickupPointId: targetPoint, date, startsAt: template.startsAt, endsAt: template.endsAt, payMode: template.payMode }),
    // Кладём смену в кэш сразу: на телефоне ожидание ответа читается как «кнопка не нажалась».
    onMutate: ({ employeeId, date }) => {
      mark(cellKey(employeeId, date), true)
      return optimistic(rows => [...rows, {
        id: `tmp-${employeeId}-${date}`, employeeId, pickupPointId: targetPoint,
        startsAt: dayjs(`${date}T${template.startsAt}`).toISOString(),
        endsAt: dayjs(`${date}T${template.endsAt}`).toISOString(),
        payMode: template.payMode, status: 'PLANNED',
      }])
    },
    onError: (_error, _variables, context) => rollback(context),
    onSettled: (_data, _error, { employeeId, date }) => { mark(cellKey(employeeId, date), false); invalidate() },
  })

  const remove = useMutation({
    mutationFn: (shift:Shift) => deleteShiftSafe(shift.id),
    onMutate: shift => optimistic(rows => rows.filter(row => row.id !== shift.id)),
    onError: (_error, _shift, context) => rollback(context),
    onSuccess: (outcome, _shift, context) => { if (outcome === 'linked') { rollback(context); setLinked(true) } },
    onSettled: () => invalidate(),
  })

  const move = useMutation({
    mutationFn: ({ shift, employeeId, date }:{ shift:Shift; employeeId:string; date:string }) => moveShift(shift, employeeId, date),
    onMutate: ({ shift, employeeId, date }) => optimistic(rows => rows.map(row => {
      if (row.id !== shift.id) return row
      const start = dayjs(row.startsAt)
      const minutes = dayjs(row.endsAt).diff(start, 'minute')
      const nextStart = dayjs(date).hour(start.hour()).minute(start.minute())
      return { ...row, employeeId, startsAt: nextStart.toISOString(), endsAt: nextStart.add(minutes, 'minute').toISOString() }
    })),
    onError: (_error, _variables, context) => rollback(context),
    onSettled: invalidate,
  })

  const apply = useMutation({
    mutationFn: (options:ApplyOptions) => applySchedule(plan!.plan, options),
    onSuccess: setResult,
    onSettled: invalidate,
  })

  const toggle = (employeeId:string, date:string, shift?:Shift) => {
    setLinked(false)
    if (shift) remove.mutate(shift)
    else add.mutate({ employeeId, date })
  }

  /**
   * Перед применением перечитываем смены с сервера, а не берём из кэша:
   * без уникального ограничения в базе это единственное, что спасает от дублей,
   * если в соседней вкладке только что создали смены.
   */
  const prepare = async (slots:PlannedSlot[], options:Omit<ApplyOptions, 'strategy'>) => {
    const fresh = await queryClient.fetchQuery({ queryKey, queryFn: () => listShiftsRange(range.from, range.to, pointId || undefined) })
    setResult(null)
    setPlan({ plan: planApply(slots, fresh), options })
  }

  if (employees.isLoading || shifts.isLoading) return <Card variant="outlined"><Loading/></Card>
  if (!points.length) return <Alert type="warning" showIcon message="Сначала добавьте ПВЗ в разделе «ПВЗ»."/>
  if (!staff.length) return <Card variant="outlined">
    <EmptyState text={targetPoint
      ? `На ПВЗ «${pointName(targetPoint)}» нет сотрудников — привяжите их в разделе «Сотрудники».`
      : 'Сначала добавьте сотрудников.'}/>
  </Card>

  return <>
    <Card size="small" variant="outlined" className="mb-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Segmented
          value={view} onChange={value => setView(value as 'month' | 'week')}
          options={[{ value: 'month', label: 'Месяц' }, { value: 'week', label: 'Неделя' }]}
        />

        <Space size={8} wrap>
          <Typography.Text type="secondary" className="text-xs">Смена</Typography.Text>
          <TimePicker
            value={dayjs(template.startsAt, TIME)} onChange={value => value && setTemplate({ ...template, startsAt: value.format(TIME) })}
            format={TIME} minuteStep={5} allowClear={false} needConfirm={false} style={{ width: 88 }}
          />
          <Typography.Text type="secondary">–</Typography.Text>
          <TimePicker
            value={dayjs(template.endsAt, TIME)} onChange={value => value && setTemplate({ ...template, endsAt: value.format(TIME) })}
            format={TIME} minuteStep={5} allowClear={false} needConfirm={false} style={{ width: 88 }}
          />
        </Space>

        {!pointId && points.length > 1 && <Select
          value={targetPoint} onChange={setTargetPoint} style={{ minWidth: 150 }}
          options={points.map(point => ({ value: point.id, label: point.name }))}
        />}

        <Space size={8} wrap className="ml-auto">
          {Boolean(templates.data?.length) && <Dropdown
            menu={{
              items: templates.data!.map(item => ({ key: item.id, label: item.name })),
              onClick: ({ key }) => setWizard(templates.data!.find(t => t.id === key) ?? null),
            }}
          ><Button icon={<CalendarRange size={15}/>}>Мои графики</Button></Dropdown>}
          <Button type="primary" icon={<Wand2 size={15}/>} onClick={() => setWizard(null)}>Задать график</Button>
        </Space>
      </div>
    </Card>

    {linked && <Alert
      className="mb-3" type="warning" showIcon closable onClose={() => setLinked(false)}
      message="Смена связана с удержанием Wildberries — сначала отвяжите удержание в разделе «Удержания WB»."
    />}

    {view === 'month' ? <>
      <Card variant="outlined" styles={{ body: { padding: 8 } }}>
        <MonthGrid
          month={month} entriesByDate={entriesByDate} employees={staff}
          selected={selectedDay} dimmed={dimmed} onPickDay={setSelectedDay}
        />
        <MonthLegend employees={staff} dimmed={dimmed} onDim={setDimmed}/>
      </Card>
      <MonthSummary month={month} entriesByDate={entriesByDate}/>
    </> : <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <WeekNav weekStart={weekStart} onChange={setWeekStart} label={weekLabel(weekStart)}/>
        <Space wrap>
          <Button onClick={() => setWeekStart(weekStartOf(dayjs().format('YYYY-MM-DD')))}>Сегодня</Button>
          <Button icon={<CopyPlus size={15}/>} onClick={() => setCopying(true)}>Применить к другим неделям</Button>
        </Space>
      </div>

      <WeekEditor
        weekStart={weekStart} staff={staff} board={board} pending={pending}
        onToggle={toggle} onDelete={shift => remove.mutate(shift)}
        onMove={(shift, employeeId, date) => move.mutate({ shift, employeeId, date })}
      />
      <WeekTotals weekStart={weekStart} staff={staff} board={board}/>
    </>}

    <ErrorNote error={shifts.error ?? add.error ?? move.error ?? apply.error}/>

    {selectedDay && <DaySheet
      date={selectedDay} staff={staff}
      shiftsOfDay={new Map(staff.map(e => [e.id, board.get(cellKey(e.id, selectedDay)) ?? []]))}
      pointLabel={targetPoint ? pointName(targetPoint) : 'Все ПВЗ'}
      pending={pending} onToggle={toggle} onPay={onPay} onReplace={onReplace}
      onLinked={() => setLinked(true)}
      onOpenWeek={date => { setWeekStart(weekStartOf(date)); setSelectedDay(undefined); setView('week') }}
      onClose={() => setSelectedDay(undefined)}
    />}

    {copying && <CopyWeekModal
      weekStart={weekStart} month={month} shifts={shifts.data ?? []}
      onClose={() => setCopying(false)}
      onReady={slots => { setCopying(false); void prepare(slots, { pickupPointId: targetPoint, ...template }) }}
    />}

    {wizard !== undefined && <PatternWizard
      month={month} weekStart={weekStart} staff={staff} shifts={shifts.data ?? []}
      points={points} template={wizard ?? undefined}
      defaults={{ ...template, pickupPointId: targetPoint }}
      onClose={() => setWizard(undefined)}
      onReady={(ready:WizardResult) => {
        setWizard(undefined)
        void prepare(ready.slots, {
          pickupPointId: ready.pickupPointId, startsAt: ready.startsAt, endsAt: ready.endsAt, payMode: ready.payMode,
        })
      }}
    />}

    {plan && <ApplyConfirm
      plan={plan.plan} pending={apply.isPending} result={result}
      onApply={strategy => apply.mutate({ ...plan.options, strategy })}
      onClose={() => { setPlan(null); setResult(null) }}
    />}
  </>
}
