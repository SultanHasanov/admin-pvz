import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Col, DatePicker, Form, Input, List, Popconfirm, Row, Select, Space, Statistic, Timeline, Tooltip, Typography } from 'antd'
import dayjs from 'dayjs'
import { History, Pencil, Plus, Trash2 } from 'lucide-react'
import type { Deduction, DeductionStatus } from '../entities/types'
import { dateLabel, monthLabel, timeLabel } from '../shared/dates'
import { isValidMoney, moneyInput, parseMoney, rubles } from '../shared/money'
import { Badge, EmptyState, ErrorNote, FormModal, Loading, Title } from '../shared/ui'
import { createDeduction, deleteDeduction, listDeductionEvents, listDeductions, setDeductionStatus, updateDeduction, type DeductionInput } from '../services/deductions'
import { listEmployees } from '../services/employees'
import { listShifts } from '../services/shifts'
import { useOrg } from '../app/OrgContext'

export const deductionTitles:Record<DeductionStatus, string> = {
  NEW: 'Новое', INVESTIGATING: 'Разбираемся', DISPUTED: 'Оспорено', PENDING: 'Ждём ответ WB',
  CANCELLED_BY_WB: 'Отменено WB', CONFIRMED_BY_WB: 'Подтверждено WB',
  EMPLOYEE_LIABILITY: 'На сотруднике', OWNER_LOSS: 'Убыток владельца',
}
const tone:Record<DeductionStatus, 'slate' | 'green' | 'amber' | 'red'> = {
  NEW: 'amber', INVESTIGATING: 'amber', DISPUTED: 'amber', PENDING: 'amber',
  CANCELLED_BY_WB: 'green', CONFIRMED_BY_WB: 'red', EMPLOYEE_LIABILITY: 'red', OWNER_LOSS: 'red',
}
const statuses = Object.keys(deductionTitles) as DeductionStatus[]

export function DeductionsPage() {
  const queryClient = useQueryClient()
  const { month, pointId, pointName, points } = useOrg()
  const [form, setForm] = useState<{ entry?:Deduction }>()
  const [history, setHistory] = useState<Deduction>()

  const deductions = useQuery({ queryKey: ['deductions', month, pointId], queryFn: () => listDeductions(month, pointId || undefined) })
  const employees = useQuery({ queryKey: ['employees', true], queryFn: () => listEmployees(true) })
  const nameOf = (id:string | null) => employees.data?.find(e => e.id === id)?.fullName ?? '—'
  const invalidate = () => { void queryClient.invalidateQueries({ queryKey: ['deductions'] }) }

  const status = useMutation({ mutationFn: ({ id, next }:{ id:string; next:DeductionStatus }) => setDeductionStatus(id, next), onSuccess: invalidate })
  const remove = useMutation({ mutationFn: deleteDeduction, onSuccess: invalidate })

  const total = (deductions.data ?? []).reduce((sum, item) => sum + item.amountKopecks, 0)
  const byEmployee = [...(deductions.data ?? []).reduce((groups, item) => {
    if (!item.employeeId || item.status === 'CANCELLED_BY_WB') return groups
    const current = groups.get(item.employeeId) ?? { employeeId: item.employeeId, count: 0, amount: 0 }
    current.count += 1
    current.amount += item.amountKopecks
    groups.set(item.employeeId, current)
    return groups
  }, new Map<string, { employeeId:string; count:number; amount:number }>()).values()].sort((a, b) => b.amount - a.amount)

  return <>
    <Title title="Удержания WB" subtitle={`${monthLabel(month)} · ${pointId ? pointName(pointId) : 'Все ПВЗ'}`}>
      <Button type="primary" icon={<Plus size={16}/>} onClick={() => setForm({})} disabled={!points.length}>Добавить удержание</Button>
    </Title>

    {byEmployee.length > 0 && <Row gutter={[12, 12]} className="mb-4">
      {byEmployee.map(item => <Col key={item.employeeId} xs={12} md={8} xl={6}>
        <Card size="small" variant="outlined">
          <Statistic
            title={<span className="truncate">{nameOf(item.employeeId)}</span>}
            value={rubles(item.amount)} valueStyle={{ fontSize: 18, fontWeight: 700 }}
            suffix={<Typography.Text type="secondary" className="text-xs">{item.count} шт.</Typography.Text>}
          />
        </Card>
      </Col>)}
    </Row>}

    <Card variant="outlined" styles={{ body: { padding: 0 } }}>
      {deductions.isLoading ? <Loading/> : !deductions.data?.length ? <EmptyState text="За этот месяц удержаний нет."/>
        : <>
          <List
            dataSource={deductions.data} rowKey="id"
            renderItem={item => <List.Item style={{ display: 'block', paddingInline: 16 }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Space size={8} wrap>
                    <Typography.Text strong>{rubles(item.amountKopecks)}</Typography.Text>
                    <Badge tone={tone[item.status]}>{deductionTitles[item.status]}</Badge>
                  </Space>
                  <div>{item.reason}</div>
                  <Typography.Text type="secondary" className="text-xs">
                    {item.eventAt ? `${dateLabel(item.eventAt)} ${timeLabel(item.eventAt)}` : dateLabel(item.createdAt)} · {pointName(item.pickupPointId)}
                    {item.employeeId ? ` · ${nameOf(item.employeeId)}` : ''}
                  </Typography.Text>
                  {item.comment && <div><Typography.Text type="secondary" className="text-xs">{item.comment}</Typography.Text></div>}
                </div>
                <Space size={4} wrap>
                  <Tooltip title="История"><Button size="small" icon={<History size={15}/>} onClick={() => setHistory(item)}/></Tooltip>
                  <Tooltip title="Изменить"><Button size="small" icon={<Pencil size={15}/>} onClick={() => setForm({ entry: item })}/></Tooltip>
                  <Popconfirm title="Удалить удержание?" okText="Удалить" cancelText="Отмена" okButtonProps={{ danger: true }} onConfirm={() => remove.mutate(item.id)}>
                    <Tooltip title="Удалить"><Button size="small" icon={<Trash2 size={15}/>}/></Tooltip>
                  </Popconfirm>
                </Space>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Typography.Text type="secondary" className="text-sm">Статус:</Typography.Text>
                <Select
                  value={item.status} style={{ minWidth: 200, maxWidth: '100%' }}
                  onChange={next => status.mutate({ id: item.id, next })}
                  options={statuses.map(value => ({ value, label: deductionTitles[value] }))}
                />
              </div>
              {item.status === 'EMPLOYEE_LIABILITY' && !item.employeeId && <Typography.Text type="danger" className="mt-2 block text-xs">
                Укажите сотрудника — иначе сумма не попадёт в его зарплатный лист.
              </Typography.Text>}
            </List.Item>}
          />
          <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3">
            <Typography.Text type="secondary">Всего за месяц</Typography.Text>
            <Typography.Text strong>{rubles(total)}</Typography.Text>
          </div>
        </>}
    </Card>

    <Typography.Paragraph type="secondary" className="mt-3 text-xs">
      «На сотруднике» вычитается из его зарплаты, «Подтверждено WB» и «Убыток владельца» уменьшают чистую прибыль на «Главной».
    </Typography.Paragraph>

    <ErrorNote error={deductions.error ?? status.error ?? remove.error}/>
    {form && <DeductionForm entry={form.entry} onClose={() => setForm(undefined)}/>}
    {history && <HistoryModal deduction={history} onClose={() => setHistory(undefined)}/>}
  </>
}

function DeductionForm({ entry, onClose }:{ entry?:Deduction; onClose:() => void }) {
  const queryClient = useQueryClient()
  const { points, defaultPointId, month } = useOrg()
  const [pickupPointId, setPoint] = useState(entry?.pickupPointId ?? defaultPointId ?? points[0]?.id ?? '')
  const [amount, setAmount] = useState(entry ? moneyInput(entry.amountKopecks) : '')
  const [reason, setReason] = useState(entry?.reason ?? '')
  const [comment, setComment] = useState(entry?.comment ?? '')
  const [eventAt, setEventAt] = useState(entry?.eventAt ?? new Date().toISOString())
  const [employeeId, setEmployee] = useState(entry?.employeeId ?? '')
  const [shiftId, setShift] = useState(entry?.shiftId ?? '')

  const employees = useQuery({ queryKey: ['employees', false], queryFn: () => listEmployees() })
  const shifts = useQuery({ queryKey: ['shifts', month, pickupPointId], queryFn: () => listShifts(month, pickupPointId || undefined), enabled: Boolean(pickupPointId) })

  const save = useMutation({
    mutationFn: () => {
      const input:DeductionInput = {
        pickupPointId, employeeId: employeeId || null, shiftId: shiftId || null,
        eventAt: new Date(eventAt).toISOString(), amountKopecks: parseMoney(amount), reason, comment,
      }
      return entry ? updateDeduction(entry.id, input) : createDeduction(input).then(() => undefined)
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['deductions'] }); onClose() },
  })

  const ready = isValidMoney(amount) && Boolean(pickupPointId) && Boolean(reason.trim())

  return <FormModal
    title={entry ? 'Изменить удержание' : 'Новое удержание WB'} onClose={onClose}
    footer={<Space wrap>
      <Button type="primary" loading={save.isPending} disabled={!ready} onClick={() => save.mutate()}>Сохранить</Button>
      <Button onClick={onClose}>Отмена</Button>
    </Space>}
  >
    <Form layout="vertical" requiredMark={false}>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Form.Item label="Сумма, ₽" required>
          <Input autoFocus inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} suffix="₽"/>
        </Form.Item>
        <Form.Item label="Когда произошло" required>
          <DatePicker
            showTime={{ format: 'HH:mm' }} format="DD.MM.YYYY HH:mm" style={{ width: '100%' }} allowClear={false}
            value={dayjs(eventAt)} onChange={value => value && setEventAt(value.toISOString())}
          />
        </Form.Item>
      </div>

      <Form.Item label="Причина" required>
        <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Например, подмена товара"/>
      </Form.Item>

      <Form.Item label="ПВЗ" required>
        <Select
          value={pickupPointId || undefined} placeholder="Выберите ПВЗ"
          onChange={value => { setPoint(value); setShift('') }}
          options={points.map(point => ({ value: point.id, label: point.name }))}
        />
      </Form.Item>

      <div className="grid gap-x-4 sm:grid-cols-2">
        <Form.Item label="Сотрудник" extra="Нужен, если ответственность переложена на него.">
          <Select
            value={employeeId} onChange={setEmployee} showSearch optionFilterProp="label"
            options={[{ value: '', label: 'Не указан' }, ...(employees.data ?? []).map(e => ({ value: e.id, label: e.fullName }))]}
          />
        </Form.Item>
        <Form.Item label="Смена">
          <Select
            value={shiftId} onChange={setShift}
            options={[
              { value: '', label: 'Не привязано' },
              ...(shifts.data ?? []).map(shift => ({
                value: shift.id,
                label: `${dateLabel(shift.startsAt)} ${timeLabel(shift.startsAt)}–${timeLabel(shift.endsAt)}`,
              })),
            ]}
          />
        </Form.Item>
      </div>

      <Form.Item label="Комментарий">
        <Input value={comment ?? ''} onChange={e => setComment(e.target.value)} placeholder="Необязательно"/>
      </Form.Item>

      <ErrorNote error={save.error}/>
    </Form>
  </FormModal>
}

function HistoryModal({ deduction, onClose }:{ deduction:Deduction; onClose:() => void }) {
  const events = useQuery({ queryKey: ['deduction-events', deduction.id], queryFn: () => listDeductionEvents(deduction.id) })
  return <FormModal title="История удержания" onClose={onClose} footer={<Button onClick={onClose}>Закрыть</Button>}>
    {events.isLoading ? <Loading/> : !events.data?.length ? <EmptyState text="Событий нет."/>
      : <Timeline items={events.data.map(event => ({
        key: event.id,
        children: <>
          <Typography.Text strong>{deductionTitles[event.eventType as DeductionStatus] ?? event.eventType}</Typography.Text>
          <div><Typography.Text type="secondary" className="text-xs">
            {dateLabel(event.createdAt)} {timeLabel(event.createdAt)}{event.note ? ` · ${event.note}` : ''}
          </Typography.Text></div>
        </>,
      }))}/>}
  </FormModal>
}
