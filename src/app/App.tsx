import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import { BarChart3, Building2, CalendarDays, CircleDollarSign, ClipboardList, LogOut, Menu, MessageCircle, PackageSearch, Settings, Users, Wallet, X } from 'lucide-react'
import { DashboardPage, EmployeesPage, FinancePage, ModulesPage, ShiftsPage, SoonPage, TelegramPage } from '../pages/Pages'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

const links = [['/', 'Главная', BarChart3], ['/points', 'ПВЗ', Building2], ['/employees', 'Сотрудники', Users], ['/shifts', 'Смены', CalendarDays], ['/finance', 'Финансы', Wallet], ['/salary', 'Зарплаты', CircleDollarSign], ['/deductions', 'Удержания WB', ClipboardList], ['/telegram', 'Telegram', MessageCircle], ['/settings', 'Настройки', Settings]] as const

function Shell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
    <aside className={`${open ? 'fixed inset-y-0 left-0 z-30 flex w-72 max-w-[85vw]' : 'hidden'} flex-col border-r border-slate-200 bg-white p-4 lg:sticky lg:top-0 lg:flex lg:h-screen`}>
      <div className="mb-8 flex items-center justify-between px-2"><div className="flex items-center gap-2 font-bold"><span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">P</span>PVZ Control</div><button aria-label="Закрыть меню" className="p-2 lg:hidden" onClick={() => setOpen(false)}><X size={20}/></button></div>
      <nav className="space-y-1">{links.map(([to, title, Icon]) => <NavLink key={to} to={to} end={to === '/'} onClick={() => setOpen(false)} className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium lg:py-2.5 ${isActive ? 'bg-brand-50 text-brand-600' : 'text-slate-600 hover:bg-slate-50'}`}><Icon size={18}/>{title}</NavLink>)}<NavLink to="/valuable-items" className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm text-slate-600"><PackageSearch size={18}/>Контроль товаров <span className="ml-auto text-[10px]">Скоро</span></NavLink></nav>
      <button className="mt-auto flex items-center gap-2 rounded-lg p-3 text-sm text-slate-600 hover:bg-slate-50" onClick={() => void supabase?.auth.signOut()}><LogOut size={17}/>Выйти</button>
    </aside>
    {open && <button aria-label="Закрыть меню" className="fixed inset-0 z-20 bg-slate-900/30 lg:hidden" onClick={() => setOpen(false)}/>}<main className="min-w-0"><header className="flex h-16 items-center border-b border-slate-200 bg-white px-4 sm:px-7"><button aria-label="Открыть меню" className="p-2 lg:hidden" onClick={() => setOpen(true)}><Menu/></button><span className="hidden text-sm text-slate-500 lg:block">Операционная система владельца ПВЗ</span></header><div className="mx-auto max-w-7xl p-4 sm:p-7">{children}</div></main>
  </div>
}

function Auth({ session }: { session: Session | null }) {
  const navigate = useNavigate(), [register, setRegister] = useState(false), [email, setEmail] = useState(''), [password, setPassword] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
  if (session) return <Navigate to="/" replace/>
  async function submit() { if (!supabase) return; setBusy(true); setMessage(''); const result = register ? await supabase.auth.signUp({ email, password }) : await supabase.auth.signInWithPassword({ email, password }); setBusy(false); if (result.error) setMessage(result.error.message); else if (register && !result.data.session) setMessage('Подтвердите регистрацию по ссылке в письме'); else navigate('/', { replace: true }) }
  async function reset() { if (!supabase || !email) return setMessage('Введите email'); const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/login` }); setMessage(error?.message ?? 'Ссылка отправлена на почту') }
  return <div className="grid min-h-screen place-items-center bg-slate-50 p-4"><form className="card w-full max-w-md p-6" onSubmit={e => { e.preventDefault(); void submit() }}><div className="mb-6 text-xl font-bold">PVZ Control</div><h1 className="text-xl font-semibold">{register ? 'Создать аккаунт' : 'Войти в аккаунт'}</h1><p className="mb-5 mt-1 text-sm text-slate-500">Управляйте ПВЗ в одном месте</p><label className="label">Email<input required type="email" className="field mt-1" value={email} onChange={e => setEmail(e.target.value)}/></label><label className="label mt-4">Пароль<input required minLength={6} type="password" className="field mt-1" value={password} onChange={e => setPassword(e.target.value)}/></label>{message && <p className="mt-3 text-sm text-brand-600">{message}</p>}<button disabled={busy} className="btn btn-primary mt-5 w-full">{busy ? 'Подождите…' : register ? 'Зарегистрироваться' : 'Войти'}</button><div className="mt-4 flex justify-between text-sm"><button type="button" className="text-brand-600" onClick={() => setRegister(!register)}>{register ? 'Уже есть аккаунт' : 'Создать аккаунт'}</button>{!register && <button type="button" className="text-slate-500" onClick={() => void reset()}>Забыли пароль?</button>}</div></form></div>
}

function Onboarding({ done }: { done: () => void }) {
  const [organization, setOrganization] = useState(''), [point, setPoint] = useState(''), [address, setAddress] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  async function create() { if (!supabase) return; setBusy(true); const { error: e } = await supabase.rpc('create_organization_with_owner', { p_name: organization, p_point_name: point, p_point_address: address, p_timezone: 'Europe/Moscow' }); setBusy(false); if (e) setError(e.message); else done() }
  return <div className="grid min-h-screen place-items-center bg-slate-50 p-4"><form className="card w-full max-w-lg p-6" onSubmit={e => { e.preventDefault(); void create() }}><h1 className="text-xl font-semibold">Настроим вашу организацию</h1><p className="mb-5 mt-1 text-sm text-slate-500">Создайте организацию и первый пункт выдачи.</p><label className="label">Название организации<input required className="field mt-1" value={organization} onChange={e => setOrganization(e.target.value)}/></label><label className="label mt-4">Название ПВЗ<input required className="field mt-1" value={point} onChange={e => setPoint(e.target.value)}/></label><label className="label mt-4">Адрес ПВЗ<input required className="field mt-1" value={address} onChange={e => setAddress(e.target.value)}/></label>{error && <p className="mt-3 text-sm text-red-600">{error}</p>}<button disabled={busy} className="btn btn-primary mt-5 w-full">{busy ? 'Создаём…' : 'Начать работу'}</button></form></div>
}

function ProductRoutes() { return <Shell><Routes><Route path="/" element={<DashboardPage/>}/><Route path="/employees" element={<EmployeesPage/>}/><Route path="/shifts" element={<ShiftsPage/>}/><Route path="/finance" element={<FinancePage/>}/><Route path="/settings" element={<ModulesPage/>}/><Route path="/telegram" element={<TelegramPage/>}/><Route path="/points" element={<SoonPage title="Пункты выдачи" description="Добавляйте точки, рабочее время, часовой пояс и сотрудников."/>}/><Route path="/salary" element={<SoonPage title="Зарплаты" description="Расчётные периоды, начисления, премии, авансы и выплаты."/>}/><Route path="/deductions" element={<SoonPage title="Удержания WB" description="Связывайте удержания со сменой и ведите историю оспаривания."/>}/><Route path="/valuable-items" element={<SoonPage title="Контроль товаров" description="Автоматический контроль дорогих товаров."/>}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes></Shell> }

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined), [hasOrganization, setHasOrganization] = useState<boolean>()
  async function checkOrganization(current: Session) { if (!supabase) return setHasOrganization(true); const { data, error } = await supabase.from('organization_members').select('organization_id').eq('user_id', current.user.id).limit(1); setHasOrganization(!error && Boolean(data?.length)) }
  useEffect(() => { if (!supabase) { setSession(null); return }; void supabase.auth.getSession().then(({ data }) => setSession(data.session)); const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next)); return () => data.subscription.unsubscribe() }, [])
  useEffect(() => { if (session) void checkOrganization(session); else setHasOrganization(undefined) }, [session])
  if (!isSupabaseConfigured) return <ProductRoutes/>
  if (session === undefined) return <div className="grid min-h-screen place-items-center">Загрузка…</div>
  return <Routes><Route path="/login" element={<Auth session={session}/>}/><Route path="/*" element={!session ? <Navigate to="/login" replace/> : hasOrganization === undefined ? <div className="grid min-h-screen place-items-center">Загрузка…</div> : !hasOrganization ? <Onboarding done={() => void checkOrganization(session)}/> : <ProductRoutes/>}/></Routes>
}
