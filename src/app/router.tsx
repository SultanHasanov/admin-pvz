import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes, useSearchParams } from 'react-router-dom'
import { SkeletonRows } from '../shared/kit/Misc'
import { useIsMobile } from '../shared/responsive'
import { AppShell, PointGate } from './Shell'
import { Split } from './Split'

// Экраны грузятся лениво: в первый кадр нужен только тот, на котором открылись.
const Home = lazy(() => import('../screens/Home'))
const Metric = lazy(() => import('../screens/Metric'))
const Setup = lazy(() => import('../screens/Setup'))
const Schedule = lazy(() => import('../screens/Schedule'))
const ScheduleBuilder = lazy(() => import('../screens/ScheduleBuilder'))
const People = lazy(() => import('../screens/People'))
const Employee = lazy(() => import('../screens/Employee'))
const EmployeeNew = lazy(() => import('../screens/EmployeeNew'))
const Payroll = lazy(() => import('../screens/Payroll'))
const EmployeeEdit = lazy(() => import('../screens/EmployeeEdit'))
const Money = lazy(() => import('../screens/Money'))
const More = lazy(() => import('../screens/More'))
const Deduction = lazy(() => import('../screens/Deduction'))
const Wizard = lazy(() => import('../screens/Wizard'))
const Share = lazy(() => import('../screens/Share'))
const Invite = lazy(() => import('../screens/Invite'))
const MeHome = lazy(() => import('../screens/me/MeHome'))
const MeSchedule = lazy(() => import('../screens/me/MeSchedule'))
const MeMoney = lazy(() => import('../screens/me/MeMoney'))
const MeDeductions = lazy(() => import('../screens/me/MeDeductions'))
const MeProfile = lazy(() => import('../screens/me/MeProfile'))
const Points = lazy(() => import('../screens/settings/Points'))
const PointEdit = lazy(() => import('../screens/settings/PointEdit'))
const Settings = lazy(() => import('../screens/settings/Settings'))
const Recurring = lazy(() => import('../screens/settings/Recurring'))
const Categories = lazy(() => import('../screens/settings/Categories'))
const Operations = lazy(() => import('../screens/settings/Operations'))
const WbCabinet = lazy(() => import('../screens/settings/WbCabinet'))
const WbSync = lazy(() => import('../screens/settings/WbSync'))
const Telegram = lazy(() => import('../screens/settings/Telegram'))
const TelegramBot = lazy(() => import('../screens/settings/TelegramBot'))
const RateHistory = lazy(() => import('../screens/settings/RateHistory'))

/**
 * Таблица экранов. Плоская, а не вложенная по табам: таб — это префикс адреса,
 * а стек внутри таба ведёт history (см. app/nav.ts). Заголовки взяты из прототипа.
 *
 * Экраны появляются по фазам плана; до этого на своих адресах стоят заготовки,
 * поэтому переходы, жест «назад» и глубина стека проверяются уже сейчас.
 */
export function AppRoutes() {
  const desktop = !useIsMobile()

  // Десктоп: весь раздел «Люди» — список слева и экран записи справа (карточка, расчёт,
  // правка, приглашение, новый сотрудник). На телефоне — просто экран записи.
  const person = (detail:ReactNode) => desktop ? <Split master={<People/>} detail={detail} empty={PERSON}/> : detail
  const point = (detail:ReactNode) => desktop ? <Split master={<Points/>} detail={detail} empty={POINT}/> : detail

  return <AppShell gate={<PointGate/>} render={location =><Suspense fallback={<div className="p-4"><SkeletonRows/></div>}>
    <Routes location={location}>
      <Route path="/" element={<Navigate to="/home" replace/>}/>

      {/* Владелец */}
      <Route path="/home" element={<Home/>}/>
      <Route path="/home/metric/:key" element={<Metric/>}/>
      <Route path="/home/setup" element={<Setup/>}/>

      <Route path="/sched" element={<Schedule/>}/>
      <Route path="/sched/build" element={<ScheduleBuilder/>}/>
      <Route path="/sched/wizard" element={<Wizard/>}/>
      <Route path="/sched/share" element={<Share/>}/>

      <Route path="/people" element={desktop ? <Split master={<People/>} empty={PERSON}/> : <People/>}/>
      <Route path="/people/new" element={person(<EmployeeNew/>)}/>
      <Route path="/people/:id" element={person(<Employee/>)}/>
      <Route path="/people/:id/payroll" element={person(<Payroll/>)}/>
      <Route path="/people/:id/edit" element={person(<EmployeeEdit/>)}/>
      <Route path="/people/:id/rates" element={person(<RateHistory/>)}/>
      <Route path="/people/:id/invite" element={person(<Invite/>)}/>

      <Route path="/money" element={desktop ? <MoneyDesk/> : <Money/>}/>
      <Route path="/money/ops" element={<Operations/>}/>
      {/* Конкретный адрес идёт раньше параметра: иначе «sync» попадёт в :id. */}
      <Route path="/money/ded/sync" element={<WbSync/>}/>
      <Route path="/money/ded/:id" element={desktop ? <MoneyDesk detail={<Deduction/>}/> : <Deduction/>}/>
      <Route path="/money/recurring" element={<Recurring/>}/>
      <Route path="/money/categories" element={<Categories/>}/>

      <Route path="/more" element={<More/>}/>
      <Route path="/more/points" element={desktop ? <Split master={<Points/>} empty={POINT}/> : <Points/>}/>
      {/* :id = new — новый пункт */}
      <Route path="/more/points/:id" element={point(<PointEdit/>)}/>
      <Route path="/more/settings" element={<Settings/>}/>
      <Route path="/more/wb" element={<WbCabinet/>}/>
      <Route path="/more/telegram" element={<Telegram/>}/>
      {/* Напоминания бота конкретной точки: группа-получатель и расписание. */}
      <Route path="/more/telegram/:pointId" element={<TelegramBot/>}/>

      {/* Сотрудник */}
      <Route path="/me" element={<MeHome/>}/>
      <Route path="/me/sched" element={<MeSchedule/>}/>
      <Route path="/me/money" element={<MeMoney/>}/>
      {/* В прототипе удержания сотрудника — один список со шторкой «не согласен», отдельной карточки нет. */}
      <Route path="/me/money/deductions" element={<MeDeductions/>}/>
      <Route path="/me/profile" element={<MeProfile/>}/>

      <Route path="*" element={<Navigate to="/home" replace/>}/>
    </Routes>
  </Suspense>}/>
}

const PERSON = 'Выберите сотрудника в списке слева'
const POINT = 'Выберите пункт выдачи в списке слева'

/**
 * «Деньги» на десктопе. Вкладка «Удержания» — список слева и карточка удержания справа;
 * остальные вкладки — обычный экран во всю ширину. Один и тот же компонент стоит на обоих
 * адресах, поэтому список удержаний не перемонтируется при открытии карточки.
 */
function MoneyDesk({ detail }:{ detail?:ReactNode }) {
  const [params] = useSearchParams()
  if (!detail && params.get('tab') !== 'ded') return <Money/>
  return <Split master={<Money tab="ded"/>} detail={detail} empty="Выберите удержание в списке слева"/>
}
