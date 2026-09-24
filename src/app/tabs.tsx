import type { ReactNode } from 'react'
import { IconHome, IconMoney, IconMore, IconPeople, IconSchedule } from '../shared/kit/icons'

export type TabId = 'home' | 'sched' | 'people' | 'money' | 'more'
export type AppRole = 'owner' | 'employee'

export interface TabDef {
  id:TabId
  label:string
  /** Корень таба. Пустой — таб недоступен в этой роли. */
  root:string
  icon:ReactNode
  /** Подпункты второго уровня — только в сайдбаре десктопа, на телефоне их роль играют экраны. */
  subs?:SubDef[]
}

export interface SubDef {
  label:string
  /** Адрес, в том числе с вкладкой: `/money?tab=pay`. */
  to:string
  /** Вложенные адреса, при которых подпункт тоже подсвечен: карточка удержания — под «Удержаниями». */
  also?:RegExp
}

/**
 * Пять табов в обеих ролях, потому что панель не должна перестраиваться при смене роли:
 * у сотрудника «Люди» остаются на месте, но погашены — иначе положение остальных кнопок
 * зависит от роли, и мышечная память ломается.
 */
export const ownerTabs:TabDef[] = [
  { id: 'home', label: 'Главная', root: '/home', icon: <IconHome/> },
  {
    id: 'sched', label: 'График', root: '/sched', icon: <IconSchedule/>,
    subs: [
      { label: 'Заполнить график', to: '/sched/build' },
      { label: 'Поделиться', to: '/sched/share' },
    ],
  },
  { id: 'people', label: 'Люди', root: '/people', icon: <IconPeople/> },
  {
    id: 'money', label: 'Деньги', root: '/money', icon: <IconMoney/>,
    subs: [
      { label: 'Операции', to: '/money?tab=fin' },
      { label: 'Зарплаты', to: '/money?tab=pay' },
      { label: 'Удержания', to: '/money?tab=ded', also: /^\/money\/ded\// },
      { label: 'Журнал операций', to: '/money/ops' },
      { label: 'Постоянные расходы', to: '/money/recurring' },
      { label: 'Категории', to: '/money/categories' },
    ],
  },
  {
    id: 'more', label: 'Ещё', root: '/more', icon: <IconMore/>,
    subs: [
      { label: 'Пункты выдачи', to: '/more/points' },
      { label: 'Настройки', to: '/more/settings' },
      { label: 'Telegram-боты', to: '/more/telegram' },
    ],
  },
]

export const employeeTabs:TabDef[] = [
  { id: 'home', label: 'Главная', root: '/me', icon: <IconHome/> },
  { id: 'sched', label: 'График', root: '/me/sched', icon: <IconSchedule/> },
  { id: 'people', label: 'Люди', root: '', icon: <IconPeople/> },
  {
    id: 'money', label: 'Деньги', root: '/me/money', icon: <IconMoney/>,
    subs: [{ label: 'Мои удержания', to: '/me/money/deductions' }],
  },
  { id: 'more', label: 'Профиль', root: '/me/profile', icon: <IconMore/> },
]

/**
 * Подсвечен ли подпункт. Вкладка сравнивается с `?tab=`, а её отсутствие — с первой
 * вкладкой: `/money` без параметра и есть «Операции».
 */
export function subActive(sub:SubDef, pathname:string, search:string) {
  const [path, query] = sub.to.split('?')
  if (sub.also?.test(pathname)) return true
  if (!query) return pathname === path || pathname.startsWith(`${path}/`)
  if (pathname !== path) return false
  const tabIn = (to:string) => new URLSearchParams(to.split('?')[1]).get('tab')
  const siblings = tabsFor(roleOf(pathname)).flatMap(tab => tab.subs ?? []).filter(item => item.to.startsWith(`${path}?`))
  return (new URLSearchParams(search).get('tab') ?? tabIn(siblings[0].to)) === tabIn(sub.to)
}

export const tabsFor = (role:AppRole) => role === 'employee' ? employeeTabs : ownerTabs

/**
 * Таб по текущему пути. Сравниваем от самого длинного корня: `/me/sched` иначе
 * попал бы в таб `/me`, потому что тот тоже совпадает по префиксу.
 */
export function tabOf(pathname:string):TabId {
  const roots = [...ownerTabs, ...employeeTabs]
    .filter(tab => tab.root)
    .sort((a, b) => b.root.length - a.root.length)
  const match = roots.find(tab => pathname === tab.root || pathname.startsWith(`${tab.root}/`))
  return match?.id ?? 'home'
}

export const roleOf = (pathname:string):AppRole => pathname === '/me' || pathname.startsWith('/me/') ? 'employee' : 'owner'

export const tabRoot = (tab:TabId, role:AppRole = 'owner') =>
  tabsFor(role).find(item => item.id === tab)?.root || tabsFor(role)[0].root
