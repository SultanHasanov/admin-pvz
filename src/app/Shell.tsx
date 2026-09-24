import { useEffect, useMemo, type ReactNode } from 'react'
import { useLocation, type Location } from 'react-router-dom'
import { TabBar } from '../shared/kit/TabBar'
import { useKeyboardInset } from '../shared/kit/useKeyboardInset'
import { LayoutContext } from '../shared/kit/layout'
import { cn } from '../shared/kit/cn'
import { useIsDesktop, useIsMobile } from '../shared/responsive'
import { Stack } from './Stack'
import { Sidebar } from './Sidebar'
import { SheetHost } from './sheetRegistry'
import { useSheets } from './sheets'
import { useNav } from './nav'
import { roleOf, tabOf, tabsFor } from './tabs'
import { useOrg } from './OrgContext'

/**
 * Оболочка приложения: шапка и содержимое прокручиваются внутри, панель табов и шторки
 * живут поверх. Высота фиксирована на 100dvh, скролл забирает экран — см. kit.css.
 *
 * Не на телефоне (граница — `MOBILE_QUERY`) вместо таб-бара сайдбар: 248px от 1024px,
 * одни иконки в 72px на 768–1023px. Экраны те же — раскладку меняет кит по `LayoutContext`.
 */
export function AppShell({ render, gate }:{
  render:(location:Location) => ReactNode
  /** Слой поверх оболочки владельца — `PointGate` в приложении, на стенде его нет. */
  gate?:ReactNode
}) {
  const location = useLocation()
  const { setTab } = useNav()
  const desktop = !useIsMobile()
  const wide = useIsDesktop()
  useKeyboardInset()
  useDevSheetHandle()

  // Атрибут включает правила оболочки в kit.css: скролл забирает экран, body не прокручивается.
  // Вход и регистрация длиннее экрана и скроллятся по body — поэтому только пока оболочка смонтирована.
  useEffect(() => {
    const root = document.documentElement
    root.dataset.shell = 'app'
    return () => { delete root.dataset.shell }
  }, [])

  const role = roleOf(location.pathname)
  const tabs = tabsFor(role)
  const active = tabOf(location.pathname)
  const layout = useMemo(() => ({ desktop, narrow: false, title: tabs.find(tab => tab.id === active)?.label }), [desktop, tabs, active])

  return <div className={cn(
    'kit-root relative flex h-[100dvh] w-full overflow-hidden bg-bg',
    desktop ? 'flex-row' : 'mx-auto max-w-[520px] flex-col',
  )}>
    {desktop && <Sidebar role={role} compact={!wide}/>}
    <LayoutContext.Provider value={layout}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Stack render={render} desktop={desktop}/>
      </div>
    </LayoutContext.Provider>
    {!desktop && <TabBar
      items={tabs.map(tab => ({ id: tab.id, label: tab.label, icon: tab.icon, disabled: !tab.root }))}
      active={active}
      onSelect={id => setTab(id as typeof active)}
    />}
    <SheetHost/>
    {role === 'owner' && gate}
  </div>
}

/**
 * Окно поверх оболочки владельца, когда активных пунктов нет вовсе (все в архиве):
 * без пункта нечего показывать ни в графике, ни в деньгах. По умолчанию выбраны
 * «Все ПВЗ», поэтому само по себе отсутствие выбора окно не открывает.
 *
 * Отдельным компонентом, а не внутри `AppShell`: стенд `/kit` рендерит ту же оболочку
 * без входа и без `OrgProvider`, и `useOrg` в оболочке ронял его целиком.
 */
export function PointGate() {
  const location = useLocation()
  const { push } = useNav()
  const { points, loadingPoints } = useOrg()

  if (loadingPoints || points.some(point => !point.archivedAt) || location.pathname.startsWith('/more/points')) return null

  return <div className="absolute inset-0 z-50 flex items-center justify-center bg-bg p-4" role="dialog" aria-modal="true" aria-label="Нет пунктов выдачи">
    <div className="w-full max-w-md">
      <h1 className="mb-2 text-xl font-semibold">Нет пунктов выдачи</h1>
      <p className="mb-4 text-sub text-muted">Добавьте пункт — по нему строятся график и деньги.</p>
      <button type="button" className="rounded-md bg-accent px-4 py-3 text-white" onClick={() => push('/more/points/new')}>Добавить ПВЗ</button>
    </div>
  </div>
}

/**
 * Только в dev: `window.__openSheet(type, props)` открывает любую шторку.
 *
 * Нужна визуальному стенду — шторки сотрудника (`cantWork`, `reqVac`) собраны раньше
 * его экранов, и кнопок, которые их открывают, ещё нет. В сборку не попадает:
 * `import.meta.env.DEV` на этапе сборки заменяется на `false`, и ветка вырезается.
 */
function useDevSheetHandle() {
  const { open } = useSheets()
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const target = window as unknown as { __openSheet?:typeof open }
    target.__openSheet = open
    return () => { delete target.__openSheet }
  }, [open])
}
