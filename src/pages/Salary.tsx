import { useMemo, useState } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Card, DatePicker, Form, Input, Space, Tabs, Typography } from 'antd'
import type { TableProps } from 'antd'
import dayjs from 'dayjs'
import { Award, Ban, Lock, LockOpen, Wallet } from 'lucide-react'
import { calculateSalarySheet } from '../entities/calculations'
import type { SalaryPayment, SalarySheet } from '../entities/types'
import { monthLabel, today } from '../shared/dates'
import { isValidMoney, parseMoney, rubles } from '../shared/money'
import { CardRow, EmptyState, ErrorNote, FormModal, ResponsiveTable, Title } from '../shared/ui'
import { listEmployees, listSalaryRules } from '../services/employees'
import { listShifts } from '../services/shifts'
import { listDeductions } from '../services/deductions'
import { closeSalaryPeriod, createBonus, createPenalty, createSalaryPayment, getSalaryPeriod, listBonuses, listPenalties, listSalaryPayments, reopenSalaryPeriod } from '../services/salary'
import { SalaryRatesPanel } from './SalaryRates'
import { useOrg } from '../app/OrgContext'

type FormKind = 'BONUS' | 'PENALTY' | 'ADVANCE' | 'PAYMENT'
const formTitles:Record<FormKind, string> = { BONUS: 'Премия', PENALTY: 'Штраф', ADVANCE: 'Аванс', PAYMENT: 'Выплата' }

type Row = SalarySheet & { fullName:string }

export function SalaryPage() {
  const queryClient = useQueryClient()
  const { month, pointId, pointName } = useOrg()
  const [form, setForm] = useState<{ kind:FormKind; employeeId:string }>()
  const [tab, setTab] = useState('sheet')

  const employees = useQuery({ queryKey: ['employees', false], queryFn: () => listEmployees() })
  const [rules, shifts, bonuses, penalties, payments, deductions, period] = useQueries({
    queries: [
      { queryKey: ['salary-rules'], queryFn: listSalaryRules },
      { queryKey: ['shifts', month, pointId], queryFn: () => listShifts(month, pointId || undefined) },
      { queryKey: ['bonuses', month], queryFn: () => listBonuses(month) },
      { queryKey: ['penalties', month], queryFn: () => listPenalties(month) },
      { queryKey: ['salary-payments', month], queryFn: () => listSalaryPayments(month) },
      { queryKey: ['deductions', month, pointId], queryFn: () => listDeductions(month, pointId || undefined) },
      { queryKey: ['salary-period', month], queryFn: () => getSalaryPeriod(month) },
    ],
  })

  const loading = employees.isLoading || rules.isLoading || shifts.isLoading
  const staff = useMemo(() => (employees.data ?? []).filter(e => !pointId || e.pickupPointIds.includes(pointId)), [employees.data, pointId])

  const sheets:Row[] = useMemo(() => staff.map(employee => ({
    ...calculateSalarySheet({
      employeeId: employee.id, month,
      shifts: shifts.data ?? [], rules: rules.data ?? [],
      bonuses: bonuses.data ?? [], penalties: penalties.data ?? [],
      deductions: deductions.data ?? [], payments: payments.data ?? [],
    }),
    fullName: employee.fullName,
  })), [staff, month, shifts.data, rules.data, bonuses.data, penalties.data, deductions.data, payments.data])

  const closed = period.data?.status === 'CLOSED'
  const close = useMutation({
    mutationFn: () => closed ? reopenSalaryPeriod(month) : closeSalaryPeriod(month, sheets),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['salary-period'] }) },
  })

  const totals = sheets.reduce((acc, sheet) => ({ accrued: acc.accrued + sheet.accrued, balance: acc.balance + sheet.balance }), { accrued: 0, balance: 0 })

  const buttons = (employeeId:string) => <Space size={4} wrap>
    <Button size="small" icon={<Award size={15}/>} onClick={() => setForm({ kind: 'BONUS', employeeId })}>Премия</Button>
    <Button size="small" icon={<Ban size={15}/>} onClick={() => setForm({ kind: 'PENALTY', employeeId })}>Штраф</Button>
    <Button size="small" icon={<Wallet size={15}/>} onClick={() => setForm({ kind: 'ADVANCE', employeeId })}>Аванс</Button>
    <Button size="small" type="primary" icon={<Wallet size={15}/>} onClick={() => setForm({ kind: 'PAYMENT', employeeId })}>Выплатить</Button>
  </Space>

  const money = (value:number) => rubles(value)
  const columns:TableProps<Row>['columns'] = [
    { title: 'Сотрудник', dataIndex: 'fullName', key: 'name', render: value => <Typography.Text strong>{value}</Typography.Text> },
    { title: 'Смен', dataIndex: 'shifts', key: 'shifts', align: 'right' },
    { title: 'Начислено', dataIndex: 'accrued', key: 'accrued', align: 'right', render: money },
    { title: 'Премии', dataIndex: 'bonuses', key: 'bonuses', align: 'right', render: money },
    { title: 'Штрафы', dataIndex: 'penalties', key: 'penalties', align: 'right', render: money },
    { title: 'Удержания WB', dataIndex: 'deductions', key: 'deductions', align: 'right', render: money },
    { title: 'Выплачено', dataIndex: 'paid', key: 'paid', align: 'right', render: money },
    { title: 'К выплате', dataIndex: 'balance', key: 'balance', align: 'right', render: value => <Typography.Text strong>{rubles(value)}</Typography.Text> },
    { title: '', key: 'actions', align: 'right', render: (_, sheet) => buttons(sheet.employeeId) },
  ]

  const sheetTab = <>
    {closed && <Alert
      className="mb-4" type="info" showIcon
      message="Период закрыт — расчёт сохранён в истории начислений."
      description="Новые записи всё ещё можно добавлять, но снимок не обновится, пока период не открыть заново."
    />}

    <Card variant="outlined" styles={{ body: { padding: 0 } }}>
      <ResponsiveTable<Row>
        rowKey="employeeId" columns={columns} dataSource={sheets} loading={loading}
        locale={{ emptyText: <EmptyState text="Нет сотрудников для расчёта."/> }}
        mobileCard={sheet => <>
          <Typography.Text strong>{sheet.fullName}</Typography.Text>
          <div className="mt-2">
            <CardRow label="Смен">{sheet.shifts}</CardRow>
            <CardRow label="Начислено">{rubles(sheet.accrued)}</CardRow>
            <CardRow label="Премии">{rubles(sheet.bonuses)}</CardRow>
            <CardRow label="Штрафы">{rubles(sheet.penalties)}</CardRow>
            <CardRow label="Удержания WB">{rubles(sheet.deductions)}</CardRow>
            <CardRow label="Выплачено">{rubles(sheet.paid)}</CardRow>
            <CardRow label="К выплате"><Typography.Text strong>{rubles(sheet.balance)}</Typography.Text></CardRow>
          </div>
          <div className="mt-3">{buttons(sheet.employeeId)}</div>
        </>}
      />
    </Card>

    {Boolean(sheets.length) && <Card size="small" variant="outlined" className="mt-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Typography.Text type="secondary">Итого начислено {rubles(totals.accrued)}</Typography.Text>
        <Typography.Text strong>К выплате {rubles(totals.balance)}</Typography.Text>
      </div>
    </Card>}

    <ErrorNote error={close.error ?? rules.error ?? shifts.error}/>
  </>

  return <>
    <Title title="Зарплаты" subtitle={tab === 'rates' ? 'Справочник ставок' : `${monthLabel(month)} · ${pointId ? pointName(pointId) : 'Все ПВЗ'}`}>
      {tab === 'sheet' && <Button
        icon={closed ? <LockOpen size={15}/> : <Lock size={15}/>}
        loading={close.isPending} disabled={!sheets.length} onClick={() => close.mutate()}
      >{closed ? 'Открыть период' : 'Закрыть период'}</Button>}
    </Title>

    <Tabs
      activeKey={tab} onChange={setTab}
      items={[
        { key: 'sheet', label: 'Расчёт за месяц', children: sheetTab },
        { key: 'rates', label: 'Ставки', children: <SalaryRatesPanel/> },
      ]}
    />

    {form && <SalaryEntryForm
      kind={form.kind} employeeId={form.employeeId}
      employeeName={staff.find(e => e.id === form.employeeId)?.fullName ?? ''}
      onClose={() => setForm(undefined)}
    />}
  </>
}

function SalaryEntryForm({ kind, employeeId, employeeName, onClose }:{ kind:FormKind; employeeId:string; employeeName:string; onClose:() => void }) {
  const queryClient = useQueryClient()
  const { pointId } = useOrg()
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today())
  const [comment, setComment] = useState('')

  const save = useMutation({
    mutationFn: async () => {
      const amountKopecks = parseMoney(amount)
      if (kind === 'BONUS') return createBonus({ employeeId, date, amountKopecks, comment })
      if (kind === 'PENALTY') return createPenalty({ employeeId, pickupPointId: pointId || null, date, amountKopecks, reason: comment || 'Штраф', comment })
      const paymentKind:SalaryPayment['kind'] = kind === 'ADVANCE' ? 'ADVANCE' : 'PAYMENT'
      return createSalaryPayment({ employeeId, date, amountKopecks, kind: paymentKind, comment })
    },
    onSuccess: () => {
      for (const key of ['bonuses', 'penalties', 'salary-payments']) void queryClient.invalidateQueries({ queryKey: [key] })
      onClose()
    },
  })

  const ready = isValidMoney(amount) && (kind !== 'PENALTY' || Boolean(comment.trim()))

  return <FormModal
    title={`${formTitles[kind]} · ${employeeName}`} onClose={onClose}
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
        <Form.Item label="Дата" required>
          <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" allowClear={false} value={dayjs(date)} onChange={value => value && setDate(value.format('YYYY-MM-DD'))}/>
        </Form.Item>
      </div>
      <Form.Item label={kind === 'PENALTY' ? 'Причина' : 'Комментарий'} required={kind === 'PENALTY'}>
        <Input value={comment} onChange={e => setComment(e.target.value)} placeholder={kind === 'PENALTY' ? 'Например, опоздание' : 'Необязательно'}/>
      </Form.Item>
      {kind === 'PENALTY' && <Typography.Text type="secondary" className="text-xs">
        Штраф сразу уменьшает сумму к выплате. Статус можно изменить позже.
      </Typography.Text>}
      <ErrorNote error={save.error}/>
    </Form>
  </FormModal>
}
