import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'
import { haptics } from './haptics'

type Variant = 'primary' | 'secondary' | 'danger' | 'quiet'

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?:Variant
  /** Во всю ширину — вид главной кнопки в футере шторки. */
  block?:boolean
  className?:string
  children:ReactNode
}

const variants:Record<Variant, string> = {
  primary: 'bg-accent text-white',
  secondary: 'border border-line bg-surface text-ink',
  danger: 'border border-bad-tint-2 bg-bad-tint text-bad-strong',
  quiet: 'bg-line-soft text-muted-strong',
}

/**
 * Кнопка действия. Padding 16px и кегль 16px — из футера шторки прототипа:
 * это же и минимальная цель для пальца, и защита от зума поля рядом на iOS.
 */
export function Button({ variant = 'primary', block, className, onClick, children, ...rest }:ButtonProps) {
  return <button
    type="button"
    className={cn(
      'tap rounded-md p-4 text-center text-base font-semibold disabled:opacity-40',
      variants[variant],
      block && 'w-full',
      className,
    )}
    onClick={event => { haptics.tap(); onClick?.(event) }}
    {...rest}
  >{children}</button>
}

/**
 * Текстовое действие — в хедере экрана и в заголовке раздела.
 * Отступ 6px по вертикали и 2px по горизонтали: цель для пальца больше, чем сам текст.
 */
export function TextButton({ children, onClick, tone = 'accent', className }:{
  children:ReactNode
  onClick:() => void
  tone?:'accent' | 'muted' | 'danger'
  className?:string
}) {
  return <button
    type="button"
    className={cn(
      'tap px-[2px] py-1.5 text-act font-medium',
      tone === 'accent' && 'text-accent',
      tone === 'muted' && 'text-muted',
      tone === 'danger' && 'text-bad',
      className,
    )}
    onClick={() => { haptics.tap(); onClick() }}
  >{children}</button>
}

/** Плитка быстрого действия: смысловая иконка в цветном квадрате и подпись. */
export function ActionTile({ icon, sign, label, tone, onClick }:{
  icon?:ReactNode
  /** @deprecated Оставлен для совместимости старых экранов; новые плитки используют icon. */
  sign?:ReactNode
  label:ReactNode
  tone:{ bg:string; fg:string }
  onClick:() => void
}) {
  return <button
    type="button"
    className="tap rounded-[15px] border border-line bg-surface px-[14px] py-[13px] text-left active:border-accent"
    onClick={() => { haptics.tap(); onClick() }}
  >
    <div
      className="mb-[9px] flex size-[26px] items-center justify-center rounded-[9px] text-[15px] font-semibold"
      style={{ background: tone.bg, color: tone.fg }}
    >{icon ?? sign}</div>
    <div className="text-act leading-[1.25] font-medium">{label}</div>
  </button>
}
