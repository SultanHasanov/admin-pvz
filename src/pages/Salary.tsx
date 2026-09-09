import { useMemo, useState } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { Award, Ban, Lock, LockOpen, Wallet } from 'lucide-react'
import { calculateSalarySheet } from '../entities/calculations'
import type { SalaryPayment, SalarySheet } from '../entities/types'
import { monthLabel, today } from '../shared/dates'
import { isValidMoney, parseMoney, rubles } from '../shared/money'
import { EmptyState, ErrorNote, Field, Loading, Modal, Title } from '../shared/ui'
import { listEmployees, listSalaryRules } from '../services/employees'
import { listShifts } from '../services/shifts'
import { listDeductions } from '../services/deductions'
import { closeSalaryPeriod, createBonus, createPenalty, createSalaryPayment, getSalaryPeriod, listBonuses, listPenalties, listSalaryPayments, reopenSalaryPeriod } from '../services/salary'
import { useOrg } from '../app/OrgContext'

type FormKind = 'BONUS' | 'PENALTY' | 'ADVANCE' | 'PAYMENT'
const formTitles:Record<FormKind, string> = { BONUS: 'Премия', PENALTY: 'Штраф', ADVANCE: 'Аванс', PAYMENT: 'Выплата' }

export function SalaryPage() {
  const queryClient = useQueryClient()
  const { month, pointId, pointName } = useOrg()
  const [form, setForm] = useState<{ kind:FormKind; employeeId:string }>()

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

  const sheets:SalarySheet[] = useMemo(() => staff.map(employee => calculateSalarySheet({
    employeeId: employee.id, month,
    shifts: shifts.data ?? [], rules: rules.data ?? [],
    bonuses: bonuses.data ?? [], penalties: penalties.data ?? [],
    deductions: deductions.data ?? [], payments: payments.data ?? [],
  })), [staff, month, shifts.data, rules.data, bonuses.data, penalties.data, deductions.data, payments.data])

  const closed = period.data?.status === 'CLOSED'
  const close = useMutation({
    mutationFn: () => closed ? reopenSalaryPeriod(month) : closeSalaryPeriod(month, sheets),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['salary-period'] }) },
  })

  const totals = sheets.reduce((acc, sheet) => ({ accrued: acc.accrued + sheet.accrued, balance: acc.balance + sheet.balance }), { accrued: 0, balance: 0 })

  return <>
    <Title title="Зарплаты" subtitle={`${monthLabel(month)} · ${pointId ? pointName(pointId) : 'Все ПВЗ'}`}>
      <button className="btn px-3 text-sm" disabled={close.isPending || !sheets.length} onClick={() => close.mutate()}>
        {closed ? <><LockOpen size={15}/>Открыть период</> : <><Lock size={15}/>Закрыть период</>}
      </button>
    </Title>

    {closed && <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">Период закрыт — расчёт сохранён в истории начислений. Новые записи всё ещё можно добавлять, но снимок не обновится, пока период не открыть заново.</div>}

    <div className="card overflow-hidden">
      <div className="hidden grid-cols-[1.3fr_repeat(6,1fr)_auto] gap-3 border-b bg-slate-50 px-5 py-3 text-xs font-semibold text-slate-500 lg:grid">
        <span>Сотрудник</span><span>Смен</span><span>Начислено</span><span>Премии</span><span>Штрафы</span><span>Удержания WB</span><span>Выплачено</span><span>К выплате</span>
      </div>
      {loading ? <Loading/> : !sheets.length ? <EmptyState text="Нет сотрудников для расчёта."/>
        : sheets.map(sheet => {
          const employee = staff.find(e => e.id === sheet.employeeId)!
          return <div key={sheet.employeeId} className="border-b px-4 py-4 last:border-0 sm:px-5">
            <div className="grid gap-1.5 lg:grid-cols-[1.3fr_repeat(6,1fr)_auto] lg:items-center lg:gap-3">
              <b className="min-w-0">{employee.fullName}</b>
              <span className="text-sm"><i className="mr-1 not-italic text-slate-500 lg:hidden">Смен:</i>{sheet.shifts}</span>
              <span className="text-sm"><i className="mr-1 not-italic text-slate-500 lg:hidden">Начислено:</i>{rubles(sheet.accrued)}</span>
              <span className="text-sm"><i className="mr-1 not-italic text-slate-500 lg:hidden">Премии:</i>{rubles(sheet.bonuses)}</span>
              <span className="text-sm"><i className="mr-1 not-italic text-slate-500 lg:hidden">Штрафы:</i>{rubles(sheet.penalties)}</span>
              <span className="text-sm"><i className="mr-1 not-italic text-slate-500 lg:hidden">Удержания WB:</i>{rubles(sheet.deductions)}</span>
              <span className="text-sm"><i className="mr-1 not-italic text-slate-500 lg:hidden">Выплачено:</i>{rubles(sheet.paid)}</span>
              <span className="font-semibold"><i className="mr-1 text-sm font-normal not-italic text-slate-500 lg:hidden">К выплате:</i>{rubles(sheet.balance)}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn px-3 text-sm" onClick={() => setForm({ kind: 'BONUS', employeeId: sheet.employeeId })}><Award size={15}/>Премия</button>
              <button className="btn px-3 text-sm" onClick={() => setForm({ kind: 'PENALTY', employeeId: sheet.employeeId })}><Ban size={15}/>Штраф</button>
              <button className="btn px-3 text-sm" onClick={() => setForm({ kind: 'ADVANCE', employeeId: sheet.employeeId })}><Wallet size={15}/>Аванс</button>
              <button className="btn btn-primary px-3 text-sm" onClick={() => setForm({ kind: 'PAYMENT', employeeId: sheet.employeeId })}><Wallet size={15}/>Выплатить</button>
            </div>
          </div>
        })}
      {Boolean(sheets.length) && <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 px-4 py-3 text-sm sm:px-5">
        <span className="text-slate-500">Итого начислено {rubles(totals.accrued)}</span>
        <b>К выплате {rubles(totals.balance)}</b>
      </div>}
    </div>

    <ErrorNote error={close.error ?? rules.error ?? shifts.error}/>
    {form && <SalaryEntryForm kind={form.kind} employeeId={form.employeeId} employeeName={staff.find(e => e.id === form.employeeId)?.fullName ?? ''} onClose={() => setForm(undefined)}/>}
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

  return <Modal title={`${formTitles[kind]} · ${employeeName}`} onClose={onClose}>
    <form className="grid gap-4" onSubmit={event => { event.preventDefault(); save.mutate() }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Сумма, ₽"><input autoFocus className="field" required inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)}/></Field>
        <Field label="Дата"><input type="date" className="field" required value={date} onChange={e => setDate(e.target.value)}/></Field>
      </div>
      <Field label={kind === 'PENALTY' ? 'Причина' : 'Комментарий'}>
        <input className="field" required={kind === 'PENALTY'} value={comment} onChange={e => setComment(e.target.value)} placeholder={kind === 'PENALTY' ? 'Например, опоздание' : 'Необязательно'}/>
      </Field>
      {kind === 'PENALTY' && <p className="text-xs text-slate-500">Штраф сразу уменьшает сумму к выплате. Статус можно изменить позже.</p>}
      <ErrorNote error={save.error}/>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary flex-1 sm:flex-none" disabled={save.isPending || !isValidMoney(amount)}>{save.isPending ? 'Сохраняем…' : 'Сохранить'}</button>
        <button type="button" className="btn flex-1 sm:flex-none" onClick={onClose}>Отмена</button>
      </div>
    </form>
  </Modal>
}
