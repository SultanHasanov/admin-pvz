import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bookmark, Pencil, Plus, Trash2 } from 'lucide-react'
import type { EntryKind, Transaction } from '../entities/types'
import { dateLabel, monthLabel, today } from '../shared/dates'
import { isValidMoney, moneyInput, parseMoney, rubles } from '../shared/money'
import { EmptyState, ErrorNote, Field, Loading, Modal, Title, confirmAction } from '../shared/ui'
import { createTransaction, deleteTransaction, listExpenseCategories, listTransactions, updateTransaction, type TransactionInput } from '../services/finance'
import { listEntryPresets, rememberAmount } from '../services/presets'
import { useOrg } from '../app/OrgContext'

export function FinancePage() {
  const queryClient = useQueryClient()
  const { month, pointId, pointName, points } = useOrg()
  const [form, setForm] = useState<{ kind:EntryKind; entry?:Transaction }>()
  const transactions = useQuery({ queryKey: ['transactions', month, pointId], queryFn: () => listTransactions(month, pointId || undefined) })

  const remove = useMutation({
    mutationFn: ({ kind, id }:{ kind:EntryKind; id:string }) => deleteTransaction(kind, id),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['transactions'] }) },
  })

  const income = (transactions.data ?? []).filter(x => x.kind === 'INCOME')
  const expenses = (transactions.data ?? []).filter(x => x.kind === 'EXPENSE')
  const sum = (rows:Transaction[]) => rows.reduce((total, row) => total + row.amountKopecks, 0)

  return <>
    <Title title="Финансы" subtitle={`${monthLabel(month)} · ${pointId ? pointName(pointId) : 'Все ПВЗ'}`}>
      <div className="flex flex-wrap gap-2">
        <button className="btn px-3 text-sm" onClick={() => setForm({ kind: 'INCOME' })} disabled={!points.length}><Plus size={15}/>Доход</button>
        <button className="btn btn-primary" onClick={() => setForm({ kind: 'EXPENSE' })} disabled={!points.length}><Plus size={16}/>Расход</button>
      </div>
    </Title>

    {!points.length && <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Сначала добавьте ПВЗ — записи привязываются к точке.</div>}

    <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
      <EntryList title="Доходы" total={sum(income)} rows={income} loading={transactions.isLoading} pointName={pointName} onEdit={entry => setForm({ kind: entry.kind, entry })} onDelete={entry => confirmAction('Удалить запись?') && remove.mutate({ kind: entry.kind, id: entry.id })}/>
      <EntryList title="Расходы" total={sum(expenses)} rows={expenses} loading={transactions.isLoading} pointName={pointName} onEdit={entry => setForm({ kind: entry.kind, entry })} onDelete={entry => confirmAction('Удалить запись?') && remove.mutate({ kind: entry.kind, id: entry.id })}/>
    </div>

    <ErrorNote error={transactions.error ?? remove.error}/>
    {form && <EntryForm kind={form.kind} entry={form.entry} onClose={() => setForm(undefined)}/>}
  </>
}

function EntryList({ title, total, rows, loading, pointName, onEdit, onDelete }:{
  title:string; total:number; rows:Transaction[]; loading:boolean
  pointName:(id:string | null) => string; onEdit:(entry:Transaction) => void; onDelete:(entry:Transaction) => void
}) {
  return <section className="card min-w-0 p-4 sm:p-5">
    <div className="flex items-center justify-between gap-3">
      <h2 className="font-semibold">{title}</h2>
      <span className="text-sm font-semibold">{rubles(total)}</span>
    </div>
    <div className="mt-2 divide-y">
      {loading ? <Loading/> : !rows.length ? <EmptyState text="Записей за этот месяц нет."/>
        : rows.map(entry => <div key={entry.id} className="flex items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <b className="text-sm">{entry.category}</b>
            <p className="truncate text-xs text-slate-500">{dateLabel(entry.date)} · {pointName(entry.pickupPointId)}{entry.description ? ` · ${entry.description}` : ''}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <span className={`whitespace-nowrap text-sm font-semibold ${entry.kind === 'INCOME' ? 'text-brand-600' : ''}`}>{rubles(entry.amountKopecks)}</span>
            <button aria-label="Изменить" className="p-1 text-slate-400" onClick={() => onEdit(entry)}><Pencil size={15}/></button>
            <button aria-label="Удалить" className="p-1 text-slate-400" onClick={() => onDelete(entry)}><Trash2 size={15}/></button>
          </div>
        </div>)}
    </div>
  </section>
}

function EntryForm({ kind, entry, onClose }:{ kind:EntryKind; entry?:Transaction; onClose:() => void }) {
  const queryClient = useQueryClient()
  const { points, defaultPointId } = useOrg()
  const [pickupPointId, setPoint] = useState(entry?.pickupPointId ?? defaultPointId ?? points[0]?.id ?? '')
  const [category, setCategory] = useState(entry?.category ?? '')
  const [amount, setAmount] = useState(entry ? moneyInput(entry.amountKopecks) : '')
  const [date, setDate] = useState(entry?.date ?? today())
  const [description, setDescription] = useState(entry?.description ?? '')
  const [remember, setRemember] = useState(!entry)

  const presets = useQuery({ queryKey: ['presets', pickupPointId], queryFn: () => listEntryPresets(pickupPointId), enabled: Boolean(pickupPointId) })
  const categories = useQuery({ queryKey: ['expense-categories'], queryFn: () => listExpenseCategories(), enabled: kind === 'EXPENSE' })

  const matched = useMemo(() => presets.data?.find(preset => preset.kind === kind && preset.categoryName === category.trim()), [presets.data, kind, category])
  // Запомненная сумма подставляется при выборе категории, но не затирает то, что владелец уже ввёл руками.
  const [touched, setTouched] = useState(Boolean(entry))
  useEffect(() => { if (!touched && matched) setAmount(moneyInput(matched.amountKopecks)) }, [matched, touched])

  const known = useMemo(() => {
    const names = new Set<string>()
    presets.data?.filter(p => p.kind === kind).forEach(p => names.add(p.categoryName))
    if (kind === 'EXPENSE') categories.data?.forEach(c => names.add(c.name))
    return [...names].sort((a, b) => a.localeCompare(b))
  }, [presets.data, categories.data, kind])

  const save = useMutation({
    mutationFn: async () => {
      const input:TransactionInput = { kind, pickupPointId, category, amountKopecks: parseMoney(amount), date, description }
      if (entry) await updateTransaction(entry.id, input)
      else await createTransaction(input)
      if (remember && pickupPointId) await rememberAmount({ pickupPointId, kind, category, amountKopecks: parseMoney(amount) })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['transactions'] })
      void queryClient.invalidateQueries({ queryKey: ['presets'] })
      void queryClient.invalidateQueries({ queryKey: ['expense-categories'] })
      onClose()
    },
  })

  const changedFromPreset = matched && parseMoney(amount) !== matched.amountKopecks

  return <Modal title={`${entry ? 'Изменить' : 'Новый'} ${kind === 'INCOME' ? 'доход' : 'расход'}`} onClose={onClose}>
    <form className="grid gap-4" onSubmit={event => { event.preventDefault(); save.mutate() }}>
      <Field label="ПВЗ"><select className="field" required value={pickupPointId} onChange={e => setPoint(e.target.value)}>
        <option value="">Выберите ПВЗ</option>
        {points.map(point => <option key={point.id} value={point.id}>{point.name}</option>)}
      </select></Field>

      <Field label="Категория" hint={matched ? `Запомнено для этого ПВЗ: ${rubles(matched.amountKopecks)}` : undefined}>
        <input className="field" required list="known-categories" value={category} onChange={e => { setCategory(e.target.value); setTouched(false) }} placeholder={kind === 'INCOME' ? 'Например, Wildberries' : 'Например, Аренда'}/>
        <datalist id="known-categories">{known.map(name => <option key={name} value={name}/>)}</datalist>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Сумма, ₽"><input className="field" required inputMode="decimal" value={amount} onChange={e => { setAmount(e.target.value); setTouched(true) }}/></Field>
        <Field label="Дата"><input type="date" className="field" required value={date} onChange={e => setDate(e.target.value)}/></Field>
      </div>

      <Field label="Комментарий"><input className="field" value={description ?? ''} onChange={e => setDescription(e.target.value)} placeholder="Необязательно"/></Field>

      <div className="flex items-start gap-2">
        <input id="remember-amount" type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-green-600" checked={remember} onChange={e => setRemember(e.target.checked)}/>
        <label htmlFor="remember-amount" className="text-sm text-slate-600">
          {matched && changedFromPreset ? 'Запомнить новую сумму для этой категории и ПВЗ' : 'Запомнить сумму для этой категории и ПВЗ'}
          <span className="block text-xs text-slate-400">В следующий раз она подставится автоматически.</span>
        </label>
      </div>

      <ErrorNote error={save.error}/>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary flex-1 sm:flex-none" disabled={save.isPending || !isValidMoney(amount) || !category.trim() || !pickupPointId}>
          {remember && <Bookmark size={15}/>}{save.isPending ? 'Сохраняем…' : `Сохранить ${isValidMoney(amount) ? rubles(parseMoney(amount)) : ''}`}
        </button>
        <button type="button" className="btn flex-1 sm:flex-none" onClick={onClose}>Отмена</button>
      </div>
    </form>
  </Modal>
}
