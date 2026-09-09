import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, ChevronDown, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import type { EntryKind, PaymentType, PickupPoint } from '../entities/types'
import { isValidMoney, parseMoney, rubles } from '../shared/money'
import { Badge, EmptyState, ErrorNote, Field, Loading, Modal, Title, confirmAction } from '../shared/ui'
import { createPickupPoint, listPickupPoints, setPickupPointArchived, updatePickupPoint } from '../services/points'
import { deleteEntryPreset, deletePointSalaryDefault, listEntryPresets, listPointSalaryDefaults, rememberAmount, rememberRate } from '../services/presets'

const paymentTitles:Record<PaymentType, string> = { SHIFT: 'За смену', HOURLY: 'Почасовая', SALARY: 'Оклад' }

export function PointsPage() {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<PickupPoint | null>(null)
  const [creating, setCreating] = useState(false)
  const [expanded, setExpanded] = useState<string>()
  const points = useQuery({ queryKey: ['points', 'all'], queryFn: () => listPickupPoints(true) })

  const archive = useMutation({
    mutationFn: ({ id, archived }:{ id:string; archived:boolean }) => setPickupPointArchived(id, archived),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['points'] }) },
  })

  return <>
    <Title title="Пункты выдачи" subtitle="Точки, их пресеты сумм и ставки по умолчанию">
      <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16}/>Добавить ПВЗ</button>
    </Title>

    {points.isLoading ? <div className="card"><Loading/></div>
      : !points.data?.length ? <div className="card"><EmptyState text="Пунктов выдачи пока нет." action={<button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16}/>Добавить первый ПВЗ</button>}/></div>
        : <div className="space-y-4">{points.data.map(point => <section key={point.id} className="card overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><b>{point.name}</b>{point.archivedAt && <Badge>В архиве</Badge>}</div>
              <p className="mt-1 text-sm text-slate-500">{point.address}</p>
              <p className="mt-1 text-xs text-slate-400">{point.timezone}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn px-3 text-sm" onClick={() => setEditing(point)}><Pencil size={15}/>Изменить</button>
              <button className="btn px-3 text-sm" onClick={() => archive.mutate({ id: point.id, archived: !point.archivedAt })}>
                {point.archivedAt ? <><RotateCcw size={15}/>Вернуть</> : <><Archive size={15}/>В архив</>}
              </button>
            </div>
          </div>
          <button className="flex w-full items-center gap-2 border-t px-4 py-3 text-sm font-medium text-brand-600 sm:px-5" onClick={() => setExpanded(expanded === point.id ? undefined : point.id)}>
            Запомненные суммы и ставки <ChevronDown size={16} className={expanded === point.id ? 'rotate-180 transition' : 'transition'}/>
          </button>
          {expanded === point.id && <div className="border-t bg-slate-50 p-4 sm:p-5"><PresetPanel pointId={point.id}/></div>}
        </section>)}</div>}

    <ErrorNote error={archive.error}/>
    {(creating || editing) && <PointForm point={editing} onClose={() => { setCreating(false); setEditing(null) }}/>}
  </>
}

function PointForm({ point, onClose }:{ point:PickupPoint | null; onClose:() => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(point?.name ?? '')
  const [address, setAddress] = useState(point?.address ?? '')
  const [timezone, setTimezone] = useState(point?.timezone ?? 'Europe/Moscow')

  const save = useMutation({
    mutationFn: () => point ? updatePickupPoint(point.id, { name, address, timezone }) : createPickupPoint({ name, address, timezone }).then(() => undefined),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['points'] }); onClose() },
  })

  return <Modal title={point ? 'Изменить ПВЗ' : 'Новый ПВЗ'} onClose={onClose}>
    <form className="grid gap-4" onSubmit={event => { event.preventDefault(); save.mutate() }}>
      <Field label="Название"><input className="field" required value={name} onChange={e => setName(e.target.value)} placeholder="Короткое название точки"/></Field>
      <Field label="Адрес"><input className="field" required value={address} onChange={e => setAddress(e.target.value)}/></Field>
      <Field label="Часовой пояс"><input className="field" required value={timezone} onChange={e => setTimezone(e.target.value)}/></Field>
      <ErrorNote error={save.error}/>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary flex-1 sm:flex-none" disabled={save.isPending}>{save.isPending ? 'Сохраняем…' : 'Сохранить'}</button>
        <button type="button" className="btn flex-1 sm:flex-none" onClick={onClose}>Отмена</button>
      </div>
    </form>
  </Modal>
}

function PresetPanel({ pointId }:{ pointId:string }) {
  const queryClient = useQueryClient()
  const presets = useQuery({ queryKey: ['presets', pointId], queryFn: () => listEntryPresets(pointId) })
  const rates = useQuery({ queryKey: ['point-rates', pointId], queryFn: () => listPointSalaryDefaults(pointId) })
  const invalidate = () => { void queryClient.invalidateQueries({ queryKey: ['presets'] }); void queryClient.invalidateQueries({ queryKey: ['point-rates'] }) }

  const [kind, setKind] = useState<EntryKind>('EXPENSE')
  const [category, setCategory] = useState('')
  const [amount, setAmount] = useState('')
  const [paymentType, setPaymentType] = useState<PaymentType>('SHIFT')
  const [rate, setRate] = useState('')
  const [normDays, setNormDays] = useState('22')

  const saveAmount = useMutation({
    mutationFn: () => rememberAmount({ pickupPointId: pointId, kind, category, amountKopecks: parseMoney(amount) }),
    onSuccess: () => { setCategory(''); setAmount(''); invalidate() },
  })
  const removeAmount = useMutation({ mutationFn: deleteEntryPreset, onSuccess: invalidate })
  const saveRate = useMutation({
    mutationFn: () => rememberRate({ pickupPointId: pointId, paymentType, rateKopecks: parseMoney(rate), monthlyNormDays: Number(normDays) || 22 }),
    onSuccess: () => { setRate(''); invalidate() },
  })
  const removeRate = useMutation({ mutationFn: deletePointSalaryDefault, onSuccess: invalidate })

  return <div className="grid gap-5 lg:grid-cols-2">
    <div>
      <h3 className="text-sm font-semibold">Суммы доходов и расходов</h3>
      <p className="mt-1 text-xs text-slate-500">Подставляются в форму «Финансы», когда выбрана эта категория.</p>
      <div className="mt-3 divide-y rounded-xl bg-white">
        {presets.isLoading ? <Loading/> : !presets.data?.length ? <EmptyState text="Пока ничего не запомнено."/>
          : presets.data.map(preset => <div key={preset.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
            <div className="min-w-0"><b className="text-sm">{preset.categoryName}</b><p className="text-xs text-slate-500">{preset.kind === 'INCOME' ? 'Доход' : 'Расход'}</p></div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-sm font-semibold">{rubles(preset.amountKopecks)}</span>
              <button aria-label="Удалить" className="p-1 text-slate-400" onClick={() => confirmAction(`Удалить пресет «${preset.categoryName}»?`) && removeAmount.mutate(preset.id)}><Trash2 size={16}/></button>
            </div>
          </div>)}
      </div>
      <form className="mt-3 grid gap-2 sm:grid-cols-[auto_1fr_auto_auto]" onSubmit={e => { e.preventDefault(); saveAmount.mutate() }}>
        <select className="field sm:w-28" value={kind} onChange={e => setKind(e.target.value as EntryKind)}><option value="EXPENSE">Расход</option><option value="INCOME">Доход</option></select>
        <input className="field" required placeholder="Категория" value={category} onChange={e => setCategory(e.target.value)}/>
        <input className="field sm:w-32" required inputMode="decimal" placeholder="Сумма, ₽" value={amount} onChange={e => setAmount(e.target.value)}/>
        <button className="btn btn-primary" disabled={!category.trim() || !isValidMoney(amount) || saveAmount.isPending}>Запомнить</button>
      </form>
      <ErrorNote error={saveAmount.error ?? removeAmount.error}/>
    </div>

    <div>
      <h3 className="text-sm font-semibold">Ставки по умолчанию</h3>
      <p className="mt-1 text-xs text-slate-500">Подставляются при добавлении сотрудника на этот ПВЗ.</p>
      <div className="mt-3 divide-y rounded-xl bg-white">
        {rates.isLoading ? <Loading/> : !rates.data?.length ? <EmptyState text="Ставок по умолчанию нет."/>
          : rates.data.map(item => <div key={item.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
            <div className="min-w-0"><b className="text-sm">{paymentTitles[item.paymentType]}</b>{item.paymentType === 'SALARY' && <p className="text-xs text-slate-500">Норма {item.monthlyNormDays} дн.</p>}</div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-sm font-semibold">{rubles(item.rateKopecks)}{item.paymentType === 'HOURLY' ? ' / час' : ''}</span>
              <button aria-label="Удалить" className="p-1 text-slate-400" onClick={() => confirmAction('Удалить ставку по умолчанию?') && removeRate.mutate(item.id)}><Trash2 size={16}/></button>
            </div>
          </div>)}
      </div>
      <form className="mt-3 grid gap-2 sm:grid-cols-[auto_1fr_auto_auto]" onSubmit={e => { e.preventDefault(); saveRate.mutate() }}>
        <select className="field sm:w-36" value={paymentType} onChange={e => setPaymentType(e.target.value as PaymentType)}>{Object.entries(paymentTitles).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        <input className="field" required inputMode="decimal" placeholder="Ставка, ₽" value={rate} onChange={e => setRate(e.target.value)}/>
        {paymentType === 'SALARY'
          ? <input className="field sm:w-28" inputMode="numeric" placeholder="Норма дней" value={normDays} onChange={e => setNormDays(e.target.value)}/>
          : <span className="hidden sm:block"/>}
        <button className="btn btn-primary" disabled={!isValidMoney(rate) || saveRate.isPending}>Запомнить</button>
      </form>
      <ErrorNote error={saveRate.error ?? removeRate.error}/>
    </div>
  </div>
}
