import { useMemo, useState } from 'react'
import { Alert, Button, DatePicker, Form, Input, InputNumber, Radio, Select, Space, Steps, Tag, TimePicker, Typography } from 'antd'
import dayjs from 'dayjs'
import type { Employee, PayMode, Shift } from '../../entities/types'
import { defaultOffsets, generateSlots, type CycleParticipant, type PlannedSlot, type SchedulePattern } from '../../entities/schedule'
import { monthEnd, monthStart } from '../../shared/dates'
import { payModeTitles } from '../../shared/salary'
import { FormModal } from '../../shared/ui'
import { saveScheduleTemplate, type ScheduleTemplate } from '../../services/scheduleTemplates'
import { MonthGrid, MonthLegend, type DayEntry } from './MonthGrid'
import { WeekdayStrip } from './WeekEditor'

const TIME = 'HH:mm'
const QUICK = [[2, 2], [3, 3], [5, 2], [1, 3]] as const

export interface WizardResult { slots:PlannedSlot[]; startsAt:string; endsAt:string; payMode:PayMode; pickupPointId:string }

export function PatternWizard({ month, weekStart, staff, shifts, points, template, defaults, onClose, onReady }:{
  month:string
  weekStart:string
  staff:Employee[]
  shifts:Shift[]
  points:{ id:string; name:string }[]
  template?:ScheduleTemplate
  defaults:{ startsAt:string; endsAt:string; payMode:PayMode; pickupPointId:string }
  onClose:() => void
  onReady:(result:WizardResult) => void
}) {
  const [step, setStep] = useState(0)
  const [kind, setKind] = useState<'weekdays' | 'cycle'>(template?.pattern.kind ?? 'cycle')

  const [byEmployee, setByEmployee] = useState<Record<string, number[]>>(
    template?.pattern.kind === 'weekdays' ? template.pattern.byEmployee : {})
  const [on, setOn] = useState(template?.pattern.kind === 'cycle' ? template.pattern.on : 2)
  const [off, setOff] = useState(template?.pattern.kind === 'cycle' ? template.pattern.off : 2)
  const [anchor, setAnchor] = useState(template?.pattern.kind === 'cycle' ? template.pattern.anchor : weekStart)
  const [participants, setParticipants] = useState<CycleParticipant[]>(
    template?.pattern.kind === 'cycle' ? template.pattern.participants : [])

  const [from, setFrom] = useState(weekStart)
  const [to, setTo] = useState(dayjs(monthEnd(month)).subtract(1, 'day').format('YYYY-MM-DD'))
  const [startsAt, setStartsAt] = useState(template?.startsAt ?? defaults.startsAt)
  const [endsAt, setEndsAt] = useState(template?.endsAt ?? defaults.endsAt)
  const [payMode, setPayMode] = useState<PayMode>(template?.payMode ?? defaults.payMode)
  const [pickupPointId, setPoint] = useState(template?.pickupPointId ?? defaults.pickupPointId)

  const [name, setName] = useState(template?.name ?? '')
  const [saveError, setSaveError] = useState<string>()
  const [saved, setSaved] = useState(false)

  const pattern:SchedulePattern = kind === 'weekdays'
    ? { kind: 'weekdays', byEmployee }
    : { kind: 'cycle', on, off, anchor, participants }

  const slots = useMemo(() => generateSlots(pattern, from, to), [kind, byEmployee, on, off, anchor, participants, from, to])

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const slot of slots) map.set(slot.employeeId, (map.get(slot.employeeId) ?? 0) + 1)
    return map
  }, [slots])

  // Предпросмотр: существующие смены сплошными точками, будущие — полыми.
  const entriesByDate = useMemo(() => {
    const map = new Map<string, DayEntry[]>()
    for (const shift of shifts) {
      const date = dayjs(shift.startsAt).format('YYYY-MM-DD')
      map.set(date, [...(map.get(date) ?? []), { employeeId: shift.employeeId, shift }])
    }
    for (const slot of slots) {
      const existing = map.get(slot.date) ?? []
      if (existing.some(entry => entry.employeeId === slot.employeeId)) continue
      map.set(slot.date, [...existing, { employeeId: slot.employeeId, preview: true }])
    }
    return map
  }, [shifts, slots])

  const overlaps = useMemo(() => {
    const perDay = new Map<string, number>()
    for (const slot of slots) perDay.set(slot.date, (perDay.get(slot.date) ?? 0) + 1)
    return [...perDay.values()].filter(count => count > 1).length
  }, [slots])

  const toggleParticipant = (ids:string[]) => setParticipants(current => {
    const offsets = defaultOffsets(ids.length, on, off)
    return ids.map((employeeId, index) => ({
      employeeId,
      offset: current.find(p => p.employeeId === employeeId)?.offset ?? offsets[index],
    }))
  })

  const ready = slots.length > 0 && Boolean(pickupPointId)

  const save = async () => {
    setSaveError(undefined)
    try {
      await saveScheduleTemplate({
        id: template?.id, name, pattern,
        employeeIds: kind === 'cycle' ? participants.map(p => p.employeeId) : Object.keys(byEmployee).filter(id => byEmployee[id]?.length),
        pickupPointId, startsAt, endsAt, payMode,
      })
      setSaved(true)
    } catch (error) { setSaveError(error instanceof Error ? error.message : String(error)) }
  }

  return <FormModal
    title="График смен" onClose={onClose} width={640}
    footer={<Space wrap>
      {step > 0 && <Button onClick={() => setStep(step - 1)}>Назад</Button>}
      {step < 2 && <Button type="primary" onClick={() => setStep(step + 1)}>Далее</Button>}
      {step === 2 && <Button type="primary" disabled={!ready} onClick={() => onReady({ slots, startsAt, endsAt, payMode, pickupPointId })}>
        Применить
      </Button>}
      <Button onClick={onClose}>Отмена</Button>
    </Space>}
  >
    <Steps size="small" current={step} className="mb-4" items={[{ title: 'Кто и как' }, { title: 'Период' }, { title: 'Проверка' }]}/>

    {step === 0 && <Form layout="vertical" requiredMark={false}>
      <Radio.Group
        className="mb-4" value={kind} onChange={event => setKind(event.target.value)}
        optionType="button" buttonStyle="solid"
        options={[{ value: 'cycle', label: 'Цикл N через M' }, { value: 'weekdays', label: 'По дням недели' }]}
      />

      {kind === 'cycle' ? <>
        <Space wrap className="mb-3">
          {QUICK.map(([q1, q2]) => <Tag.CheckableTag
            key={`${q1}/${q2}`} checked={on === q1 && off === q2}
            onChange={() => { setOn(q1); setOff(q2) }}
          >{q1} через {q2}</Tag.CheckableTag>)}
        </Space>

        <div className="grid gap-x-4 sm:grid-cols-2">
          <Form.Item label="Работаем дней">
            <InputNumber min={1} max={30} value={on} onChange={value => setOn(value ?? 1)} style={{ width: '100%' }}/>
          </Form.Item>
          <Form.Item label="Отдыхаем дней">
            <InputNumber min={0} max={30} value={off} onChange={value => setOff(value ?? 0)} style={{ width: '100%' }}/>
          </Form.Item>
        </div>

        <Form.Item label="Первый рабочий день" extra="От этой даты отсчитывается цикл.">
          <DatePicker
            style={{ width: '100%' }} format="DD.MM.YYYY" allowClear={false}
            value={dayjs(anchor)} onChange={value => value && setAnchor(value.format('YYYY-MM-DD'))}
          />
        </Form.Item>

        <Form.Item label="Кто выходит">
          <Select
            mode="multiple" placeholder="Выберите сотрудников" optionFilterProp="label"
            value={participants.map(p => p.employeeId)} onChange={toggleParticipant}
            options={staff.map(e => ({ value: e.id, label: e.fullName }))}
          />
        </Form.Item>

        {participants.length > 1 && <>
          <div className="mb-2 flex items-center justify-between gap-3">
            <Typography.Text type="secondary" className="text-xs">Сдвиг цикла, дней</Typography.Text>
            <Button size="small" onClick={() => setParticipants(current =>
              current.map((p, i) => ({ ...p, offset: defaultOffsets(current.length, on, off, true)[i] })))}>
              Разнести равномерно
            </Button>
          </div>
          <div className="grid gap-2">
            {participants.map((participant, index) => <div key={participant.employeeId} className="flex items-center justify-between gap-3">
              <Typography.Text className="truncate text-sm">{staff.find(e => e.id === participant.employeeId)?.fullName}</Typography.Text>
              <InputNumber
                size="small" min={0} max={on + off - 1} value={participant.offset} style={{ width: 72 }}
                onChange={value => setParticipants(current => current.map((p, i) => i === index ? { ...p, offset: value ?? 0 } : p))}
              />
            </div>)}
          </div>
        </>}
      </> : <div className="grid gap-3">
        {staff.map(employee => <div key={employee.id}>
          <Typography.Text className="text-sm">{employee.fullName}</Typography.Text>
          <div className="mt-1">
            <WeekdayStrip
              value={byEmployee[employee.id] ?? []}
              onChange={days => setByEmployee(current => ({ ...current, [employee.id]: days }))}
            />
          </div>
        </div>)}
      </div>}
    </Form>}

    {step === 1 && <Form layout="vertical" requiredMark={false}>
      <Space wrap className="mb-3">
        <Button size="small" onClick={() => { setFrom(weekStart); setTo(dayjs(weekStart).add(6, 'day').format('YYYY-MM-DD')) }}>Эта неделя</Button>
        <Button size="small" onClick={() => { setFrom(weekStart); setTo(dayjs(weekStart).add(27, 'day').format('YYYY-MM-DD')) }}>4 недели</Button>
        <Button size="small" onClick={() => { setFrom(monthStart(month)); setTo(dayjs(monthEnd(month)).subtract(1, 'day').format('YYYY-MM-DD')) }}>Весь месяц</Button>
      </Space>

      <div className="grid gap-x-4 sm:grid-cols-2">
        <Form.Item label="С какого дня">
          <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" allowClear={false} value={dayjs(from)} onChange={v => v && setFrom(v.format('YYYY-MM-DD'))}/>
        </Form.Item>
        <Form.Item label="По какой день">
          <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" allowClear={false} value={dayjs(to)} onChange={v => v && setTo(v.format('YYYY-MM-DD'))}/>
        </Form.Item>
        <Form.Item label="Начало смены">
          <TimePicker style={{ width: '100%' }} format={TIME} minuteStep={5} allowClear={false} needConfirm={false} value={dayjs(startsAt, TIME)} onChange={v => v && setStartsAt(v.format(TIME))}/>
        </Form.Item>
        <Form.Item label="Конец смены">
          <TimePicker style={{ width: '100%' }} format={TIME} minuteStep={5} allowClear={false} needConfirm={false} value={dayjs(endsAt, TIME)} onChange={v => v && setEndsAt(v.format(TIME))}/>
        </Form.Item>
      </div>

      <Form.Item label="Оплата">
        <Select value={payMode} onChange={setPayMode} options={(Object.keys(payModeTitles) as PayMode[]).map(value => ({ value, label: payModeTitles[value] }))}/>
      </Form.Item>
      <Form.Item label="ПВЗ">
        <Select value={pickupPointId || undefined} onChange={setPoint} placeholder="Выберите ПВЗ" options={points.map(p => ({ value: p.id, label: p.name }))}/>
      </Form.Item>
    </Form>}

    {step === 2 && <>
      <MonthGrid month={month} entriesByDate={entriesByDate} employees={staff} readOnly/>
      <MonthLegend employees={staff.filter(e => counts.has(e.id))}/>

      <div className="mt-3 grid gap-1">
        {[...counts].map(([employeeId, count]) => <Typography.Text key={employeeId} className="text-sm">
          {staff.find(e => e.id === employeeId)?.fullName} — {count} смен
        </Typography.Text>)}
      </div>

      {!slots.length && <Alert className="mt-3" type="warning" showIcon message="График пустой — вернитесь и выберите сотрудников или дни."/>}
      {overlaps > 0 && <Alert
        className="mt-3" type="info" showIcon
        message={`В ${overlaps} дн. выходят двое и больше`}
        description="Для 5/2 и подобных графиков это нормально: цикл не делится на смены поровну."
      />}

      <div className="mt-4 grid gap-2">
        <Typography.Text type="secondary" className="text-xs">Сохранить график, чтобы применять его повторно</Typography.Text>
        <Space.Compact style={{ width: '100%' }}>
          <Input value={name} onChange={event => { setName(event.target.value); setSaved(false) }} placeholder="Например: Основной 2/2"/>
          <Button disabled={!name.trim() || saved} onClick={() => void save()}>{saved ? 'Сохранён' : 'Сохранить'}</Button>
        </Space.Compact>
        {saveError && <Alert type="error" showIcon message={saveError}/>}
      </div>
    </>}
  </FormModal>
}
