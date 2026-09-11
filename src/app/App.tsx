import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Alert, Button, Card, Drawer, Form, Grid, Input, Layout, Menu, Select, Spin, Typography } from 'antd'
import { BarChart3, Building2, CalendarDays, CircleDollarSign, ClipboardList, LogOut, Menu as MenuIcon, MessageCircle, PackageSearch, Settings, Users, Wallet } from 'lucide-react'
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
  { to: '/valuable-items', title: 'Контроль товаров', icon: PackageSearch },
  { to: '/settings', title: 'Настройки', icon: Settings },
]

function Logo() {
  return <div className="flex items-center gap-2 px-2 py-4 font-bold">
    <img src="/brand/pvz-control-logo.png" width="32" height="32" alt="" className="h-8 w-8 rounded-lg"/>
    PVZ Control
  </div>
}

function Navigation({ onNavigate }:{ onNavigate?:() => void }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { isModuleEnabled } = useOrg()
  const visible = links.filter(link => !link.module || isModuleEnabled(link.module))

  return <div className="flex h-full flex-col">
    <Menu
      mode="inline" style={{ borderInlineEnd: 0, flex: 1 }}
      selectedKeys={[visible.some(l => l.to === pathname) ? pathname : '/']}
      onClick={({ key }) => { navigate(key); onNavigate?.() }}
      items={visible.map(link => ({
        key: link.to,
        icon: <link.icon size={18}/>,
        label: link.to === '/valuable-items' ? <span className="flex items-center gap-2">Контроль товаров <Typography.Text type="secondary" className="text-[10px]">Скоро</Typography.Text></span> : link.title,
      }))}
    />
    <div className="p-2 safe-b">
      <Button block type="text" icon={<LogOut size={16}/>} onClick={() => { resetOrganizationCache(); void supabase?.auth.signOut() }}>Выйти</Button>
    </div>
  </div>
}

/** Фильтры «ПВЗ» и «месяц» действуют на весь продукт, поэтому живут в шапке. */
function Filters() {
  const { points, pointId, setPointId, month, setMonth } = useOrg()
  return <div className="scroll-x ml-auto flex items-center gap-2">
    {points.length > 1 && <Select
      value={pointId} onChange={setPointId} style={{ minWidth: 130 }} aria-label="Пункт выдачи"
      options={[{ value: '', label: 'Все ПВЗ' }, ...points.map(point => ({ value: point.id, label: point.name }))]}
    />}
    <Select
      value={month} onChange={setMonth} style={{ minWidth: 140 }} aria-label="Месяц"
      options={monthOptions().map(value => ({ value, label: monthLabel(value) }))}
    />
  </div>
}

function Shell({ children }:{ children:ReactNode }) {
  const [open, setOpen] = useState(false)
  const screens = Grid.useBreakpoint()
  const desktop = Boolean(screens.lg)

  return <Layout style={{ minHeight: '100vh' }}>
    {desktop && <Layout.Sider width={248} theme="light" style={{ position: 'sticky', top: 0, height: '100vh', borderInlineEnd: '1px solid #e9edf0' }}>
      <Logo/>
      <Navigation/>
    </Layout.Sider>}

    <Drawer
      open={!desktop && open} onClose={() => setOpen(false)} placement="left"
      width={280} closable={false} styles={{ body: { padding: 0 } }} title={<Logo/>}
    >
      <Navigation onNavigate={() => setOpen(false)}/>
    </Drawer>

    <Layout>
      <Layout.Header style={{ position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #e9edf0' }}>
        {!desktop && <Button type="text" icon={<MenuIcon size={20}/>} aria-label="Открыть меню" onClick={() => setOpen(true)}/>}
        {desktop && <Typography.Text type="secondary">Операционная система владельца ПВЗ</Typography.Text>}
        <Filters/>
      </Layout.Header>
      <Layout.Content className="safe-b">
        <div className="mx-auto max-w-7xl p-4 sm:p-6">{children}</div>
      </Layout.Content>
    </Layout>
  </Layout>
}

function CenteredPage({ children }:{ children:ReactNode }) {
  return <div className="grid min-h-screen place-items-center p-4"><div className="w-full max-w-md">{children}</div></div>
}

function Auth({ session }:{ session:Session | null }) {
  const navigate = useNavigate()
  const [register, setRegister] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [form] = Form.useForm<{ email:string; password:string }>()
  if (session) return <Navigate to="/" replace/>

  async function submit({ email, password }:{ email:string; password:string }) {
    if (!supabase) return
    setBusy(true); setMessage('')
    const result = register ? await supabase.auth.signUp({ email, password }) : await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (result.error) setMessage(result.error.message)
    else if (register && !result.data.session) setMessage('Подтвердите регистрацию по ссылке в письме')
    else navigate('/', { replace: true })
  }

  async function reset() {
    const email = form.getFieldValue('email')
    if (!supabase || !email) return setMessage('Введите email')
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/login` })
    setMessage(error?.message ?? 'Ссылка отправлена на почту')
  }

  return <CenteredPage>
    <Card variant="outlined">
      <div className="mb-5 flex items-center gap-2 text-xl font-bold">
        <img src="/brand/pvz-control-logo.png" width="36" height="36" alt="" className="h-9 w-9 rounded-xl"/>PVZ Control
      </div>
      <Typography.Title level={4} style={{ marginBottom: 4 }}>{register ? 'Создать аккаунт' : 'Войти в аккаунт'}</Typography.Title>
      <Typography.Text type="secondary">Управляйте ПВЗ в одном месте</Typography.Text>
      <Form form={form} layout="vertical" className="mt-5" onFinish={values => void submit(values)} requiredMark={false}>
        <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email', message: 'Введите email' }]}>
          <Input autoComplete="email" inputMode="email"/>
        </Form.Item>
        <Form.Item name="password" label="Пароль" rules={[{ required: true, min: 6, message: 'Минимум 6 символов' }]}>
          <Input.Password autoComplete="current-password"/>
        </Form.Item>
        {message && <Alert className="mb-3" type="info" showIcon message={message}/>}
        <Button block type="primary" htmlType="submit" loading={busy}>{register ? 'Зарегистрироваться' : 'Войти'}</Button>
      </Form>
      <div className="mt-4 flex flex-wrap justify-between gap-3">
        <Button type="link" style={{ padding: 0 }} onClick={() => setRegister(!register)}>{register ? 'Уже есть аккаунт' : 'Создать аккаунт'}</Button>
        {!register && <Button type="text" onClick={() => void reset()}>Забыли пароль?</Button>}
      </div>
    </Card>
  </CenteredPage>
}

function Onboarding({ done }:{ done:() => void }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function create(values:{ organization:string; point:string; address:string }) {
    if (!supabase) return
    setBusy(true)
    const { error: failure } = await supabase.rpc('create_organization_with_owner', {
      p_name: values.organization, p_point_name: values.point, p_point_address: values.address, p_timezone: 'Europe/Moscow',
    })
    setBusy(false)
    if (failure) setError(failure.message)
    else { resetOrganizationCache(); done() }
  }

  return <CenteredPage>
    <Card variant="outlined">
      <Typography.Title level={4} style={{ marginBottom: 4 }}>Настроим вашу организацию</Typography.Title>
      <Typography.Text type="secondary">Создайте организацию и первый пункт выдачи.</Typography.Text>
      <Form layout="vertical" className="mt-5" onFinish={values => void create(values)} requiredMark={false}>
        <Form.Item name="organization" label="Название организации" rules={[{ required: true, message: 'Укажите название' }]}><Input/></Form.Item>
        <Form.Item name="point" label="Название ПВЗ" rules={[{ required: true, message: 'Укажите название' }]}><Input/></Form.Item>
        <Form.Item name="address" label="Адрес ПВЗ" rules={[{ required: true, message: 'Укажите адрес' }]}><Input/></Form.Item>
        {error && <Alert className="mb-3" type="error" showIcon message={error}/>}
        <Button block type="primary" htmlType="submit" loading={busy}>Начать работу</Button>
      </Form>
    </Card>
  </CenteredPage>
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
  return <CenteredPage>
    <Card variant="outlined">
      <Typography.Title level={4}>Подключите Supabase</Typography.Title>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
        Скопируйте <Typography.Text code>.env.example</Typography.Text> в <Typography.Text code>.env.local</Typography.Text>,
        заполните <Typography.Text code>VITE_SUPABASE_URL</Typography.Text> и <Typography.Text code>VITE_SUPABASE_ANON_KEY</Typography.Text>,
        затем перезапустите <Typography.Text code>npm run dev</Typography.Text>.
      </Typography.Paragraph>
    </Card>
  </CenteredPage>
}

const Booting = () => <div className="grid min-h-screen place-items-center"><Spin size="large"/></div>

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [hasOrganization, setHasOrganization] = useState<boolean>()

  async function checkOrganization(current:Session) {
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
  if (session === undefined) return <Booting/>

  return <Routes>
    <Route path="/login" element={<Auth session={session}/>}/>
    <Route path="/*" element={
      !session ? <Navigate to="/login" replace/>
        : hasOrganization === undefined ? <Booting/>
          : !hasOrganization ? <Onboarding done={() => void checkOrganization(session)}/>
            : <ProductRoutes/>
    }/>
  </Routes>
}
