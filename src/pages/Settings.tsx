import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, Pencil, RotateCcw } from 'lucide-react'
import type { ModuleKey } from '../entities/types'
import { ErrorNote, Field, Loading, Title } from '../shared/ui'
import { listEnabledModules, moduleTitles, getTaxSettings, saveTaxSettings, setModuleEnabled } from '../services/settings'
import { getOrganization, renameOrganization } from '../services/org'
import { listExpenseCategories, renameExpenseCategory, setExpenseCategoryArchived } from '../services/finance'

const modules = Object.keys(moduleTitles) as ModuleKey[]

export function SettingsPage() {
  return <>
    <Title title="Настройки" subtitle="Организация, налог, модули и категории расходов"/>
    <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
      <div className="grid gap-4 sm:gap-5"><OrganizationCard/><TaxCard/></div>
      <div className="grid gap-4 sm:gap-5"><ModulesCard/><CategoriesCard/></div>
    </div>
  </>
}

function OrganizationCard() {
  const queryClient = useQueryClient()
  const organization = useQuery({ queryKey: ['organization'], queryFn: getOrganization })
  const [name, setName] = useState('')
  useEffect(() => { if (organization.data) setName(organization.data.name) }, [organization.data])
  const save = useMutation({ mutationFn: () => renameOrganization(name), onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['organization'] }) } })

  return <section className="card p-4 sm:p-5">
    <h2 className="font-semibold">Организация</h2>
    <form className="mt-4 grid gap-3" onSubmit={event => { event.preventDefault(); save.mutate() }}>
      <Field label="Название"><input className="field" required value={name} onChange={e => setName(e.target.value)}/></Field>
      <button className="btn btn-primary w-full sm:w-auto sm:justify-self-start" disabled={save.isPending || !name.trim()}>{save.isPending ? 'Сохраняем…' : 'Сохранить'}</button>
    </form>
    <ErrorNote error={organization.error ?? save.error}/>
  </section>
}

function TaxCard() {
  const queryClient = useQueryClient()
  const tax = useQuery({ queryKey: ['tax'], queryFn: getTaxSettings })
  const [rate, setRate] = useState('0')
  const [enabled, setEnabled] = useState(false)
  useEffect(() => { if (tax.data) { setRate(String(tax.data.rate)); setEnabled(tax.data.enabled) } }, [tax.data])
  const save = useMutation({
    mutationFn: () => saveTaxSettings({ rate: Number(rate) || 0, enabled }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['tax'] }) },
  })

  return <section className="card p-4 sm:p-5">
    <h2 className="font-semibold">Налог</h2>
    <p className="mt-1 text-sm text-slate-500">Считается от дохода за месяц и вычитается из чистой прибыли.</p>
    <form className="mt-4 grid gap-3" onSubmit={event => { event.preventDefault(); save.mutate() }}>
      <div className="flex items-start gap-2">
        <input id="tax-enabled" type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-green-600" checked={enabled} onChange={e => setEnabled(e.target.checked)}/>
        <label htmlFor="tax-enabled" className="text-sm text-slate-600">Учитывать налог в расчётах</label>
      </div>
      <Field label="Ставка, %"><input className="field" inputMode="decimal" value={rate} onChange={e => setRate(e.target.value)}/></Field>
      <button className="btn btn-primary w-full sm:w-auto sm:justify-self-start" disabled={save.isPending}>{save.isPending ? 'Сохраняем…' : 'Сохранить'}</button>
    </form>
    <ErrorNote error={tax.error ?? save.error}/>
  </section>
}

function ModulesCard() {
  const queryClient = useQueryClient()
  const enabled = useQuery({ queryKey: ['modules'], queryFn: listEnabledModules })
  const toggle = useMutation({
    mutationFn: ({ module, next }:{ module:ModuleKey; next:boolean }) => setModuleEnabled(module, next),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['modules'] }) },
  })
  const active = new Set(enabled.data ?? [])

  return <section className="card overflow-hidden">
    <div className="p-4 sm:p-5"><h2 className="font-semibold">Модули</h2><p className="mt-1 text-sm text-slate-500">Выключенный модуль скрывается из меню.</p></div>
    {enabled.isLoading ? <Loading/> : <div className="divide-y border-t">{modules.map(module => <label key={module} className="flex items-center justify-between gap-4 px-4 py-3 sm:px-5">
      <span className="min-w-0 text-sm">{moduleTitles[module]}</span>
      <input type="checkbox" className="h-5 w-5 shrink-0 accent-green-600" checked={active.has(module)} onChange={event => toggle.mutate({ module, next: event.target.checked })}/>
    </label>)}</div>}
    <ErrorNote error={enabled.error ?? toggle.error}/>
  </section>
}

function CategoriesCard() {
  const queryClient = useQueryClient()
  const categories = useQuery({ queryKey: ['expense-categories', 'all'], queryFn: () => listExpenseCategories(true) })
  const [editing, setEditing] = useState<string>()
  const [name, setName] = useState('')
  const invalidate = () => { void queryClient.invalidateQueries({ queryKey: ['expense-categories'] }); void queryClient.invalidateQueries({ queryKey: ['transactions'] }) }
  const rename = useMutation({ mutationFn: ({ id, value }:{ id:string; value:string }) => renameExpenseCategory(id, value), onSuccess: () => { setEditing(undefined); invalidate() } })
  const archive = useMutation({ mutationFn: ({ id, archived }:{ id:string; archived:boolean }) => setExpenseCategoryArchived(id, archived), onSuccess: invalidate })

  return <section className="card overflow-hidden">
    <div className="p-4 sm:p-5"><h2 className="font-semibold">Категории расходов</h2><p className="mt-1 text-sm text-slate-500">Создаются автоматически при добавлении расхода.</p></div>
    {categories.isLoading ? <Loading/> : !categories.data?.length ? <p className="px-4 pb-5 text-sm text-slate-500 sm:px-5">Категорий пока нет.</p>
      : <div className="divide-y border-t">{categories.data.map(category => <div key={category.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
        {editing === category.id
          ? <form className="flex flex-1 gap-2" onSubmit={event => { event.preventDefault(); rename.mutate({ id: category.id, value: name }) }}>
            <input autoFocus className="field" value={name} onChange={e => setName(e.target.value)}/>
            <button className="btn btn-primary px-3 text-sm">ОК</button>
          </form>
          : <>
            <span className={`min-w-0 truncate text-sm ${category.archivedAt ? 'text-slate-400 line-through' : ''}`}>{category.name}</span>
            <span className="flex shrink-0 gap-1">
              <button aria-label="Переименовать" className="p-1 text-slate-400" onClick={() => { setEditing(category.id); setName(category.name) }}><Pencil size={15}/></button>
              <button aria-label={category.archivedAt ? 'Вернуть' : 'В архив'} className="p-1 text-slate-400" onClick={() => archive.mutate({ id: category.id, archived: !category.archivedAt })}>
                {category.archivedAt ? <RotateCcw size={15}/> : <Archive size={15}/>}
              </button>
            </span>
          </>}
      </div>)}</div>}
    <ErrorNote error={categories.error ?? rename.error ?? archive.error}/>
  </section>
}
