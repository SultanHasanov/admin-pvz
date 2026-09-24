import { useContext, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from './cn'
import { haptics } from './haptics'
import { ActionSlot, useLayout } from './layout'

export interface TabItem {
  id:string
  label:string
  icon:ReactNode
  /** Недоступный таб остаётся на месте, но гаснет: у сотрудника так выглядят «Люди». */
  disabled?:boolean
}

/**
 * Нижняя панель. Полупрозрачный фон цвета страницы с верхней линией — так панель
 * не выглядит приклеенной плашкой, а содержимое читается под ней при прокрутке.
 */
export function TabBar({ items, active, onSelect }:{
  items:TabItem[]
  active:string
  onSelect:(id:string) => void
}) {
  return <nav className="flex flex-none border-t border-tabbar-line bg-bg/94 px-1.5 pt-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
    {items.map(item => {
      const isActive = item.id === active
      return <button
        key={item.id}
        type="button"
        aria-current={isActive ? 'page' : undefined}
        disabled={item.disabled}
        className={cn(
          'tap flex flex-1 flex-col items-center gap-1 py-[3px]',
          item.disabled ? 'text-line-strong' : isActive ? 'text-accent' : 'text-muted-soft',
        )}
        onClick={() => { if (!isActive) { haptics.tap(); onSelect(item.id) } }}
      >
        {item.icon}
        <span className="text-axis font-medium">{item.label}</span>
      </button>
    })}
  </nav>
}

/**
 * Кнопка главного действия экрана. Висит над панелью табов, поэтому её низ считается
 * от `--tabbar-space`: иначе на телефонах с жестовой панелью она прилипает к краю.
 *
 * На десктопе таб-бара нет, и та же кнопка становится кнопкой топбара с подписью.
 */
export function Fab({ onClick, label = 'Добавить' }:{ onClick:() => void; label?:string }) {
  const { desktop } = useLayout()
  const slot = useContext(ActionSlot)

  if (desktop) return slot && createPortal(<button
    type="button"
    className="tap flex items-center gap-1.5 rounded-md bg-accent px-3.5 py-2 text-act font-semibold whitespace-nowrap text-white"
    onClick={() => { haptics.tap(); onClick() }}
  ><span aria-hidden className="text-[18px] leading-none font-light">+</span>{label}</button>, slot)

  return <button
    type="button"
    aria-label={label}
    className="tap absolute right-4 bottom-[calc(var(--tabbar-space)+16px)] z-20 flex size-[54px] items-center justify-center rounded-full bg-accent pb-1 text-[29px] leading-none font-light text-white shadow-[0_8px_22px_rgba(143,58,107,0.38)]"
    onClick={() => { haptics.tap(); onClick() }}
  >+</button>
}
