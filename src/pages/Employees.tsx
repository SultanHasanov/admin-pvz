import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Card, Checkbox, Form, Input, Select, Space, Switch, Tooltip, Typography } from 'antd'
import type { TableProps } from 'antd'
import { Pencil, Plus } from 'lucide-react'
import type { Employee, PaymentType } from '../entities/types'
import { formatPhone, formatTelegram } from '../shared/format'
import { isValidMoney, moneyInput, parseMoney, rubles } from '../shared/money'
import { paymentTitles, rateAmount, rateOption, rateTitle } from '../shared/salary'
import { today } from '../shared/dates'
import { Badge, CardRow, EmptyState, ErrorNote, FormModal, ResponsiveTable, SectionTitle, Title } from '../shared/ui'
import { createEmployee, listEmployees, saveRate, setEmployeeStatus, updateEmployee, type EmployeeInput } from '../services/employees'
import { createSalaryRate, listSalaryRates } from '../services/rates'
import { useOrg } from '../app/OrgContext'

export function EmployeesPage() {
  const queryClient = useQueryClient()
  const { points, pointId, pointName } = useOrg()
  const [showArchived, setShowArchived] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [creating, setCreating] = useState(false)
  const employees = useQuery({ queryKey: ['employees', showArchived], queryFn: () => listEmployees(showArchived) })
  const rates = useQuery({ queryKey: ['salary-rates', true], queryFn: () => listSalaryRates(true) })

  const status = useMutation({
    mutationFn: ({ id, next }:{ id:string; next:'ACTIVE' | 'ARCHIVED' }) => setEmployeeStatus(id, next),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['employees'] }) },
  })

  const visible = (employees.data ?? []).filter(employee => !pointId || employee.pickupPointIds.includes(pointId))
  const rateNote = (employee:Employee) => {
    const rate = rates.data?.find(item => item.id === employee.salaryRateId)
    return rate ? rateTitle(rate) : `${paymentTitles[employee.paymentType]} · своя сумма`
  }

  /** Выключенный сотрудник пропадает из смен, зарплат и всех выпадающих списков. */
  const activeSwitch = (employee:Employee) => <Tooltip title={employee.status === 'ACTIVE' ? 'Отключить сотрудника' : 'Включить обратно'}>
    <Switch
      size="small" checked={employee.status === 'ACTIVE'} loading={status.isPending}
      aria-label="Сотрудник активен"
      onChange={active => status.mutate({ id: employee.id, next: active ? 'ACTIVE' : 'ARCHIVED' })}
    />
  </Tooltip>

  const actions = (employee:Employee) => <Space size={4}>
    <Tooltip title="Изменить"><Button icon={<Pencil size={15}/>} onClick={() => setEditing(employee)}/></Tooltip>
  </Space>

  const columns:TableProps<Employee>['columns'] = [
    {
      title: 'Сотрудник', dataIndex: 'fullName', key: 'name',
      render: (_, employee) => <div className="min-w-0">
        <Space size={8}><Typography.Text strong>{employee.fullName}</Typography.Text>{employee.status === 'ARCHIVED' && <Badge>Отключён</Badge>}</Space>
        {employee.phone && <div><Typography.Text type="secondary" className="text-xs">{employee.phone}</Typography.Text></div>}
      </div>,
    },
    {
      title: 'Ставка', key: 'rate',
      render: (_, employee) => <div>
        {rateAmount(employee)}
        <div><Typography.Text type="secondary" className="text-xs">{rateNote(employee)}</Typography.Text></div>
      </div>,
    },
    { title: 'Часовая', key: 'hourly', render: (_, employee) => employee.hourlyRateKopecks ? `${rubles(employee.hourlyRateKopecks)} / час` : '—' },
    { title: 'ПВЗ', key: 'points', render: (_, employee) => employee.pickupPointIds.map(pointName).join(', ') || '—' },
    { title: 'Активен', key: 'active', align: 'center', width: 90, render: (_, employee) => activeSwitch(employee) },
    { title: '', key: 'actions', align: 'right', render: (_, employee) => actions(employee) },
  ]

  return <>
    <Title title="Сотрудники" subtitle={pointId ? pointName(pointId) : 'Все ПВЗ'}>
      <Space wrap>
        <Button onClick={() => setShowArchived(!showArchived)}>{showArchived ? 'Только активные' : 'Показать отключённых'}</Button>
        <Button type="primary" icon={<Plus size={16}/>} onClick={() => setCreating(true)} disabled={!points.length}>Добавить сотрудника</Button>
      </Space>
    </Title>

    {!points.length && <Alert className="mb-4" type="warning" showIcon message="Сначала добавьте хотя бы один ПВЗ в разделе «ПВЗ»."/>}

    <Card variant="outlined" styles={{ body: { padding: 0 } }}>
      <ResponsiveTable<Employee>
        rowKey="id" columns={columns} dataSource={visible} loading={employees.isLoading}
        locale={{ emptyText: <EmptyState text="Сотрудников пока нет." action={points.length ? <Button type="primary" icon={<Plus size={16}/>} onClick={() => setCreating(true)}>Добавить сотрудника</Button> : undefined}/> }}
        mobileCard={employee => <>
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Space size={8} wrap><Typography.Text strong>{employee.fullName}</Typography.Text>{employee.status === 'ARCHIVED' && <Badge>Отключён</Badge>}</Space>
              {employee.phone && <div><Typography.Text type="secondary" className="text-xs">{employee.phone}</Typography.Text></div>}
            </div>
            {actions(employee)}
          </div>
          <CardRow label="Ставка">{rateAmount(employee)}<div><Typography.Text type="secondary" className="text-xs">{rateNote(employee)}</Typography.Text></div></CardRow>
          <CardRow label="Часовая">{employee.hourlyRateKopecks ? `${rubles(employee.hourlyRateKopecks)} / час` : '—'}</CardRow>
          <CardRow label="ПВЗ">{employee.pickupPointIds.map(pointName).join(', ') || '—'}</CardRow>
          <CardRow label="Активен">{activeSwitch(employee)}</CardRow>
        </>}
      />
    </Card>

    <ErrorNote error={employees.error ?? status.error}/>
    {(creating || editing) && <EmployeeForm employee={editing} onClose={() => { setCreating(false); setEditing(null) }}/>}
  </>
}

/** Значение селекта ставки: id из справочника либо «своя сумма». */
const CUSTOM = 'CUSTOM'

function EmployeeForm({ employee, onClose }:{ employee:Employee | null; onClose:() => void }) {
  const queryClient = useQueryClient()
  const { points, defaultPointId } = useOrg()
  const rates = useQuery({ queryKey: ['salary-rates', true], queryFn: () => listSalaryRates(true) })
  // Скрытые ставки не предлагаем, но ту, что уже стоит у сотрудника, из списка не убираем.
  const catalog = (rates.data ?? []).filter(item => !item.archivedAt || item.id === employee?.salaryRateId)

  const [fullName, setFullName] = useState(employee?.fullName ?? '')
  const [phone, setPhone] = useState(employee?.phone ?? '')
  const [telegramUsername, setTelegram] = useState(employee?.telegramUsername ?? '')
  const [rateId, setRateId] = useState<string>(employee?.salaryRateId ?? (employee ? CUSTOM : ''))
  const [paymentType, setPaymentType] = useState<PaymentType>(employee?.paymentType ?? 'SHIFT')
  const [rate, setRate] = useState(employee && !employee.salaryRateId ? moneyInput(employee.rateKopecks) : '')
  const [normDays, setNormDays] = useState(String(employee?.monthlyNormDays ?? 22))
  const [selected, setSelected] = useState<string[]>(employee?.pickupPointIds ?? (defaultPointId ? [defaultPointId] : points.length === 1 ? [points[0].id] : []))
  const [newRate, setNewRate] = useState<SalaryRateDraft | null>(null)

  // При добавлении ставку не спрашиваем: берём её из справочника — по умолчанию, иначе первую доступную.
  // Поменять ставку можно потом, через «Изменить», где появляется раздел «Как платим».
  useEffect(() => {
    if (employee || rateId) return
    const open = (rates.data ?? []).filter(item => !item.archivedAt)
    const preset = open.find(item => item.isDefault) ?? open[0]
    if (preset) setRateId(preset.id)
  }, [rates.data, employee, rateId])

  const chosen = catalog.find(item => item.id === rateId)
  const effective = {
    paymentType: chosen?.paymentType ?? paymentType,
    rateKopecks: chosen?.rateKopecks ?? parseMoney(rate),
    monthlyNormDays: chosen?.monthlyNormDays ?? (Number(normDays) || 22),
  }
  // Часовую ставку в форме не редактируем — сохраняем ту, что уже стоит у сотрудника.
  const hourlyKopecks = effective.paymentType === 'HOURLY' ? null : employee?.hourlyRateKopecks ?? null
  // История ставок ведётся с сегодняшнего дня: прошлые смены считаются по прежней сумме.
  const effectiveFrom = today()

  const problem = !fullName.trim() ? 'Укажите ФИО'
    : !rateId ? (employee ? 'Выберите ставку' : 'Сначала добавьте ставку в разделе «Зарплаты» → «Ставки»')
      : rateId === CUSTOM && !isValidMoney(rate) ? 'Укажите сумму ставки'
        : !selected.length ? 'Выберите хотя бы один ПВЗ' : ''

  const input = ():EmployeeInput => ({
    fullName, phone: phone ?? '', telegramUsername: telegramUsername ?? '',
    paymentType: effective.paymentType, rateKopecks: effective.rateKopecks, monthlyNormDays: effective.monthlyNormDays,
    salaryRateId: chosen?.id ?? null, hourlyRateKopecks: hourlyKopecks,
    pickupPointIds: selected, effectiveFrom,
  })

  const save = useMutation({
    mutationFn: async () => {
      if (problem) throw new Error(problem)
      if (!employee) return void await createEmployee(input())
      await updateEmployee(employee.id, input())
      // Ставка изменилась — пишем новую строку истории, старая остаётся для прошлых смен.
      const changed = effective.rateKopecks !== employee.rateKopecks || effective.paymentType !== employee.paymentType
        || (hourlyKopecks ?? null) !== (employee.hourlyRateKopecks ?? null) || (chosen?.id ?? null) !== employee.salaryRateId
      if (changed) await saveRate(employee.id, input(), effectiveFrom)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['employees'] })
      void queryClient.invalidateQueries({ queryKey: ['salary-rules'] })
      onClose()
    },
  })

  const hourlyCatalog = catalog.filter(item => item.paymentType === 'HOURLY')
  const amountLabel = paymentType === 'HOURLY' ? 'Сумма за час, ₽' : paymentType === 'SALARY' ? 'Оклад за месяц, ₽' : 'Сумма за смену, ₽'

  return <FormModal
    title={employee ? 'Изменить сотрудника' : 'Новый сотрудник'} onClose={onClose}
    footer={<Space wrap>
      <Button type="primary" loading={save.isPending} disabled={Boolean(problem)} onClick={() => save.mutate()}>Сохранить</Button>
      <Button onClick={onClose}>Отмена</Button>
    </Space>}
  >
    <Form layout="vertical" requiredMark={false} onSubmitCapture={event => { event.preventDefault(); if (!problem) save.mutate() }}>
      <SectionTitle first>Кто работает</SectionTitle>
      <Form.Item label="ФИО" required>
        <Input autoFocus value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Иванов Иван"/>
      </Form.Item>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Form.Item label="Телефон">
          <Input inputMode="tel" value={phone ?? ''} onChange={e => setPhone(formatPhone(e.target.value))} placeholder="+7 (900) 000-00-00"/>
        </Form.Item>
        <Form.Item label="Telegram" extra="Нужен, чтобы сотрудник получал смены в боте. Можно заполнить позже.">
          <Input value={telegramUsername ?? ''} onChange={e => setTelegram(formatTelegram(e.target.value))} placeholder="@username"/>
        </Form.Item>
      </div>

      {/* При создании ставка берётся из справочника автоматически — раздел показываем только при правке. */}
      {employee && <>
        <SectionTitle>Как платим</SectionTitle>
        <Form.Item label="Ставка" extra="Новая ставка действует с указанной даты, прошлые смены останутся по старой.">
          <Select
            value={rateId || undefined} placeholder="Выберите ставку"
            onChange={value => { setRateId(value); setNewRate(null) }}
            options={[
              ...catalog.map(item => ({ value: item.id, label: `${rateOption(item)}${item.isDefault ? ' · по умолчанию' : ''}` })),
              { value: CUSTOM, label: 'Своя сумма — только для этого сотрудника' },
            ]}
          />
        </Form.Item>

        {rateId === CUSTOM && <Card size="small" style={{ marginBottom: 16, background: '#fafafa' }}>
          <div className="grid gap-x-4 sm:grid-cols-2">
            <Form.Item label="Тип оплаты" style={{ marginBottom: 12 }}>
              <Select value={paymentType} onChange={setPaymentType} options={Object.entries(paymentTitles).map(([value, label]) => ({ value, label }))}/>
            </Form.Item>
            <Form.Item label={amountLabel} style={{ marginBottom: 12 }}>
              <Input inputMode="decimal" value={rate} onChange={e => setRate(e.target.value)} suffix="₽"/>
            </Form.Item>
          </div>
          {paymentType === 'SALARY' && <Form.Item label="Норма рабочих дней в месяце" extra="Из неё считается оплата за один день." style={{ marginBottom: 12 }}>
            <Input inputMode="numeric" value={normDays} onChange={e => setNormDays(e.target.value)}/>
          </Form.Item>}
          <Typography.Text type="secondary" className="text-xs">
            Такую же сумму можно сохранить в справочник и переиспользовать —{' '}
            <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setNewRate({ name: '', paymentType, rate, normDays })}>добавить ставку</Button>.
          </Typography.Text>
        </Card>}

        {newRate && <NewRateBox draft={newRate} onCancel={() => setNewRate(null)} onCreated={id => { setNewRate(null); setRateId(id) }}/>}

      </>}

      {points.length > 1 && <>
        <SectionTitle>Пункты выдачи</SectionTitle>
        <Checkbox.Group
          value={selected} onChange={values => setSelected(values as string[])}
          options={points.map(point => ({ value: point.id, label: point.name }))}
          style={{ display: 'grid', gap: 8 }}
        />
      </>}

      <ErrorNote error={save.error}/>
    </Form>
  </FormModal>
}

interface SalaryRateDraft { name:string; paymentType:PaymentType; rate:string; normDays:string }

/** Ставку можно завести прямо из карточки сотрудника, не теряя заполненную форму. */
function NewRateBox({ draft, onCancel, onCreated }:{ draft:SalaryRateDraft; onCancel:() => void; onCreated:(id:string) => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(draft.name)
  const [paymentType, setPaymentType] = useState(draft.paymentType)
  const [rate, setRate] = useState(draft.rate)
  const [normDays, setNormDays] = useState(draft.normDays)

  const create = useMutation({
    mutationFn: () => createSalaryRate({ name, paymentType, rateKopecks: parseMoney(rate), monthlyNormDays: Number(normDays) || 22 }),
    onSuccess: id => { void queryClient.invalidateQueries({ queryKey: ['salary-rates'] }); onCreated(id) },
  })

  return <Card size="small" title="Новая ставка в справочнике" style={{ marginBottom: 16, borderColor: '#16a34a' }}>
    <div className="grid gap-x-4 sm:grid-cols-2">
      <Form.Item label="Тип оплаты" style={{ marginBottom: 12 }}>
        <Select value={paymentType} onChange={setPaymentType} options={Object.entries(paymentTitles).map(([value, label]) => ({ value, label }))}/>
      </Form.Item>
      <Form.Item label="Сумма, ₽" style={{ marginBottom: 12 }}>
        <Input inputMode="decimal" value={rate} onChange={e => setRate(e.target.value)} suffix="₽"/>
      </Form.Item>
    </div>
    {paymentType === 'SALARY' && <Form.Item label="Норма рабочих дней" style={{ marginBottom: 12 }}>
      <Input inputMode="numeric" value={normDays} onChange={e => setNormDays(e.target.value)}/>
    </Form.Item>}
    <Form.Item label="Пометка (необязательно)" extra="Нужна, только если ставок одного типа несколько." style={{ marginBottom: 12 }}>
      <Input value={name} onChange={e => setName(e.target.value)} placeholder="Например: ночная"/>
    </Form.Item>
    <ErrorNote error={create.error}/>
    <Space wrap className="mt-2">
      <Button type="primary" size="small" loading={create.isPending} disabled={!isValidMoney(rate)} onClick={() => create.mutate()}>Добавить в справочник</Button>
      <Button size="small" onClick={onCancel}>Отмена</Button>
    </Space>
  </Card>
}
