import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, Pencil, Plus, RotateCcw } from 'lucide-react'
import type { Employee, PaymentType } from '../entities/types'
import { isValidMoney, moneyInput, parseMoney, rubles } from '../shared/money'
import { Badge, EmptyState, ErrorNote, Field, Loading, Modal, Title } from '../shared/ui'
import { createEmployee, listEmployees, saveRate, setEmployeeStatus, updateEmployee, type EmployeeInput } from '../services/employees'
import { listPointSalaryDefaults } from '../services/presets'
import { useOrg } from '../app/OrgContext'

export const paymentTitles:Record<PaymentType, string> = { SHIFT: 'За смену', HOURLY: 'Почасовая', SALARY: 'Оклад' }

export function EmployeesPage() {
  const queryClient = useQueryClient()
  const { points, pointId, pointName } = useOrg()
  const [showArchived, setShowArchived] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [creating, setCreating] = useState(false)
  const employees = useQuery({ queryKey: ['employees', showArchived], queryFn: () => listEmployees(showArchived) })

  const status = useMutation({
    mutationFn: ({ id, next }:{ id:string; next:'ACTIVE' | 'ARCHIVED' }) => setEmployeeStatus(id, next),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['employees'] }) },
  })

  const visible = (employees.data ?? []).filter(employee => !pointId || employee.pickupPointIds.includes(pointId))

  return <>
    <Title title="Сотрудники" subtitle={pointId ? pointName(pointId) : 'Все ПВЗ'}>
      <div className="flex flex-wrap gap-2">
        <button className="btn px-3 text-sm" onClick={() => setShowArchived(!showArchived)}>{showArchived ? 'Только активные' : 'Показать архив'}</button>
        <button className="btn btn-primary" onClick={() => setCreating(true)} disabled={!points.length}><Plus size={16}/>Добавить сотрудника</button>
      </div>
    </Title>

    {!points.length && <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Сначала добавьте хотя бы один ПВЗ в разделе «ПВЗ».</div>}

    <div className="card overflow-hidden">
      <div className="hidden grid-cols-[1.4fr_1fr_1fr_1.2fr_auto] gap-3 border-b bg-slate-50 px-5 py-3 text-xs font-semibold text-slate-500 md:grid">
        <span>Сотрудник</span><span>Тип оплаты</span><span>Ставка</span><span>ПВЗ</span><span/>
      </div>
      {employees.isLoading ? <Loading/> : !visible.length ? <EmptyState text="Сотрудников пока нет." action={points.length ? <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16}/>Добавить сотрудника</button> : undefined}/>
        : visible.map(employee => <div key={employee.id} className="grid gap-1.5 border-b px-4 py-4 last:border-0 sm:px-5 md:grid-cols-[1.4fr_1fr_1fr_1.2fr_auto] md:items-center md:gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><b>{employee.fullName}</b>{employee.status === 'ARCHIVED' && <Badge>В архиве</Badge>}</div>
            {employee.phone && <p className="text-xs text-slate-500">{employee.phone}</p>}
          </div>
          <span className="text-sm"><i className="mr-1 not-italic text-slate-500 md:hidden">Оплата:</i>{paymentTitles[employee.paymentType]}</span>
          <span className="text-sm"><i className="mr-1 not-italic text-slate-500 md:hidden">Ставка:</i>{rubles(employee.rateKopecks)}{employee.paymentType === 'HOURLY' ? ' / час' : ''}</span>
          <span className="text-sm"><i className="mr-1 not-italic text-slate-500 md:hidden">ПВЗ:</i>{employee.pickupPointIds.map(pointName).join(', ') || '—'}</span>
          <span className="mt-2 flex gap-2 md:mt-0">
            <button className="btn px-3 text-sm" onClick={() => setEditing(employee)}><Pencil size={15}/>Изменить</button>
            <button className="btn px-3 text-sm" onClick={() => status.mutate({ id: employee.id, next: employee.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE' })}>
              {employee.status === 'ACTIVE' ? <Archive size={15}/> : <RotateCcw size={15}/>}
            </button>
          </span>
        </div>)}
    </div>

    <ErrorNote error={employees.error ?? status.error}/>
    {(creating || editing) && <EmployeeForm employee={editing} onClose={() => { setCreating(false); setEditing(null) }}/>}
  </>
}

function EmployeeForm({ employee, onClose }:{ employee:Employee | null; onClose:() => void }) {
  const queryClient = useQueryClient()
  const { points, defaultPointId } = useOrg()
  const [fullName, setFullName] = useState(employee?.fullName ?? '')
  const [phone, setPhone] = useState(employee?.phone ?? '')
  const [telegramUsername, setTelegram] = useState(employee?.telegramUsername ?? '')
  const [paymentType, setPaymentType] = useState<PaymentType>(employee?.paymentType ?? 'SHIFT')
  const [rate, setRate] = useState(employee ? moneyInput(employee.rateKopecks) : '')
  const [normDays, setNormDays] = useState(String(employee?.monthlyNormDays ?? 22))
  const [selected, setSelected] = useState<string[]>(employee?.pickupPointIds ?? (defaultPointId ? [defaultPointId] : []))

  const defaults = useQuery({
    queryKey: ['point-rates', selected[0] ?? ''],
    queryFn: () => listPointSalaryDefaults(selected[0]),
    enabled: !employee && Boolean(selected[0]),
  })

  // У нового сотрудника ставка берётся из запомненной для выбранного ПВЗ, пока владелец её не изменил.
  useEffect(() => {
    if (employee || rate) return
    const match = defaults.data?.find(item => item.paymentType === paymentType)
    if (match) { setRate(moneyInput(match.rateKopecks)); setNormDays(String(match.monthlyNormDays)) }
  }, [defaults.data, paymentType, employee, rate])

  const input = ():EmployeeInput => ({ fullName, phone, telegramUsername, paymentType, rateKopecks: parseMoney(rate), monthlyNormDays: Number(normDays) || 22, pickupPointIds: selected })
  const save = useMutation({
    mutationFn: async () => {
      if (!selected.length) throw new Error('Выберите хотя бы один ПВЗ')
      if (employee) {
        await updateEmployee(employee.id, input())
        // Ставка изменилась — пишем новую строку истории, старая остаётся для прошлых смен.
        if (parseMoney(rate) !== employee.rateKopecks || paymentType !== employee.paymentType) {
          await saveRate(employee.id, { paymentType, rateKopecks: parseMoney(rate), monthlyNormDays: Number(normDays) || 22 })
        }
        return
      }
      await createEmployee(input())
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['employees'] }); void queryClient.invalidateQueries({ queryKey: ['salary-rules'] }); onClose() },
  })

  const togglePoint = (id:string) => setSelected(list => list.includes(id) ? list.filter(x => x !== id) : [...list, id])

  return <Modal title={employee ? 'Изменить сотрудника' : 'Новый сотрудник'} onClose={onClose}>
    <form className="grid gap-4" onSubmit={event => { event.preventDefault(); save.mutate() }}>
      <Field label="ФИО"><input className="field" required value={fullName} onChange={e => setFullName(e.target.value)}/></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Телефон"><input className="field" inputMode="tel" value={phone ?? ''} onChange={e => setPhone(e.target.value)} placeholder="+7 900 000-00-00"/></Field>
        <Field label="Telegram"><input className="field" value={telegramUsername ?? ''} onChange={e => setTelegram(e.target.value)} placeholder="@username"/></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Тип оплаты">
          <select className="field" value={paymentType} onChange={e => setPaymentType(e.target.value as PaymentType)}>{Object.entries(paymentTitles).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        </Field>
        <Field label={paymentType === 'HOURLY' ? 'Ставка за час, ₽' : paymentType === 'SALARY' ? 'Оклад за месяц, ₽' : 'Ставка за смену, ₽'} hint={employee ? 'Новая ставка начнёт действовать с сегодняшнего дня, прошлые смены останутся по старой.' : undefined}>
          <input className="field" required inputMode="decimal" value={rate} onChange={e => setRate(e.target.value)}/>
        </Field>
      </div>
      {paymentType === 'SALARY' && <Field label="Норма дней в месяце"><input className="field" inputMode="numeric" value={normDays} onChange={e => setNormDays(e.target.value)}/></Field>}
      <div>
        <span className="label">Пункты выдачи</span>
        <div className="grid gap-2">{points.map(point => <label key={point.id} className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-green-600" checked={selected.includes(point.id)} onChange={() => togglePoint(point.id)}/>
          <span>{point.name}</span>
        </label>)}</div>
      </div>
      <ErrorNote error={save.error}/>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary flex-1 sm:flex-none" disabled={save.isPending || !isValidMoney(rate)}>{save.isPending ? 'Сохраняем…' : 'Сохранить'}</button>
        <button type="button" className="btn flex-1 sm:flex-none" onClick={onClose}>Отмена</button>
      </div>
    </form>
  </Modal>
}
