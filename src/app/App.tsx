import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { clearRecovery, isRecovering, markRecovery } from '../lib/recovery'
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

const read = (key:string) => { try { return localStorage.getItem(key) } catch { return null } }
const write = (key:string, value:string | null) => {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value) } catch { /* приватный режим браузера */ }
}

/** Чей кэш React Query лежит на диске (main.tsx сохраняет его между перезагрузками). */
const CACHE_USER = 'pvz.cacheUser'
/** Роль и наличие организации с прошлого входа: без них каждый запуск ждал бы запроса на экране «П». */
const MEMBER = 'pvz.member'
interface MemberCache { userId:string; hasOrganization:boolean; role:MemberRole | null }
function cachedMember(userId:string):MemberCache | null {
  try {
    const value = JSON.parse(read(MEMBER) ?? 'null') as MemberCache | null
    return value?.userId === userId ? value : null
  } catch { return null }
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
  // Начинаем с владельца сохранённого кэша, а не с null: иначе первое же событие
  // INITIAL_SESSION выглядело бы как смена пользователя и стирало восстановленный кэш.
  const userId = useRef<string | null>(read(CACHE_USER))

  async function checkOrganization(current:Session) {
    if (!supabase) return setHasOrganization(true)
    const { data, error } = await supabase.from('organization_members').select('organization_id,role').eq('user_id', current.user.id).limit(1)
    const has = !error && Boolean(data?.length)
    const nextRole = (data?.[0]?.role as MemberRole | undefined) ?? null
    setHasOrganization(has)
    setRole(nextRole)
    if (!error) write(MEMBER, JSON.stringify({ userId: current.user.id, hasOrganization: has, role: nextRole } satisfies MemberCache))
  }

  useEffect(() => {
    if (!supabase) { setSession(null); return }
    // Другой человек на том же телефоне (или выход) — кэш прежнего выбрасываем целиком,
    // и из памяти, и с диска. Ключи кэша не содержат пользователя, и сотрудник иначе
    // увидел бы данные владельца.
    const adopt = (next:Session | null) => {
      const nextUser = next?.user.id ?? null
      if (nextUser !== userId.current) {
        queryClient.clear()
        write(MEMBER, null)
        write(CACHE_USER, nextUser)
      }
      userId.current = nextUser
      setSession(next)
    }
    void supabase.auth.getSession()
      .then(({ data }) => adopt(data.session))
      .catch(error => {
        // Повреждённая локальная сессия не должна навсегда оставлять пустой экран.
        console.error('[auth] failed to restore session', error)
        setSession(null)
      })
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      // Переход по старой ссылке из письма: Supabase сам объявляет восстановление.
      if (event === 'PASSWORD_RECOVERY') { markRecovery(); navigate('/reset', { replace: true }) }
      // Пометка живёт до смены пароля, но чужой сессии она не касается.
      if (event === 'SIGNED_OUT') clearRecovery()
      resetOrganizationCache()
      adopt(next)
    })
    return () => data.subscription.unsubscribe()
  }, [queryClient, navigate])

  useEffect(() => {
    if (!session) { setHasOrganization(undefined); return }
    // Повторный вход: открываем приложение сразу по прошлому ответу, а свежий
    // приходит в фоне — если роль изменилась, сработают те же редиректы.
    const cached = cachedMember(session.user.id)
    if (cached) { setHasOrganization(cached.hasOrganization); setRole(cached.role) }
    void checkOrganization(session)
  }, [session])

  if (!isSupabaseConfigured) return <NotConfigured/>
  if (session === undefined) return <Booting/>

  // Вход по коду из письма — это ещё не доступ к приложению: пока пароль не сменён,
  // любой адрес ведёт на экран нового пароля.
  const recovering = Boolean(session) && isRecovering()

  return <Routes>
    {/* Стенд кита — вне авторизации: он не читает данные, а смотреть его нужно с телефона. */}
    <Route path="/kit" element={<Suspense fallback={<Booting/>}><KitStand/></Suspense>}/>
    <Route path="/login" element={session ? <Navigate to={recovering ? '/reset' : '/'} replace/> : <Suspense fallback={<Booting/>}><Login/></Suspense>}/>
    {/* Регистрация: без сессии первый шаг создаёт аккаунт, с сессией — сразу организацию.
        Организацию App узнаёт только в конце: иначе после второго шага экран сменился бы на приложение. */}
    <Route path="/register" element={recovering
      ? <Navigate to="/reset" replace/>
      : session && hasOrganization
      ? <Navigate to="/" replace/>
      : <Suspense fallback={<Booting/>}><Onboarding session={session} onDone={async () => { if (session) await checkOrganization(session) }}/></Suspense>}/>
    <Route path="/reset" element={session ? <Suspense fallback={<Booting/>}><ResetPassword/></Suspense> : <Navigate to="/login" replace/>}/>
    <Route path="/join/:code?" element={<Suspense fallback={<Booting/>}>
      <Join session={session} onJoined={async () => { if (session) await checkOrganization(session) }}/>
    </Suspense>}/>
    <Route path="/*" element={
      !session ? <Navigate to="/login" replace/>
        : recovering ? <Navigate to="/reset" replace/>
        : hasOrganization === undefined ? <Booting/>
          : !hasOrganization ? <Navigate to="/register" replace/>
            : <ProductRoutes role={role}/>
    }/>
  </Routes>
}
