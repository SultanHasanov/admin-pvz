import type { ReactNode } from 'react'
import { cn } from './cn'
import { tone as tones, type Tone } from './tokens'
import { haptics } from './haptics'

/**
 * Список внутри карточки. Разделители — `divide-y`, а не border у каждой строки:
 * первая строка тогда автоматически без линии, как в прототипе.
 */
export const List = ({ children, className }:{ children:ReactNode; className?:string }) =>
  <div className={cn('divide-y divide-line-soft', className)}>{children}</div>

export interface ListRowProps {
  /** Аватар, точка статуса или число дня — то, что стоит слева. */
  leading?:ReactNode
  title:ReactNode
  sub?:ReactNode
  /** Правая колонка: сумма, время. Моноширинный — потому что это почти всегда цифры. */
  right?:ReactNode
  /** Подпись под правой колонкой: статус выплаты, состояние смены. */
  rightSub?:ReactNode
  rightSubTone?:Tone
  pill?:{ label:ReactNode; tone:Tone }
  chevron?:boolean
  /** Заголовок в две строки — тогда содержимое выравнивается по верху. */
  align?:'center' | 'start'
  onClick?:() => void
  className?:string
}

export function ListRow({
  leading, title, sub, right, rightSub, rightSubTone = 'neutral',
  pill, chevron, align = 'center', onClick, className,
}:ListRowProps) {
  const inner = <>
    {leading}
    <div className="min-w-0 flex-1">
      <div className="text-row leading-[1.3] font-medium">{title}</div>
      {sub && <div className="mt-[2px] truncate text-sub leading-[1.35] text-muted">{sub}</div>}
    </div>
    {(right || rightSub) && <div className="flex-none text-right">
      {right && <div className="font-mono text-sub font-medium tabular-nums">{right}</div>}
      {rightSub && <div className="mt-[3px] text-[11px] font-semibold" style={{ color: tones[rightSubTone].fg }}>{rightSub}</div>}
    </div>}
    {pill && <Pill tone={pill.tone}>{pill.label}</Pill>}
    {chevron && <div className="flex-none text-[17px] leading-none text-chevron">›</div>}
  </>

  const classes = cn(
    'flex w-full gap-[11px] px-[15px] py-3 text-left',
    align === 'start' ? 'items-start' : 'items-center',
    className,
  )

  if (!onClick) return <div className={classes}>{inner}</div>
  return <button
    type="button"
    className={cn(classes, 'tap active:bg-surface-soft')}
    onClick={() => { haptics.tap(); onClick() }}
  >{inner}</button>
}

/** Цветная пилюля состояния: «активен», «в отпуске», «оспаривается». */
export const Pill = ({ children, tone: t = 'neutral', className }:{ children:ReactNode; tone?:Tone; className?:string }) =>
  <div
    className={cn('flex-none rounded-xs px-2 py-1 text-[11px] font-semibold', className)}
    style={{ background: tones[t].bg, color: tones[t].fg }}
  >{children}</div>

/** Точка-маркер важности слева от строки уведомления. */
export const Dot = ({ tone: t = 'neutral' }:{ tone?:Tone }) =>
  <div className="mt-[5px] size-[7px] flex-none rounded-full" style={{ background: tones[t].fg }}/>

/** Инициалы сотрудника. Размер 34 — строка списка, 44 — карточка сотрудника. */
export function Avatar({ initials, tone: t = 'accent', size = 34 }:{ initials:string; tone?:Tone; size?:34 | 44 }) {
  return <div
    className={cn(
      'flex flex-none items-center justify-center font-semibold',
      size === 44 ? 'size-11 rounded-md text-[15px]' : 'size-[34px] rounded-sm text-[13px]',
    )}
    style={{ background: tones[t].bg, color: tones[t].fg }}
  >{initials}</div>
}
