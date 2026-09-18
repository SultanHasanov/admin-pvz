import type { ReactNode } from 'react'
import { cn } from './cn'
import { haptics } from './haptics'

/**
 * Каркас экрана: шапка и ряд фильтров не двигаются, прокручивается только содержимое.
 * Скролл живёт здесь, а не на странице — иначе вся оболочка тянется «резинкой»
 * и приложение сразу читается как сайт.
 */
export function Screen({ header, filters, children, footer }:{
  header?:ReactNode
  filters?:ReactNode
  children:ReactNode
  /** Липкая панель действий поверх содержимого: «Поставить сотрудника», «Применить». */
  footer?:ReactNode
}) {
  // data-screen — метка для стенда снимков: по ней видно, что экран уже смонтирован.
  return <div data-screen className="flex min-h-0 flex-1 flex-col">
    {header}
    {filters}
    <div className="scroll-y flex-1 px-4 pt-2 pb-5">{children}</div>
    {footer && <div className="flex-none border-t border-line bg-surface px-4 py-3 pb-[calc(12px+var(--kb))]">{footer}</div>}
  </div>
}

/**
 * Шапка экрана. Кегль 21px и отрицательный трекинг — как в прототипе:
 * заголовок работает и как название раздела, и как «место» в стеке навигации.
 */
export function Header({ title, onBack, action, bell }:{
  title:ReactNode
  onBack?:() => void
  /** Текстовое действие справа: «Готово», «Изменить», «Выбрать». */
  action?:ReactNode
  /** Колокольчик со счётчиком — только на главных экранах владельца и сотрудника. */
  /** `count` строкой — чтобы передать «9+»: две цифры в кружок 16px не помещаются. */
  bell?:{ count:number | string | null; onClick:() => void }
}) {
  return <div className="flex min-h-[38px] flex-none items-center gap-2 px-4 pt-0.5">
    {onBack && <button
      type="button"
      aria-label="Назад"
      className="tap -ml-[7px] flex h-[30px] w-7 items-center justify-center pb-[5px] text-[28px] leading-none text-accent"
      onClick={() => { haptics.tap(); onBack() }}
    >‹</button>}
    <div className="flex-1 truncate text-[21px] font-semibold tracking-[-0.025em]">{title}</div>
    {bell && <Bell {...bell}/>}
    {action}
  </div>
}

/** Колокольчик со счётчиком. Вынесен, чтобы стоять и в шапке, и в ряду фильтров. */
export function Bell({ count, onClick }:{ count:number | string | null; onClick:() => void }) {
  return <button
      type="button"
      aria-label="Уведомления"
      className="tap relative flex size-9 items-center justify-center"
      onClick={() => { haptics.tap(); onClick() }}
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
        <path d="M5 8.2a5 5 0 0 1 10 0v3.3l1.3 2.2H3.7L5 11.5V8.2Z" stroke="currentColor" strokeWidth="1.6"/>
        <path d="M8.2 16.2a1.9 1.9 0 0 0 3.6 0" stroke="currentColor" strokeWidth="1.6"/>
      </svg>
      {count !== null && <span className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-lg bg-accent px-1 text-[10px] font-semibold text-white">
        {count}
      </span>}
    </button>
}

/** Ряд фильтров под шапкой: выбранный ПВЗ и месяц. Прокручивается, если чипов больше двух. */
export const FilterRow = ({ children, className }:{ children:ReactNode; className?:string }) =>
  <div className={cn('scroll-x flex flex-none gap-[7px] px-4 pt-[9px] pb-1', className)}>{children}</div>
