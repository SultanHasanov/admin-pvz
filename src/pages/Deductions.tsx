import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { History, Pencil, Plus, Trash2 } from 'lucide-react'
import type { Deduction, DeductionStatus } from '../entities/types'
import { dateLabel, monthLabel, timeLabel } from '../shared/dates'
import { isValidMoney, moneyInput, parseMoney, rubles } from '../shared/money'
import { Badge, EmptyState, ErrorNote, Field, Loading, Modal, Title, confirmAction } from '../shared/ui'
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
    const current = groups.get(item.employeeId) ?? { employeeId:item.employeeId, count:0, amount:0 }
    current.count += 1
    current.amount += item.amountKopecks
    groups.set(item.employeeId, current)
    return groups
  }, new Map<string, { employeeId:string; count:number; amount:number }>()).values()].sort((a, b) => b.amount - a.amount)

  return <>
    <Title title="Удержания WB" subtitle={`${monthLabel(month)} · ${pointId ? pointName(pointId) : 'Все ПВЗ'}`}>
      <button className="btn btn-primary" onClick={() => setForm({})} disabled={!points.length}><Plus size={16}/>Добавить удержание</button>
    </Title>

    {byEmployee.length > 0 && <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {byEmployee.map(item => <div key={item.employeeId} className="card p-4">
        <p className="truncate text-sm text-slate-500">{nameOf(item.employeeId)}</p>
        <div className="mt-1 flex items-end justify-between gap-3"><b className="text-lg">{rubles(item.amount)}</b><span className="text-xs text-slate-500">{item.count} шт.</span></div>
      </div>)}
    </div>}

    <div className="card overflow-hidden">
      {deductions.isLoading ? <Loading/> : !deductions.data?.length ? <EmptyState text="За этот месяц удержаний нет."/>
        : <>
          <div className="divide-y">{deductions.data.map(item => <div key={item.id} className="p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><b>{rubles(item.amountKopecks)}</b><Badge tone={tone[item.status]}>{deductionTitles[item.status]}</Badge></div>
                <p className="mt-1 text-sm">{item.reason}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {item.eventAt ? `${dateLabel(item.eventAt)} ${timeLabel(item.eventAt)}` : dateLabel(item.createdAt)} · {pointName(item.pickupPointId)}
                  {item.employeeId ? ` · ${nameOf(item.employeeId)}` : ''}
                </p>
                {item.comment && <p className="mt-1 text-xs text-slate-500">{item.comment}</p>}
              </div>
              <div className="flex flex-wrap gap-1">
                <button aria-label="История" className="btn px-2 py-1 text-sm" onClick={() => setHistory(item)}><History size={15}/></button>
                <button aria-label="Изменить" className="btn px-2 py-1 text-sm" onClick={() => setForm({ entry: item })}><Pencil size={15}/></button>
                <button aria-label="Удалить" className="btn px-2 py-1 text-sm" onClick={() => confirmAction('Удалить удержание?') && remove.mutate(item.id)}><Trash2 size={15}/></button>
              </div>
            </div>
            <label className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-slate-500">Статус:</span>
              <select className="field sm:w-56" value={item.status} onChange={e => status.mutate({ id: item.id, next: e.target.value as DeductionStatus })}>
                {statuses.map(value => <option key={value} value={value}>{deductionTitles[value]}</option>)}
              </select>
            </label>
            {item.status === 'EMPLOYEE_LIABILITY' && !item.employeeId && <p className="mt-2 text-xs text-red-600">Укажите сотрудника — иначе сумма не попадёт в его зарплатный лист.</p>}
          </div>)}</div>
          <div className="flex items-center justify-between gap-3 bg-slate-50 px-4 py-3 text-sm sm:px-5"><span className="text-slate-500">Всего за месяц</span><b>{rubles(total)}</b></div>
        </>}
    </div>

    <p className="mt-3 text-xs text-slate-500">«На сотруднике» вычитается из его зарплаты, «Подтверждено WB» и «Убыток владельца» уменьшают чистую прибыль на «Главной».</p>

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
  const [eventAt, setEventAt] = useState((entry?.eventAt ?? new Date().toISOString()).slice(0, 16))
  const [employeeId, setEmployee] = useState(entry?.employeeId ?? '')
  const [shiftId, setShift] = useState(entry?.shiftId ?? '')

  const employees = useQuery({ queryKey: ['employees', false], queryFn: () => listEmployees() })
  const shifts = useQuery({ queryKey: ['shifts', month, pickupPointId], queryFn: () => listShifts(month, pickupPointId || undefined), enabled: Boolean(pickupPointId) })

  const save = useMutation({
    mutationFn: () => {
      const input:DeductionInput = { pickupPointId, employeeId: employeeId || null, shiftId: shiftId || null, eventAt: new Date(eventAt).toISOString(), amountKopecks: parseMoney(amount), reason, comment }
      return entry ? updateDeduction(entry.id, input) : createDeduction(input).then(() => undefined)
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['deductions'] }); onClose() },
  })

  return <Modal title={entry ? 'Изменить удержание' : 'Новое удержание WB'} onClose={onClose}>
    <form className="grid gap-4" onSubmit={event => { event.preventDefault(); save.mutate() }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Сумма, ₽"><input autoFocus className="field" required inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)}/></Field>
        <Field label="Когда произошло"><input type="datetime-local" className="field" required value={eventAt} onChange={e => setEventAt(e.target.value)}/></Field>
      </div>
      <Field label="Причина"><input className="field" required value={reason} onChange={e => setReason(e.target.value)} placeholder="Например, подмена товара"/></Field>
      <Field label="ПВЗ"><select className="field" required value={pickupPointId} onChange={e => { setPoint(e.target.value); setShift('') }}>
        <option value="">Выберите ПВЗ</option>
        {points.map(point => <option key={point.id} value={point.id}>{point.name}</option>)}
      </select></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Сотрудник" hint="Нужен, если ответственность переложена на него.">
          <select className="field" value={employeeId} onChange={e => setEmployee(e.target.value)}>
            <option value="">Не указан</option>
            {(employees.data ?? []).map(employee => <option key={employee.id} value={employee.id}>{employee.fullName}</option>)}
          </select>
        </Field>
        <Field label="Смена">
          <select className="field" value={shiftId} onChange={e => setShift(e.target.value)}>
            <option value="">Не привязано</option>
            {(shifts.data ?? []).map(shift => <option key={shift.id} value={shift.id}>{dateLabel(shift.startsAt)} {timeLabel(shift.startsAt)}–{timeLabel(shift.endsAt)}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Комментарий"><input className="field" value={comment ?? ''} onChange={e => setComment(e.target.value)} placeholder="Необязательно"/></Field>
      <ErrorNote error={save.error}/>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary flex-1 sm:flex-none" disabled={save.isPending || !isValidMoney(amount) || !pickupPointId}>{save.isPending ? 'Сохраняем…' : 'Сохранить'}</button>
        <button type="button" className="btn flex-1 sm:flex-none" onClick={onClose}>Отмена</button>
      </div>
    </form>
  </Modal>
}

function HistoryModal({ deduction, onClose }:{ deduction:Deduction; onClose:() => void }) {
  const events = useQuery({ queryKey: ['deduction-events', deduction.id], queryFn: () => listDeductionEvents(deduction.id) })
  return <Modal title="История удержания" onClose={onClose}>
    {events.isLoading ? <Loading/> : !events.data?.length ? <EmptyState text="Событий нет."/>
      : <div className="divide-y">{events.data.map(event => <div key={event.id} className="py-3">
        <b className="text-sm">{deductionTitles[event.eventType as DeductionStatus] ?? event.eventType}</b>
        <p className="text-xs text-slate-500">{dateLabel(event.createdAt)} {timeLabel(event.createdAt)}{event.note ? ` · ${event.note}` : ''}</p>
      </div>)}</div>}
  </Modal>
}
