import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, Pencil, RefreshCw, RotateCcw, Unplug } from 'lucide-react'
import type { ModuleKey } from '../entities/types'
import { ErrorNote, Field, Loading, Title } from '../shared/ui'
import { listEnabledModules, moduleTitles, getTaxSettings, saveTaxSettings, setModuleEnabled } from '../services/settings'
import { getOrganization, renameOrganization } from '../services/org'
import { listExpenseCategories, renameExpenseCategory, setExpenseCategoryArchived } from '../services/finance'
import { disconnectWb, getWbStatus, syncWb } from '../services/wb'

const modules = Object.keys(moduleTitles) as ModuleKey[]

export function SettingsPage() {
  return <>
    <Title title="Настройки" subtitle="Организация, налог, модули и категории расходов"/>
    <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
      <div className="grid gap-4 sm:gap-5"><OrganizationCard/><WbIntegrationCard/><TaxCard/></div>
      <div className="grid gap-4 sm:gap-5"><ModulesCard/><CategoriesCard/></div>
    </div>
  </>
}

function WbIntegrationCard() {
  const queryClient = useQueryClient()
  const status = useQuery({ queryKey:['wb-integration'], queryFn:getWbStatus })
  const [result, setResult] = useState('')
  const refresh = () => { void queryClient.invalidateQueries({ queryKey:['wb-integration'] }) }
  const reloadImported = () => {
    for (const key of ['points','employees','deductions','salary']) void queryClient.invalidateQueries({ queryKey:[key] })
  }
  const sync = useMutation({
    mutationFn:syncWb,
    onSuccess:data => { setResult(`Загружено: ПВЗ — ${data.points}, сотрудников — ${data.employees}, удержаний — ${data.deductions}.`); refresh(); reloadImported() },
  })
  const disconnect = useMutation({ mutationFn:disconnectWb, onSuccess:() => { setResult(''); refresh() } })
  const connected = status.data?.status === 'CONNECTED'
  const error = status.error ?? sync.error ?? disconnect.error

  return <section className="card p-4 sm:p-5">
    <div className="flex items-start justify-between gap-3">
      <div><h2 className="font-semibold">Кабинет WB ПВЗ</h2><p className="mt-1 text-sm text-slate-500">Загружает ваши ПВЗ, сотрудников и удержания с привязкой к ответственному сотруднику.</p></div>
      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${connected ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
        {connected ? 'Подключён' : 'Не подключён'}
      </span>
    </div>

    {!connected && <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
      Откройте раздел «Telegram», подключите собственного бота и отправьте ему команду <b>«🔐 Подключить WB»</b>. Телефон и код WB вводятся только в личном чате с вашим ботом.
    </div>}

    {connected && <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={sync.isPending} onClick={() => sync.mutate()}><RefreshCw size={16} className={sync.isPending ? 'animate-spin' : ''}/>{sync.isPending ? 'Загружаем…' : 'Обновить данные WB'}</button>
        <button className="btn" disabled={disconnect.isPending} onClick={() => disconnect.mutate()}><Unplug size={16}/>Отключить</button>
      </div>
      {status.data?.lastSyncAt && <p className="mt-2 text-xs text-slate-500">Последнее обновление: {new Date(status.data.lastSyncAt).toLocaleString('ru-RU')}</p>}
      {result && <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{result}</p>}
    </div>}
    <ErrorNote error={error}/>
  </section>
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
