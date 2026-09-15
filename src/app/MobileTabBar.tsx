import { useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { MoreHorizontal } from 'lucide-react'
import { links, primaryTabs } from './navigation'
import { useOrg } from './OrgContext'

/**
 * Нижняя панель на телефоне: четыре основных раздела и «Ещё» для остальных.
 * Подпись у иконки обязательна — без неё таб не читается.
 */
export function MobileTabBar({ onMore }:{ onMore:() => void }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { isModuleEnabled } = useOrg()

  const tabs = useMemo(
    () => primaryTabs(links.filter(link => !link.module || isModuleEnabled(link.module))),
    [isModuleEnabled],
  )
  const inTabs = tabs.some(tab => tab.to === pathname)

  return <nav className="tabbar" aria-label="Основная навигация">
    {tabs.map(tab => {
      const active = tab.to === pathname
      return <button
        key={tab.to} type="button" className="tabbar__item"
        data-active={active} aria-current={active ? 'page' : undefined}
        onClick={() => navigate(tab.to)}
      >
        <tab.icon size={22} strokeWidth={active ? 2.4 : 1.8}/>
        <span>{tab.title}</span>
      </button>
    })}
    <button type="button" className="tabbar__item" data-active={!inTabs} onClick={onMore}>
      <MoreHorizontal size={22} strokeWidth={inTabs ? 1.8 : 2.4}/>
      <span>Ещё</span>
    </button>
  </nav>
}
