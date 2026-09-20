import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { SkeletonRows } from '../shared/kit/Misc'
import { AppShell } from './Shell'

// Экраны грузятся лениво: в первый кадр нужен только тот, на котором открылись.
const Home = lazy(() => import('../screens/Home'))
const Metric = lazy(() => import('../screens/Metric'))
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
const Templates = lazy(() => import('../screens/Templates'))
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
const RateHistory = lazy(() => import('../screens/settings/RateHistory'))

/**
 * Таблица экранов. Плоская, а не вложенная по табам: таб — это префикс адреса,
 * а стек внутри таба ведёт history (см. app/nav.ts). Заголовки взяты из прототипа.
 *
 * Экраны появляются по фазам плана; до этого на своих адресах стоят заготовки,
 * поэтому переходы, жест «назад» и глубина стека проверяются уже сейчас.
 */
export function AppRoutes() {
  return <AppShell render={location => <Suspense fallback={<div className="p-4"><SkeletonRows/></div>}>
    <Routes location={location}>
      <Route path="/" element={<Navigate to="/home" replace/>}/>

      {/* Владелец */}
      <Route path="/home" element={<Home/>}/>
      <Route path="/home/metric/:key" element={<Metric/>}/>

      <Route path="/sched" element={<Schedule/>}/>
      <Route path="/sched/build" element={<ScheduleBuilder/>}/>
      <Route path="/sched/wizard" element={<Wizard/>}/>
      <Route path="/sched/templates" element={<Templates/>}/>
      <Route path="/sched/share" element={<Share/>}/>

      <Route path="/people" element={<People/>}/>
      <Route path="/people/new" element={<EmployeeNew/>}/>
      <Route path="/people/:id" element={<Employee/>}/>
      <Route path="/people/:id/payroll" element={<Payroll/>}/>
      <Route path="/people/:id/edit" element={<EmployeeEdit/>}/>
      <Route path="/people/:id/rates" element={<RateHistory/>}/>
      <Route path="/people/:id/invite" element={<Invite/>}/>

      <Route path="/money" element={<Money/>}/>
      <Route path="/money/ops" element={<Operations/>}/>
      {/* Конкретный адрес идёт раньше параметра: иначе «sync» попадёт в :id. */}
      <Route path="/money/ded/sync" element={<WbSync/>}/>
      <Route path="/money/ded/:id" element={<Deduction/>}/>
      <Route path="/money/recurring" element={<Recurring/>}/>
      <Route path="/money/categories" element={<Categories/>}/>

      <Route path="/more" element={<More/>}/>
      <Route path="/more/points" element={<Points/>}/>
      {/* :id = new — новый пункт */}
      <Route path="/more/points/:id" element={<PointEdit/>}/>
      <Route path="/more/settings" element={<Settings/>}/>
      <Route path="/more/wb" element={<WbCabinet/>}/>
      <Route path="/more/telegram" element={<Telegram/>}/>

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
