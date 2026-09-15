import { BarChart3, Building2, CalendarDays, CircleDollarSign, ClipboardList, MessageCircle, Settings, Users, Wallet } from 'lucide-react'
import type { ModuleKey } from '../entities/types'

export interface NavLinkItem {
  to:string
  title:string
  icon:typeof BarChart3
  module?:ModuleKey
  /** Попадает в нижний таб-бар на телефоне. */
  primary?:boolean
}

/** Пункт меню виден, пока его модуль включён в настройках. */
export const links:NavLinkItem[] = [
  { to: '/', title: 'Сегодня', icon: BarChart3, primary: true },
  { to: '/points', title: 'ПВЗ', icon: Building2 },
  { to: '/employees', title: 'Сотрудники', icon: Users, module: 'employees' },
  { to: '/shifts', title: 'Смены', icon: CalendarDays, module: 'shifts', primary: true },
  { to: '/finance', title: 'Финансы', icon: Wallet, module: 'expenses', primary: true },
  { to: '/salary', title: 'Зарплаты', icon: CircleDollarSign, module: 'salary', primary: true },
  { to: '/deductions', title: 'Удержания WB', icon: ClipboardList, module: 'wb_deductions' },
  { to: '/telegram', title: 'Telegram', icon: MessageCircle, module: 'telegram' },
  { to: '/settings', title: 'Настройки', icon: Settings },
]

const TAB_SLOTS = 4

/**
 * Четыре таба для нижней панели.
 * Модуль отключён — слот не пустует, добираем следующими из общего порядка.
 */
export function primaryTabs(visible:NavLinkItem[]) {
  const picked = visible.filter(link => link.primary).slice(0, TAB_SLOTS)
  for (const link of visible) {
    if (picked.length >= TAB_SLOTS) break
    if (!picked.includes(link)) picked.push(link)
  }
  return picked
}

export const screenTitle = (pathname:string) => links.find(link => link.to === pathname)?.title ?? 'PVZ Control'
