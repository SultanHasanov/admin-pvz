import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarPlus, CheckCircle2, PlayCircle, Plus, Repeat, Trash2, UserCog, UserX } from 'lucide-react'
import type { Shift, ShiftStatus } from '../entities/types'
import { dateLabel, monthLabel, timeLabel, today, weekdayLabel } from '../shared/dates'
import { Badge, EmptyState, ErrorNote, Field, Loading, Modal, Title, confirmAction } from '../shared/ui'
import { createShift, createShiftSeries, deleteShift, listShifts, replaceShift, setShiftStatus } from '../services/shifts'
import { listEmployees } from '../services/employees'
import { useOrg } from '../app/OrgContext'

const statusTitles:Record<ShiftStatus, string> = { PLANNED: 'Запланирована', ON_DUTY: 'На смене', COMPLETED: 'Завершена', REPLACED: 'Замена', NO_SHOW: 'Не вышел' }
const statusTone:Record<ShiftStatus, 'slate' | 'green' | 'amber' | 'red'> = { PLANNED: 'slate', ON_DUTY: 'amber', COMPLETED: 'green', REPLACED: 'slate', NO_SHOW: 'red' }
const weekdays = [['1', 'Пн'], ['2', 'Вт'], ['3', 'Ср'], ['4', 'Чт'], ['5', 'Пт'], ['6', 'Сб'], ['0', 'Вс']] as const

export function ShiftsPage() {
  const queryClient = useQueryClient()
  const { month, pointId, pointName, points, defaultPointId } = useOrg()
  const [form, setForm] = useState<'single' | 'series'>()
  const [replacing, setReplacing] = useState<Shift | null>(null)

  const shifts = useQuery({ queryKey: ['shifts', month, pointId], queryFn: () => listShifts(month, pointId || undefined) })
  const employees = useQuery({ queryKey: ['employees', false], queryFn: () => listEmployees() })
  const nameOf = (id:string) => employees.data?.find(e => e.id === id)?.fullName ?? 'Сотрудник'
  const invalidate = () => { void queryClient.invalidateQueries({ queryKey: ['shifts'] }) }

  const status = useMutation({ mutationFn: ({ id, next }:{ id:string; next:ShiftStatus }) => setShiftStatus(id, next), onSuccess: invalidate })
  const remove = useMutation({ mutationFn: deleteShift, onSuccess: invalidate })

  return <>
    <Title title="Смены" subtitle={`${monthLabel(month)} · ${pointId ? pointName(pointId) : 'Все ПВЗ'}`}>
      <div className="flex flex-wrap gap-2">
        <button className="btn px-3 text-sm" onClick={() => setForm('series')} disabled={!points.length}><Repeat size={15}/>Серия смен</button>
        <button className="btn btn-primary" onClick={() => setForm('single')} disabled={!points.length}><Plus size={16}/>Создать смену</button>
      </div>
    </Title>

    {!employees.data?.length && !employees.isLoading && <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Сначала добавьте сотрудников — без них смену назначить не на кого.</div>}

    <div className="card overflow-hidden">
      {shifts.isLoading ? <Loading/> : !shifts.data?.length
        ? <EmptyState text={`За ${monthLabel(month).toLowerCase()} смен нет.`} action={points.length ? <button className="btn btn-primary" onClick={() => setForm('single')}><CalendarPlus size={16}/>Создать смену</button> : undefined}/>
        : <div className="divide-y">{shifts.data.map(shift => <div key={shift.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 sm:gap-x-6 sm:p-5">
          <b className="w-full sm:w-auto sm:min-w-36">{dateLabel(shift.startsAt)} <span className="font-normal text-slate-400">{weekdayLabel(shift.startsAt)}</span></b>
          <span className="min-w-0">{nameOf(shift.employeeId)}</span>
          <span className="text-sm text-slate-500">{timeLabel(shift.startsAt)}–{timeLabel(shift.endsAt)}</span>
          {!pointId && <span className="text-sm text-slate-500">{pointName(shift.pickupPointId)}</span>}
          <Badge tone={statusTone[shift.status]}>{statusTitles[shift.status]}</Badge>
          <span className="ml-auto flex flex-wrap gap-1">
            {shift.status === 'PLANNED' && <button className="btn px-2 py-1 text-sm" title="Начать смену" onClick={() => status.mutate({ id: shift.id, next: 'ON_DUTY' })}><PlayCircle size={15}/></button>}
            {(shift.status === 'ON_DUTY' || shift.status === 'PLANNED' || shift.status === 'REPLACED') && <button className="btn px-2 py-1 text-sm" title="Завершить" onClick={() => status.mutate({ id: shift.id, next: 'COMPLETED' })}><CheckCircle2 size={15}/></button>}
            {shift.status !== 'COMPLETED' && <button className="btn px-2 py-1 text-sm" title="Не вышел" onClick={() => status.mutate({ id: shift.id, next: 'NO_SHOW' })}><UserX size={15}/></button>}
            <button className="btn px-2 py-1 text-sm" title="Заменить сотрудника" onClick={() => setReplacing(shift)}><UserCog size={15}/></button>
            <button className="btn px-2 py-1 text-sm" title="Удалить" onClick={() => confirmAction('Удалить смену?') && remove.mutate(shift.id)}><Trash2 size={15}/></button>
          </span>
        </div>)}</div>}
    </div>

    <ErrorNote error={shifts.error ?? status.error ?? remove.error}/>
    {form && <ShiftForm mode={form} defaultPointId={defaultPointId || points[0]?.id} onClose={() => setForm(undefined)}/>}
    {replacing && <ReplaceForm shift={replacing} onClose={() => setReplacing(null)}/>}
  </>
}

function ShiftForm({ mode, defaultPointId, onClose }:{ mode:'single' | 'series'; defaultPointId:string; onClose:() => void }) {
  const queryClient = useQueryClient()
  const { points } = useOrg()
  const employees = useQuery({ queryKey: ['employees', false], queryFn: () => listEmployees() })
  const [pickupPointId, setPoint] = useState(defaultPointId)
  const [employeeId, setEmployee] = useState('')
  const [date, setDate] = useState(today())
  const [to, setTo] = useState(today())
  const [startsAt, setStart] = useState('09:00')
  const [endsAt, setEnd] = useState('21:00')
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5])

  const available = (employees.data ?? []).filter(e => !pickupPointId || e.pickupPointIds.includes(pickupPointId))
  const save = useMutation({
    mutationFn: async () => {
      if (!employeeId) throw new Error('Выберите сотрудника')
      if (mode === 'single') { await createShift({ employeeId, pickupPointId, date, startsAt, endsAt }); return 1 }
      return createShiftSeries({ employeeId, pickupPointId, from: date, to, startsAt, endsAt, weekdays: days })
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['shifts'] }); onClose() },
  })

  return <Modal title={mode === 'single' ? 'Новая смена' : 'Серия смен'} onClose={onClose}>
    <form className="grid gap-4" onSubmit={event => { event.preventDefault(); save.mutate() }}>
      <Field label="ПВЗ"><select className="field" value={pickupPointId} onChange={e => { setPoint(e.target.value); setEmployee('') }}>{points.map(point => <option key={point.id} value={point.id}>{point.name}</option>)}</select></Field>
      <Field label="Сотрудник" hint={available.length ? undefined : 'На этом ПВЗ нет сотрудников — привяжите их в разделе «Сотрудники».'}>
        <select className="field" required value={employeeId} onChange={e => setEmployee(e.target.value)}>
          <option value="">Выберите сотрудника</option>
          {available.map(employee => <option key={employee.id} value={employee.id}>{employee.fullName}</option>)}
        </select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={mode === 'single' ? 'Дата' : 'Начало периода'}><input type="date" className="field" required value={date} onChange={e => setDate(e.target.value)}/></Field>
        {mode === 'series' && <Field label="Конец периода"><input type="date" className="field" required value={to} onChange={e => setTo(e.target.value)}/></Field>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Начало"><input type="time" className="field" required value={startsAt} onChange={e => setStart(e.target.value)}/></Field>
        <Field label="Конец" hint="Если конец раньше начала, смена перейдёт на следующие сутки."><input type="time" className="field" required value={endsAt} onChange={e => setEnd(e.target.value)}/></Field>
      </div>
      {mode === 'series' && <div>
        <span className="label">Дни недели</span>
        <div className="flex flex-wrap gap-2">{weekdays.map(([value, label]) => {
          const day = Number(value), active = days.includes(day)
          return <button type="button" key={value} className={`btn px-3 text-sm ${active ? 'btn-primary' : ''}`} onClick={() => setDays(list => active ? list.filter(x => x !== day) : [...list, day])}>{label}</button>
        })}</div>
      </div>}
      <ErrorNote error={save.error}/>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary flex-1 sm:flex-none" disabled={save.isPending}>{save.isPending ? 'Создаём…' : 'Создать'}</button>
        <button type="button" className="btn flex-1 sm:flex-none" onClick={onClose}>Отмена</button>
      </div>
    </form>
  </Modal>
}

function ReplaceForm({ shift, onClose }:{ shift:Shift; onClose:() => void }) {
  const queryClient = useQueryClient()
  const employees = useQuery({ queryKey: ['employees', false], queryFn: () => listEmployees() })
  const [employeeId, setEmployee] = useState('')
  const [reason, setReason] = useState('')
  const save = useMutation({
    mutationFn: () => replaceShift(shift.id, employeeId, reason),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['shifts'] }); onClose() },
  })
  const candidates = (employees.data ?? []).filter(e => e.id !== shift.employeeId)

  return <Modal title="Замена сотрудника" onClose={onClose}>
    <form className="grid gap-4" onSubmit={event => { event.preventDefault(); save.mutate() }}>
      <p className="text-sm text-slate-500">Смена {dateLabel(shift.startsAt)}, {timeLabel(shift.startsAt)}–{timeLabel(shift.endsAt)}.</p>
      <Field label="Кто выходит вместо"><select className="field" required value={employeeId} onChange={e => setEmployee(e.target.value)}>
        <option value="">Выберите сотрудника</option>
        {candidates.map(employee => <option key={employee.id} value={employee.id}>{employee.fullName}</option>)}
      </select></Field>
      <Field label="Причина"><input className="field" required value={reason} onChange={e => setReason(e.target.value)} placeholder="Например, больничный"/></Field>
      <ErrorNote error={save.error}/>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary flex-1 sm:flex-none" disabled={save.isPending || !employeeId}>Заменить</button>
        <button type="button" className="btn flex-1 sm:flex-none" onClick={onClose}>Отмена</button>
      </div>
    </form>
  </Modal>
}
