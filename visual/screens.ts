/**
 * Экраны для визуальной проверки. `path` — адрес в приложении, `proto` — имя вида
 * в прототипе (`nav()`), чтобы позже снимать пары «прототип / приложение» автоматически.
 */
export interface ScreenShot {
  name:string
  path:string
  proto?:string
  /** Экран не читает данные — фикстуры и сессия не нужны. */
  standalone?:boolean
  /** Что нажать после загрузки: селектор кнопки (шторки, вкладки). */
  click?:string
}

export const screens:ScreenShot[] = [
  { name: 'kit', path: '/kit', standalone: true },
  { name: 'home', path: '/home', proto: 'home' },
  { name: 'metric-profit', path: '/home/metric/profit', proto: 'metric' },
  { name: 'sched', path: '/sched', proto: 'sched' },
  { name: 'sched-build', path: '/sched/build' },
  { name: 'sched-week', path: '/sched', proto: 'sched', click: 'button:has-text("Дни недели")' },
  { name: 'people', path: '/people', proto: 'people' },
  { name: 'employee', path: '/people/e1', proto: 'emp' },
  { name: 'money-fin', path: '/money?tab=fin', proto: 'money' },
  { name: 'money-pay', path: '/money?tab=pay', proto: 'money' },
  { name: 'money-ded', path: '/money?tab=ded', proto: 'money' },
  { name: 'deduction', path: '/money/ded/d1', proto: 'wbDetail' },
  { name: 'more', path: '/more', proto: 'more' },
  { name: 'wizard', path: '/sched/wizard', proto: 'wizard' },
  { name: 'templates', path: '/sched/templates', proto: 'tplList' },
  { name: 'share', path: '/sched/share', proto: 'share' },
]
