import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Card, DatePicker, Form, Input, Popconfirm, Radio, Select, Space, Tabs, TimePicker, Tooltip, Typography } from 'antd'
import type { TableProps } from 'antd'
import dayjs from 'dayjs'
import { CalendarPlus, CheckCircle2, Hourglass, PlayCircle, Plus, Repeat, Trash2, UserCog, UserX } from 'lucide-react'
import type { PayMode, Shift, ShiftStatus } from '../entities/types'
import { dateLabel, monthLabel, timeLabel, today, weekdayLabel } from '../shared/dates'
import { payModeTitles } from '../shared/salary'
import { statusTitles, statusTone } from '../shared/shifts'
import { Badge, CardRow, EmptyState, ErrorNote, FormModal, ResponsiveTable, Title } from '../shared/ui'
import { ScheduleBoard } from './shifts/ScheduleBoard'
import { createShift, createShiftSeries, deleteShift, listShifts, replaceShift, setShiftPayMode, setShiftStatus } from '../services/shifts'
import { listEmployees } from '../services/employees'
import { useOrg } from '../app/OrgContext'

const weekdays = [[1, 'Пн'], [2, 'Вт'], [3, 'Ср'], [4, 'Чт'], [5, 'Пт'], [6, 'Сб'], [0, 'Вс']] as const

const TIME = 'HH:mm'

export function ShiftsPage() {
  const queryClient = useQueryClient()
  const { month, pointId, pointName, points, defaultPointId } = useOrg()
  const [form, setForm] = useState<'single' | 'series'>()
  const [replacing, setReplacing] = useState<Shift | null>(null)
  const [paying, setPaying] = useState<Shift | null>(null)

  const shifts = useQuery({ queryKey: ['shifts', month, pointId], queryFn: () => listShifts(month, pointId || undefined) })
  const employees = useQuery({ queryKey: ['employees', false], queryFn: () => listEmployees() })
  const nameOf = (id:string) => employees.data?.find(e => e.id === id)?.fullName ?? 'Сотрудник'
  const invalidate = () => { void queryClient.invalidateQueries({ queryKey: ['shifts'] }) }

  const status = useMutation({ mutationFn: ({ id, next }:{ id:string; next:ShiftStatus }) => setShiftStatus(id, next), onSuccess: invalidate })
  const remove = useMutation({ mutationFn: deleteShift, onSuccess: invalidate })

  const actions = (shift:Shift) => <Space size={4} wrap>
    <Tooltip title="Как оплачивается смена"><Button size="small" icon={<Hourglass size={15}/>} onClick={() => setPaying(shift)}/></Tooltip>
    {shift.status === 'PLANNED' && <Tooltip title="Начать смену">
      <Button size="small" icon={<PlayCircle size={15}/>} onClick={() => status.mutate({ id: shift.id, next: 'ON_DUTY' })}/>
    </Tooltip>}
    {(shift.status === 'ON_DUTY' || shift.status === 'PLANNED' || shift.status === 'REPLACED') && <Tooltip title="Завершить">
      <Button size="small" icon={<CheckCircle2 size={15}/>} onClick={() => status.mutate({ id: shift.id, next: 'COMPLETED' })}/>
    </Tooltip>}
    {shift.status !== 'COMPLETED' && <Tooltip title="Не вышел">
      <Button size="small" icon={<UserX size={15}/>} onClick={() => status.mutate({ id: shift.id, next: 'NO_SHOW' })}/>
    </Tooltip>}
    <Tooltip title="Заменить сотрудника"><Button size="small" icon={<UserCog size={15}/>} onClick={() => setReplacing(shift)}/></Tooltip>
    <Popconfirm title="Удалить смену?" okText="Удалить" cancelText="Отмена" okButtonProps={{ danger: true }} onConfirm={() => remove.mutate(shift.id)}>
      <Tooltip title="Удалить"><Button size="small" icon={<Trash2 size={15}/>}/></Tooltip>
    </Popconfirm>
  </Space>

  const columns:TableProps<Shift>['columns'] = [
    {
      title: 'Дата', key: 'date', width: 150,
      render: (_, shift) => <span><Typography.Text strong>{dateLabel(shift.startsAt)}</Typography.Text>{' '}
        <Typography.Text type="secondary">{weekdayLabel(shift.startsAt)}</Typography.Text></span>,
    },
    { title: 'Сотрудник', key: 'employee', render: (_, shift) => nameOf(shift.employeeId) },
    { title: 'Время', key: 'time', render: (_, shift) => `${timeLabel(shift.startsAt)}–${timeLabel(shift.endsAt)}` },
    ...(pointId ? [] : [{ title: 'ПВЗ', key: 'point', render: (_:unknown, shift:Shift) => pointName(shift.pickupPointId) }]),
    {
      title: 'Статус', key: 'status',
      render: (_, shift) => <Space size={4} wrap>
        <Badge tone={statusTone[shift.status]}>{statusTitles[shift.status]}</Badge>
        {shift.payMode !== 'FULL' && <Badge tone="amber">{payModeTitles[shift.payMode]}</Badge>}
      </Space>,
    },
    { title: '', key: 'actions', align: 'right', render: (_, shift) => actions(shift) },
  ]

  return <>
    <Title title="Смены" subtitle={`${monthLabel(month)} · ${pointId ? pointName(pointId) : 'Все ПВЗ'}`}>
      <Space wrap>
        <Button icon={<Repeat size={15}/>} onClick={() => setForm('series')} disabled={!points.length}>Серия смен</Button>
        <Button type="primary" icon={<Plus size={16}/>} onClick={() => setForm('single')} disabled={!points.length}>Создать смену</Button>
      </Space>
    </Title>

    {!employees.data?.length && !employees.isLoading && <Alert
      className="mb-4" type="warning" showIcon
      message="Сначала добавьте сотрудников — без них смену назначить не на кого."
    />}

    <Tabs
      defaultActiveKey="board"
      items={[
        { key: 'board', label: 'Конструктор', children: <ScheduleBoard onPay={setPaying} onReplace={setReplacing}/> },
        {
          key: 'list', label: 'Список', children: <Card variant="outlined" styles={{ body: { padding: 0 } }}>
            <ResponsiveTable<Shift>
              rowKey="id" columns={columns} dataSource={shifts.data ?? []} loading={shifts.isLoading}
              locale={{ emptyText: <EmptyState
                text={`За ${monthLabel(month).toLowerCase()} смен нет.`}
                action={points.length ? <Button type="primary" icon={<CalendarPlus size={16}/>} onClick={() => setForm('single')}>Создать смену</Button> : undefined}
              /> }}
              mobileCard={shift => <>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Typography.Text strong>{dateLabel(shift.startsAt)}</Typography.Text>
                  <Typography.Text type="secondary">{weekdayLabel(shift.startsAt)}</Typography.Text>
                  <Badge tone={statusTone[shift.status]}>{statusTitles[shift.status]}</Badge>
                  {shift.payMode !== 'FULL' && <Badge tone="amber">{payModeTitles[shift.payMode]}</Badge>}
                </div>
                <CardRow label="Сотрудник">{nameOf(shift.employeeId)}</CardRow>
                <CardRow label="Время">{timeLabel(shift.startsAt)}–{timeLabel(shift.endsAt)}</CardRow>
                {!pointId && <CardRow label="ПВЗ">{pointName(shift.pickupPointId)}</CardRow>}
                <div className="mt-3">{actions(shift)}</div>
              </>}
            />
          </Card>,
        },
      ]}
    />

    <ErrorNote error={shifts.error ?? status.error ?? remove.error}/>
    {form && <ShiftForm mode={form} defaultPointId={defaultPointId || points[0]?.id} onClose={() => setForm(undefined)}/>}
    {replacing && <ReplaceForm shift={replacing} onClose={() => setReplacing(null)}/>}
    {paying && <PayModeForm shift={paying} employeeName={nameOf(paying.employeeId)} onClose={() => setPaying(null)}/>}
  </>
}

const payModeHints:Record<PayMode, string> = {
  FULL: 'Начисляем ставку за смену целиком.',
  HALF: 'Начисляем половину ставки — сотрудник отработал часть смены.',
  HOURS: 'Считаем по часовой ставке и фактическому времени. Если часовая ставка не задана в карточке сотрудника, начислим обычную ставку за смену.',
}

/** Часть смены выясняется уже по факту, поэтому режим оплаты меняется и после её завершения. */
function PayModeForm({ shift, employeeName, onClose }:{ shift:Shift; employeeName:string; onClose:() => void }) {
  const queryClient = useQueryClient()
  const [payMode, setPayMode] = useState<PayMode>(shift.payMode)
  const save = useMutation({
    mutationFn: () => setShiftPayMode(shift.id, payMode),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['shifts'] }); onClose() },
  })

  return <FormModal
    title="Оплата смены" onClose={onClose}
    footer={<Space wrap>
      <Button type="primary" loading={save.isPending} onClick={() => save.mutate()}>Сохранить</Button>
      <Button onClick={onClose}>Отмена</Button>
    </Space>}
  >
    <Typography.Paragraph type="secondary">
      {employeeName} · {dateLabel(shift.startsAt)}, {timeLabel(shift.startsAt)}–{timeLabel(shift.endsAt)}
    </Typography.Paragraph>
    <Radio.Group value={payMode} onChange={e => setPayMode(e.target.value)} style={{ display: 'grid', gap: 8, width: '100%' }}>
      {(Object.keys(payModeTitles) as PayMode[]).map(mode => <Radio key={mode} value={mode} style={{
        alignItems: 'flex-start', border: '1px solid', borderColor: payMode === mode ? '#16a34a' : '#e9edf0',
        borderRadius: 10, padding: 12, marginInlineEnd: 0,
      }}>
        <Typography.Text strong>{payModeTitles[mode]}</Typography.Text>
        <div><Typography.Text type="secondary" className="text-xs">{payModeHints[mode]}</Typography.Text></div>
      </Radio>)}
    </Radio.Group>
    <ErrorNote error={save.error}/>
  </FormModal>
}

interface ShiftValues {
  pickupPointId:string; employeeId:string
  date:dayjs.Dayjs; to:dayjs.Dayjs
  startsAt:dayjs.Dayjs; endsAt:dayjs.Dayjs
  payMode:PayMode; days:number[]
}

function ShiftForm({ mode, defaultPointId, onClose }:{ mode:'single' | 'series'; defaultPointId:string; onClose:() => void }) {
  const queryClient = useQueryClient()
  const { points } = useOrg()
  const [form] = Form.useForm<ShiftValues>()
  const employees = useQuery({ queryKey: ['employees', false], queryFn: () => listEmployees() })
  const pickupPointId = Form.useWatch('pickupPointId', form) ?? defaultPointId

  const available = (employees.data ?? []).filter(e => !pickupPointId || e.pickupPointIds.includes(pickupPointId))

  const save = useMutation({
    mutationFn: async (values:ShiftValues) => {
      const shared = {
        employeeId: values.employeeId, pickupPointId: values.pickupPointId,
        startsAt: values.startsAt.format(TIME), endsAt: values.endsAt.format(TIME), payMode: values.payMode,
      }
      if (mode === 'single') { await createShift({ ...shared, date: values.date.format('YYYY-MM-DD') }); return 1 }
      return createShiftSeries({ ...shared, from: values.date.format('YYYY-MM-DD'), to: values.to.format('YYYY-MM-DD'), weekdays: values.days })
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['shifts'] }); onClose() },
  })

  return <FormModal
    title={mode === 'single' ? 'Новая смена' : 'Серия смен'} onClose={onClose}
    footer={<Space wrap>
      <Button type="primary" loading={save.isPending} onClick={() => form.submit()}>Создать</Button>
      <Button onClick={onClose}>Отмена</Button>
    </Space>}
  >
    <Form<ShiftValues>
      form={form} layout="vertical" requiredMark={false}
      initialValues={{
        pickupPointId: defaultPointId, employeeId: undefined,
        date: dayjs(today()), to: dayjs(today()),
        startsAt: dayjs('09:00', TIME), endsAt: dayjs('21:00', TIME),
        payMode: 'FULL', days: [1, 2, 3, 4, 5],
      }}
      onFinish={values => save.mutate(values)}
    >
      <Form.Item name="pickupPointId" label="ПВЗ">
        <Select
          onChange={() => form.setFieldValue('employeeId', undefined)}
          options={points.map(point => ({ value: point.id, label: point.name }))}
        />
      </Form.Item>
      <Form.Item
        name="employeeId" label="Сотрудник" rules={[{ required: true, message: 'Выберите сотрудника' }]}
        extra={available.length ? undefined : 'На этом ПВЗ нет сотрудников — привяжите их в разделе «Сотрудники».'}
      >
        <Select
          placeholder="Выберите сотрудника" showSearch optionFilterProp="label"
          options={available.map(employee => ({ value: employee.id, label: employee.fullName }))}
        />
      </Form.Item>

      <div className="grid gap-x-4 sm:grid-cols-2">
        <Form.Item name="date" label={mode === 'single' ? 'Дата' : 'Начало периода'} rules={[{ required: true, message: 'Укажите дату' }]}>
          <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" allowClear={false}/>
        </Form.Item>
        {mode === 'series' && <Form.Item name="to" label="Конец периода" rules={[{ required: true, message: 'Укажите дату' }]}>
          <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" allowClear={false}/>
        </Form.Item>}
      </div>

      <div className="grid gap-x-4 sm:grid-cols-2">
        <Form.Item name="startsAt" label="Начало" rules={[{ required: true, message: 'Укажите время' }]}>
          <TimePicker style={{ width: '100%' }} format={TIME} minuteStep={5} allowClear={false} needConfirm={false}/>
        </Form.Item>
        <Form.Item name="endsAt" label="Конец" rules={[{ required: true, message: 'Укажите время' }]} extra="Если конец раньше начала, смена перейдёт на следующие сутки.">
          <TimePicker style={{ width: '100%' }} format={TIME} minuteStep={5} allowClear={false} needConfirm={false}/>
        </Form.Item>
      </div>

      <Form.Item name="payMode" label="Оплата" extra="Можно изменить позже, когда станет ясно, сколько человек отработал.">
        <Select options={(Object.keys(payModeTitles) as PayMode[]).map(value => ({ value, label: payModeTitles[value] }))}/>
      </Form.Item>

      {mode === 'series' && <Form.Item name="days" label="Дни недели" rules={[{ required: true, message: 'Выберите хотя бы один день' }]}>
        <Select
          mode="multiple" allowClear={false} placeholder="Выберите дни"
          options={weekdays.map(([value, label]) => ({ value, label }))}
        />
      </Form.Item>}

      <ErrorNote error={save.error}/>
    </Form>
  </FormModal>
}

function ReplaceForm({ shift, onClose }:{ shift:Shift; onClose:() => void }) {
  const queryClient = useQueryClient()
  const [form] = Form.useForm<{ employeeId:string; reason:string }>()
  const employees = useQuery({ queryKey: ['employees', false], queryFn: () => listEmployees() })
  const save = useMutation({
    mutationFn: ({ employeeId, reason }:{ employeeId:string; reason:string }) => replaceShift(shift.id, employeeId, reason),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['shifts'] }); onClose() },
  })
  const candidates = (employees.data ?? []).filter(e => e.id !== shift.employeeId)

  return <FormModal
    title="Замена сотрудника" onClose={onClose}
    footer={<Space wrap>
      <Button type="primary" loading={save.isPending} onClick={() => form.submit()}>Заменить</Button>
      <Button onClick={onClose}>Отмена</Button>
    </Space>}
  >
    <Typography.Paragraph type="secondary">
      Смена {dateLabel(shift.startsAt)}, {timeLabel(shift.startsAt)}–{timeLabel(shift.endsAt)}.
    </Typography.Paragraph>
    <Form form={form} layout="vertical" requiredMark={false} onFinish={values => save.mutate(values)}>
      <Form.Item name="employeeId" label="Кто выходит вместо" rules={[{ required: true, message: 'Выберите сотрудника' }]}>
        <Select
          placeholder="Выберите сотрудника" showSearch optionFilterProp="label"
          options={candidates.map(employee => ({ value: employee.id, label: employee.fullName }))}
        />
      </Form.Item>
      <Form.Item name="reason" label="Причина" rules={[{ required: true, message: 'Укажите причину' }]}>
        <Input placeholder="Например, больничный"/>
      </Form.Item>
      <ErrorNote error={save.error}/>
    </Form>
  </FormModal>
}
