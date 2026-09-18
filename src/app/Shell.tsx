import { useEffect, type ReactNode } from 'react'
import { useLocation, type Location } from 'react-router-dom'
import { TabBar } from '../shared/kit/TabBar'
import { Toaster } from '../shared/kit/Toaster'
import { UpdatePrompt } from './UpdatePrompt'
import { useKeyboardInset } from '../shared/kit/useKeyboardInset'
import { Stack } from './Stack'
import { SheetHost } from './sheetRegistry'
import { useSheets } from './sheets'
import { useNav } from './nav'
import { roleOf, tabOf, tabsFor } from './tabs'

/**
 * Оболочка приложения: шапка и содержимое прокручиваются внутри, панель табов и шторки
 * живут поверх. Высота фиксирована на 100dvh, скролл забирает экран — см. kit.css.
 *
 * Пока десктопная раскладка не сделана (фаза 8), на широком экране показываем ту же
 * телефонную колонку по центру: это честнее, чем растянутый на всю ширину телефон.
 */
export function AppShell({ render }:{ render:(location:Location) => ReactNode }) {
  const location = useLocation()
  const { setTab } = useNav()
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

  return <div className="kit-root relative mx-auto flex h-[100dvh] w-full max-w-[520px] flex-col overflow-hidden bg-bg">
    <Stack render={render}/>
    <TabBar
      items={tabs.map(tab => ({ id: tab.id, label: tab.label, icon: tab.icon, disabled: !tab.root }))}
      active={active}
      onSelect={id => setTab(id as typeof active)}
    />
    <SheetHost/>
    <Toaster/>
    <UpdatePrompt/>
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
