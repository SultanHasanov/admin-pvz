import type { ReactNode } from 'react'
import { cn } from './cn'

/** Моно-капс над полем или блоком: «ЧИСТАЯ ПРИБЫЛЬ · СЕНТЯБРЬ». */
export const Label = ({ children, className }:{ children:ReactNode; className?:string }) =>
  <div className={cn('lbl', className)}>{children}</div>

/**
 * Заголовок раздела внутри экрана со счётчиком справа.
 * Отступ сверху зашит в компонент: в прототипе он одинаковый у всех разделов (19px).
 */
export function SectionTitle({ children, count, action, className }:{
  children:ReactNode
  count?:number | null
  action?:ReactNode
  className?:string
}) {
  return <div className={cn('mt-[19px] mb-[9px] flex items-center gap-2', className)}>
    <div className="text-sec font-semibold">{children}</div>
    {!!count && <div className="flex h-[19px] min-w-[19px] items-center justify-center rounded-[10px] bg-accent px-1.5 text-tiny font-semibold text-white">
      {count > 99 ? '99+' : count}
    </div>}
    {action && <><div className="flex-1"/>{action}</>}
  </div>
}

/** Сумма или время моноширинным: цифры не пляшут при пересчёте. */
export const Num = ({ children, className }:{ children:ReactNode; className?:string }) =>
  <span className={cn('font-mono tabular-nums', className)}>{children}</span>
