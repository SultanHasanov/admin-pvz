import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import { BarChart3, Building2, CalendarDays, CircleDollarSign, ClipboardList, LogOut, Menu, MessageCircle, PackageSearch, Settings, Users, Wallet, X } from 'lucide-react'
import type { ModuleKey } from '../entities/types'
import { monthLabel, monthOptions } from '../shared/dates'
import { DashboardPage } from '../pages/Dashboard'
import { PointsPage } from '../pages/Points'
import { EmployeesPage } from '../pages/Employees'
import { ShiftsPage } from '../pages/Shifts'
import { FinancePage } from '../pages/Finance'
import { SalaryPage } from '../pages/Salary'
import { DeductionsPage } from '../pages/Deductions'
import { SettingsPage } from '../pages/Settings'
import { TelegramPage } from '../pages/Telegram'
import { ValuableItemsPage } from '../pages/ValuableItems'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { resetOrganizationCache } from '../services/org'
import { OrgProvider, useOrg } from './OrgContext'

/** Пункт меню виден, пока его модуль включён в настройках. */
const links:{ to:string; title:string; icon:typeof BarChart3; module?:ModuleKey }[] = [
  { to: '/', title: 'Главная', icon: BarChart3 },
  { to: '/points', title: 'ПВЗ', icon: Building2 },
  { to: '/employees', title: 'Сотрудники', icon: Users, module: 'employees' },
  { to: '/shifts', title: 'Смены', icon: CalendarDays, module: 'shifts' },
  { to: '/finance', title: 'Финансы', icon: Wallet, module: 'expenses' },
  { to: '/salary', title: 'Зарплаты', icon: CircleDollarSign, module: 'salary' },
  { to: '/deductions', title: 'Удержания WB', icon: ClipboardList, module: 'wb_deductions' },
  { to: '/telegram', title: 'Telegram', icon: MessageCircle, module: 'telegram' },
  { to: '/settings', title: 'Настройки', icon: Settings },
]

const navClass = ({ isActive }:{ isActive:boolean }) => `flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium lg:py-2.5 ${isActive ? 'bg-brand-50 text-brand-600' : 'text-slate-600 hover:bg-slate-50'}`

function Filters() {
  const { points, pointId, setPointId, month, setMonth } = useOrg()
  return <div className="scroll-x ml-auto flex items-center gap-2 py-1">
    {points.length > 1 && <select className="field w-auto py-2 text-sm" value={pointId} onChange={e => setPointId(e.target.value)} aria-label="Пункт выдачи">
      <option value="">Все ПВЗ</option>
      {points.map(point => <option key={point.id} value={point.id}>{point.name}</option>)}
    </select>}
    <select className="field w-auto py-2 text-sm" value={month} onChange={e => setMonth(e.target.value)} aria-label="Месяц">
      {monthOptions().map(value => <option key={value} value={value}>{monthLabel(value)}</option>)}
    </select>
  </div>
}

function Shell({ children }:{ children:ReactNode }) {
  const [open, setOpen] = useState(false)
  const { isModuleEnabled } = useOrg()
  const visible = links.filter(link => !link.module || isModuleEnabled(link.module))

  return <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
    <aside className={`${open ? 'fixed inset-y-0 left-0 z-30 flex w-72 max-w-[85vw] overflow-y-auto' : 'hidden'} flex-col border-r border-slate-200 bg-white p-4 safe-b lg:sticky lg:top-0 lg:flex lg:h-screen lg:max-w-none`}>
      <div className="mb-8 flex items-center justify-between px-2">
        <div className="flex items-center gap-2 font-bold"><img src="/brand/pvz-control-logo.png" width="32" height="32" alt="PVZ Control" className="h-8 w-8 rounded-lg"/>PVZ Control</div>
        <button aria-label="Закрыть меню" className="-m-2 p-2 lg:hidden" onClick={() => setOpen(false)}><X size={20}/></button>
      </div>
      <nav className="space-y-1">
        {visible.map(link => <NavLink key={link.to} to={link.to} end={link.to === '/'} onClick={() => setOpen(false)} className={navClass}>
          <link.icon size={18} className="shrink-0"/>{link.title}
        </NavLink>)}
        <NavLink to="/valuable-items" onClick={() => setOpen(false)} className={navClass}>
          <PackageSearch size={18} className="shrink-0"/>Контроль товаров <span className="ml-auto rounded bg-slate-100 px-1.5 py-0.5 text-[10px]">Скоро</span>
        </NavLink>
      </nav>
      <button className="mt-auto flex items-center gap-2 rounded-lg p-3 text-sm text-slate-600 hover:bg-slate-50" onClick={() => { resetOrganizationCache(); void supabase?.auth.signOut() }}><LogOut size={17}/>Выйти</button>
    </aside>

    {open && <button aria-label="Закрыть меню" className="fixed inset-0 z-20 bg-slate-900/30 lg:hidden" onClick={() => setOpen(false)}/>}

    <main className="min-w-0">
      <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b border-slate-200 bg-white px-4 sm:px-7 lg:static">
        <button aria-label="Открыть меню" className="-m-2 shrink-0 p-2 lg:hidden" onClick={() => setOpen(true)}><Menu/></button>
        <span className="hidden text-sm text-slate-500 lg:block">Операционная система владельца ПВЗ</span>
        <Filters/>
      </header>
      <div className="mx-auto max-w-7xl p-4 safe-b sm:p-7">{children}</div>
    </main>
  </div>
}

function Auth({ session }: { session: Session | null }) {
  const navigate = useNavigate(), [register, setRegister] = useState(false), [email, setEmail] = useState(''), [password, setPassword] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
  if (session) return <Navigate to="/" replace/>
  async function submit() { if (!supabase) return; setBusy(true); setMessage(''); const result = register ? await supabase.auth.signUp({ email, password }) : await supabase.auth.signInWithPassword({ email, password }); setBusy(false); if (result.error) setMessage(result.error.message); else if (register && !result.data.session) setMessage('Подтвердите регистрацию по ссылке в письме'); else navigate('/', { replace: true }) }
  async function reset() { if (!supabase || !email) return setMessage('Введите email'); const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/login` }); setMessage(error?.message ?? 'Ссылка отправлена на почту') }
  return <div className="grid min-h-screen place-items-center bg-slate-50 p-4"><form className="card w-full max-w-md p-5 sm:p-6" onSubmit={e => { e.preventDefault(); void submit() }}><div className="mb-6 flex items-center gap-2 text-xl font-bold"><img src="/brand/pvz-control-logo.png" width="36" height="36" alt="PVZ Control" className="h-9 w-9 rounded-xl"/>PVZ Control</div><h1 className="text-xl font-semibold">{register ? 'Создать аккаунт' : 'Войти в аккаунт'}</h1><p className="mb-5 mt-1 text-sm text-slate-500">Управляйте ПВЗ в одном месте</p><label className="label">Email<input required type="email" className="field mt-1" value={email} onChange={e => setEmail(e.target.value)}/></label><label className="label mt-4">Пароль<input required minLength={6} type="password" className="field mt-1" value={password} onChange={e => setPassword(e.target.value)}/></label>{message && <p className="mt-3 text-sm text-brand-600">{message}</p>}<button disabled={busy} className="btn btn-primary mt-5 w-full">{busy ? 'Подождите…' : register ? 'Зарегистрироваться' : 'Войти'}</button><div className="mt-4 flex justify-between gap-3 text-sm"><button type="button" className="text-brand-600" onClick={() => setRegister(!register)}>{register ? 'Уже есть аккаунт' : 'Создать аккаунт'}</button>{!register && <button type="button" className="text-slate-500" onClick={() => void reset()}>Забыли пароль?</button>}</div></form></div>
}

function Onboarding({ done }: { done: () => void }) {
  const [organization, setOrganization] = useState(''), [point, setPoint] = useState(''), [address, setAddress] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  async function create() { if (!supabase) return; setBusy(true); const { error: e } = await supabase.rpc('create_organization_with_owner', { p_name: organization, p_point_name: point, p_point_address: address, p_timezone: 'Europe/Moscow' }); setBusy(false); if (e) setError(e.message); else { resetOrganizationCache(); done() } }
  return <div className="grid min-h-screen place-items-center bg-slate-50 p-4"><form className="card w-full max-w-lg p-5 sm:p-6" onSubmit={e => { e.preventDefault(); void create() }}><h1 className="text-xl font-semibold">Настроим вашу организацию</h1><p className="mb-5 mt-1 text-sm text-slate-500">Создайте организацию и первый пункт выдачи.</p><label className="label">Название организации<input required className="field mt-1" value={organization} onChange={e => setOrganization(e.target.value)}/></label><label className="label mt-4">Название ПВЗ<input required className="field mt-1" value={point} onChange={e => setPoint(e.target.value)}/></label><label className="label mt-4">Адрес ПВЗ<input required className="field mt-1" value={address} onChange={e => setAddress(e.target.value)}/></label>{error && <p className="mt-3 text-sm text-red-600">{error}</p>}<button disabled={busy} className="btn btn-primary mt-5 w-full">{busy ? 'Создаём…' : 'Начать работу'}</button></form></div>
}

function ProductRoutes() {
  return <OrgProvider><Shell><Routes>
    <Route path="/" element={<DashboardPage/>}/>
    <Route path="/points" element={<PointsPage/>}/>
    <Route path="/employees" element={<EmployeesPage/>}/>
    <Route path="/shifts" element={<ShiftsPage/>}/>
    <Route path="/finance" element={<FinancePage/>}/>
    <Route path="/salary" element={<SalaryPage/>}/>
    <Route path="/deductions" element={<DeductionsPage/>}/>
    <Route path="/telegram" element={<TelegramPage/>}/>
    <Route path="/settings" element={<SettingsPage/>}/>
    <Route path="/valuable-items" element={<ValuableItemsPage/>}/>
    <Route path="*" element={<Navigate to="/" replace/>}/>
  </Routes></Shell></OrgProvider>
}

function NotConfigured() {
  return <div className="grid min-h-screen place-items-center bg-slate-50 p-4">
    <div className="card max-w-lg p-6 text-center">
      <h1 className="text-xl font-semibold">Подключите Supabase</h1>
      <p className="mt-3 text-sm text-slate-500">Скопируйте <code>.env.example</code> в <code>.env.local</code>, заполните <code>VITE_SUPABASE_URL</code> и <code>VITE_SUPABASE_ANON_KEY</code>, затем перезапустите <code>npm run dev</code>.</p>
    </div>
  </div>
}

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [hasOrganization, setHasOrganization] = useState<boolean>()

  async function checkOrganization(current: Session) {
    if (!supabase) return setHasOrganization(true)
    const { data, error } = await supabase.from('organization_members').select('organization_id').eq('user_id', current.user.id).limit(1)
    setHasOrganization(!error && Boolean(data?.length))
  }

  useEffect(() => {
    if (!supabase) { setSession(null); return }
    void supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, next) => { resetOrganizationCache(); setSession(next) })
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => { if (session) void checkOrganization(session); else setHasOrganization(undefined) }, [session])

  if (!isSupabaseConfigured) return <NotConfigured/>
  if (session === undefined) return <div className="grid min-h-screen place-items-center text-slate-400">Загрузка…</div>

  return <Routes>
    <Route path="/login" element={<Auth session={session}/>}/>
    <Route path="/*" element={
      !session ? <Navigate to="/login" replace/>
        : hasOrganization === undefined ? <div className="grid min-h-screen place-items-center text-slate-400">Загрузка…</div>
          : !hasOrganization ? <Onboarding done={() => void checkOrganization(session)}/>
            : <ProductRoutes/>
    }/>
  </Routes>
}
