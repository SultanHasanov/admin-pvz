import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { resetOrganizationCache, type MemberRole } from '../services/org'
import { OrgProvider } from './OrgContext'
import { AppRoutes } from './router'

// Вход по приглашению живёт вне оболочки и вне проверки организации: у нового сотрудника
// организации ещё нет, и без этого исключения его встретил бы онбординг владельца.
const Join = lazy(() => import('../screens/Join'))
const Login = lazy(() => import('../screens/auth/Login'))
const Onboarding = lazy(() => import('../screens/auth/Onboarding'))
const ResetPassword = lazy(() => import('../screens/auth/ResetPassword'))
// Стенд кита нужен только разработке и снимкам — в первый кадр приложения не грузится.
const KitStand = lazy(() => import('../screens/KitStand'))

/**
 * Адреса старой antd-панели (удалена в фазе 9) → разделы новой оболочки.
 * У людей остались закладки и ярлыки на рабочем столе — они не должны вести в пустоту.
 */
const LEGACY:Record<string, string> = {
  '/points': '/more/points',
  '/employees': '/people',
  '/shifts': '/sched',
  '/finance': '/money',
  '/salary': '/money?tab=pay',
  '/deductions': '/money?tab=ded',
  '/telegram': '/more/telegram',
  '/settings': '/more/settings',
  '/valuable-items': '/home',
}

/** Загрузка до первого кадра: знак «П» по центру, без чужих спиннеров. */
const Booting = () => <div className="kit-root grid min-h-dvh place-items-center bg-bg">
  <div className="flex size-12 animate-pulse items-center justify-center rounded-[14px] bg-accent text-lead font-semibold text-white">П</div>
</div>

function NotConfigured() {
  return <div className="kit-root grid min-h-dvh place-items-center bg-bg px-4">
    <div className="w-full max-w-[420px] rounded-lg border border-line bg-surface p-5">
      <div className="text-title font-semibold">Подключите Supabase</div>
      <div className="mt-2 text-row leading-[1.5] text-muted">
        Скопируйте <code className="font-mono">.env.example</code> в <code className="font-mono">.env.local</code>,
        заполните <code className="font-mono">VITE_SUPABASE_URL</code> и <code className="font-mono">VITE_SUPABASE_ANON_KEY</code>,
        затем перезапустите <code className="font-mono">npm run dev</code>.
      </div>
    </div>
  </div>
}

/** Сотрудник живёт только в своём кабинете: экраны владельца RLS отдал бы ему пустыми. */
function ProductRoutes({ role }:{ role:MemberRole | null }) {
  const { pathname } = useLocation()
  const inCabinet = pathname === '/me' || pathname.startsWith('/me/')
  if (role === 'EMPLOYEE' && !inCabinet) return <Navigate to="/me" replace/>
  if (LEGACY[pathname]) return <Navigate to={LEGACY[pathname]} replace/>
  return <OrgProvider><AppRoutes/></OrgProvider>
}

export function App() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [hasOrganization, setHasOrganization] = useState<boolean>()
  const [role, setRole] = useState<MemberRole | null>(null)
  const userId = useRef<string | null>(null)

  async function checkOrganization(current:Session) {
    if (!supabase) return setHasOrganization(true)
    const { data, error } = await supabase.from('organization_members').select('organization_id,role').eq('user_id', current.user.id).limit(1)
    setHasOrganization(!error && Boolean(data?.length))
    setRole((data?.[0]?.role as MemberRole | undefined) ?? null)
  }

  useEffect(() => {
    if (!supabase) { setSession(null); return }
    void supabase.auth.getSession().then(({ data }) => { userId.current = data.session?.user.id ?? null; setSession(data.session) })
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      // Ссылка из письма «забыли пароль» входит в аккаунт — сразу просим новый пароль.
      if (event === 'PASSWORD_RECOVERY') navigate('/reset', { replace: true })
      resetOrganizationCache()
      // Другой человек на том же телефоне — кэш прежнего выбрасываем целиком. Ключи
      // кэша не содержат пользователя, и сотрудник иначе увидел бы данные владельца.
      const nextUser = next?.user.id ?? null
      if (nextUser !== userId.current) queryClient.clear()
      userId.current = nextUser
      setSession(next)
    })
    return () => data.subscription.unsubscribe()
  }, [queryClient, navigate])

  useEffect(() => { if (session) void checkOrganization(session); else setHasOrganization(undefined) }, [session])

  if (!isSupabaseConfigured) return <NotConfigured/>
  if (session === undefined) return <Booting/>

  return <Routes>
    {/* Стенд кита — вне авторизации: он не читает данные, а смотреть его нужно с телефона. */}
    <Route path="/kit" element={<Suspense fallback={<Booting/>}><KitStand/></Suspense>}/>
    <Route path="/login" element={session ? <Navigate to="/" replace/> : <Suspense fallback={<Booting/>}><Login/></Suspense>}/>
    {/* Регистрация: без сессии первый шаг создаёт аккаунт, с сессией — сразу организацию.
        Организацию App узнаёт только в конце: иначе после второго шага экран сменился бы на приложение. */}
    <Route path="/register" element={session && hasOrganization
      ? <Navigate to="/" replace/>
      : <Suspense fallback={<Booting/>}><Onboarding session={session} onDone={async () => { if (session) await checkOrganization(session) }}/></Suspense>}/>
    <Route path="/reset" element={session ? <Suspense fallback={<Booting/>}><ResetPassword/></Suspense> : <Navigate to="/login" replace/>}/>
    <Route path="/join/:code?" element={<Suspense fallback={<Booting/>}>
      <Join session={session} onJoined={async () => { if (session) await checkOrganization(session) }}/>
    </Suspense>}/>
    <Route path="/*" element={
      !session ? <Navigate to="/login" replace/>
        : hasOrganization === undefined ? <Booting/>
          : !hasOrganization ? <Navigate to="/register" replace/>
            : <ProductRoutes role={role}/>
    }/>
  </Routes>
}
