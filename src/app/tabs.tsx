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
}

/**
 * Пять табов в обеих ролях, потому что панель не должна перестраиваться при смене роли:
 * у сотрудника «Люди» остаются на месте, но погашены — иначе положение остальных кнопок
 * зависит от роли, и мышечная память ломается.
 */
export const ownerTabs:TabDef[] = [
  { id: 'home', label: 'Главная', root: '/home', icon: <IconHome/> },
  { id: 'sched', label: 'График', root: '/sched', icon: <IconSchedule/> },
  { id: 'people', label: 'Люди', root: '/people', icon: <IconPeople/> },
  { id: 'money', label: 'Деньги', root: '/money', icon: <IconMoney/> },
  { id: 'more', label: 'Ещё', root: '/more', icon: <IconMore/> },
]

export const employeeTabs:TabDef[] = [
  { id: 'home', label: 'Главная', root: '/me', icon: <IconHome/> },
  { id: 'sched', label: 'График', root: '/me/sched', icon: <IconSchedule/> },
  { id: 'people', label: 'Люди', root: '', icon: <IconPeople/> },
  { id: 'money', label: 'Деньги', root: '/me/money', icon: <IconMoney/> },
  { id: 'more', label: 'Профиль', root: '/me/profile', icon: <IconMore/> },
]

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
