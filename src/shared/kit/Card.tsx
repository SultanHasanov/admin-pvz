import type { ReactNode } from 'react'
import { cn } from './cn'

/**
 * Белая карточка со скруглением 18px — основной контейнер прототипа.
 * `overflow-hidden` обязателен: внутри лежат строки со своими границами,
 * иначе они вылезают за скругление.
 */
export const Card = ({ children, className }:{ children:ReactNode; className?:string }) =>
  <div className={cn('overflow-hidden rounded-lg border border-line bg-surface', className)}>{children}</div>

/** Тёмная карточка главного показателя: прибыль на «Главной», остаток к выплате в «Деньгах». */
export function Hero({ label, value, note, onClick, children }:{
  label:ReactNode
  value:ReactNode
  note?:ReactNode
  onClick?:() => void
  /** Плитки метрик под основной цифрой. */
  children?:ReactNode
}) {
  return <div className="rounded-xl bg-ink px-[17px] pt-[17px] text-white">
    <div className="lbl text-white/55">{label}</div>
    {onClick
      ? <button type="button" onClick={onClick} className="tap block text-hero font-semibold tracking-[-0.035em] tabular-nums">{value}</button>
      : <div className="text-hero font-semibold tracking-[-0.035em] tabular-nums">{value}</div>}
    {note && <div className="pb-[13px] text-sub text-white/60">{note}</div>}
    {children}
  </div>
}

/**
 * Плитки внутри тёмной карточки. Сетка держится на однопиксельном зазоре, сквозь который
 * видно фон-разделитель — в прототипе это единственная «линия» на тёмном.
 */
export const HeroTiles = ({ children }:{ children:ReactNode }) =>
  <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md bg-white/13">{children}</div>

export function HeroTile({ label, value, color, onClick }:{
  label:ReactNode
  value:ReactNode
  /** Токен из kit/tokens.ts — плитки прототипа раскрашены по смыслу показателя. */
  color:string
  onClick?:() => void
}) {
  return <button type="button" onClick={onClick} className="tap bg-ink px-[13px] pt-3 pb-[13px] text-left active:bg-ink-soft">
    <div className="mb-[3px] text-tiny text-white/58">{label}</div>
    <div className="text-tile font-semibold tabular-nums" style={{ color }}>{value}</div>
  </button>
}

/**
 * Белая плитка показателя: «Заработано», «К выплате» на главной сотрудника. Тёмные
 * `HeroTile` живут внутри героя, эти — отдельной сеткой под ним.
 */
export function StatTile({ label, value, sub, color, onClick }:{
  label:ReactNode
  value:ReactNode
  sub?:ReactNode
  /** Токен из kit/tokens.ts. По умолчанию — основной цвет текста. */
  color?:string
  onClick?:() => void
}) {
  return <button
    type="button"
    onClick={onClick}
    className="tap rounded-[16px] border border-line bg-surface px-[15px] py-[14px] text-left"
  >
    <div className="text-mono text-muted">{label}</div>
    <div className="mt-1 text-stat font-semibold tabular-nums" style={{ color }}>{value}</div>
    {sub && <div className="mt-[3px] text-tiny text-muted">{sub}</div>}
  </button>
}

export const StatTiles = ({ children }:{ children:ReactNode }) =>
  <div className="grid grid-cols-2 gap-2">{children}</div>
