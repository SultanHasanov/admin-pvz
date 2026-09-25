import type { ReactNode } from 'react'
import { cn } from './cn'
import { haptics } from './haptics'
import { Chevron, IconConnection } from './icons'

/** Чип-фильтр в шапке экрана: выбранный ПВЗ и месяц. */
export function Chip({ children, onClick, active }:{ children:ReactNode; onClick:() => void; active?:boolean }) {
  return <button
    type="button"
    className={cn(
      'tap flex flex-none items-center gap-1.5 rounded-sm border px-3 py-[7px] text-act font-medium whitespace-nowrap',
      active ? 'border-accent bg-accent-tint text-accent' : 'border-line bg-surface text-ink',
    )}
    onClick={() => { haptics.tap(); onClick() }}
  >
    <span className="max-w-36 truncate">{children}</span>
    <span className="text-muted"><Chevron dir="down" size={16}/></span>
  </button>
}

/** Пустое состояние раздела: одна строка «что здесь появится» и, если есть, действие. */
export const EmptyState = ({ title, sub, action, visual }:{ title:ReactNode; sub?:ReactNode; action?:ReactNode; visual?:ReactNode }) =>
  <div className="px-6 py-10 text-center">
    {visual && <div className="mx-auto mb-3 flex h-28 max-w-44 items-center justify-center" aria-hidden>{visual}</div>}
    <div className="text-row font-medium">{title}</div>
    {sub && <div className="mx-auto mt-1.5 max-w-64 text-sub leading-[1.45] text-muted">{sub}</div>}
    {action && <div className="mt-4 flex justify-center">{action}</div>}
  </div>

/**
 * Заглушка на время загрузки. Пульсация, а не спиннер: экран сразу принимает свою форму,
 * и при появлении данных ничего не прыгает.
 */
export const Skeleton = ({ className }:{ className?:string }) =>
  <div className={cn('animate-pulse rounded-sm bg-line-soft motion-reduce:animate-none', className)}/>

export const SkeletonRows = ({ rows = 3 }:{ rows?:number }) =>
  <div className="divide-y divide-line-soft">
    {Array.from({ length: rows }, (_, index) => <div key={index} className="flex items-center gap-[11px] px-[15px] py-3">
      <Skeleton className="size-[34px] rounded-sm"/>
      <div className="flex-1">
        <Skeleton className="h-3.5 w-1/2"/>
        <Skeleton className="mt-2 h-3 w-1/3"/>
      </div>
      <Skeleton className="h-3.5 w-14"/>
    </div>)}
  </div>

/** Сообщение об ошибке запроса с повтором — единый вид для всех экранов. */
export const ErrorNote = ({ error, onRetry }:{ error:unknown; onRetry?:() => void }) =>
  <div className="rounded-lg border border-bad-tint-2 bg-bad-tint px-[15px] py-3">
    <div className="flex items-center gap-2 text-row font-medium text-bad-strong"><IconConnection size={19}/>Не удалось загрузить</div>
    <div className="mt-1 text-sub leading-[1.4] text-bad-strong/80">
      {error instanceof Error ? error.message : 'Проверьте соединение и попробуйте снова'}
    </div>
    {onRetry && <button type="button" className="tap mt-2 text-act font-semibold text-bad-strong" onClick={onRetry}>Повторить</button>}
  </div>

export type IllustrationName = 'pickup-point' | 'team' | 'schedule' | 'finance' | 'setup-complete'

/** Генеративная spot-иллюстрация: фиксированная рамка не даёт контенту прыгать при загрузке. */
export function Illustration({ name, className }:{ name:IllustrationName; className?:string }) {
  return <picture className={cn('block size-full', className)}>
    <source srcSet={`/illustrations/${name}-512.webp`} type="image/webp"/>
    <img
      src={`/illustrations/${name}-512.png`}
      alt=""
      aria-hidden="true"
      width="512"
      height="512"
      loading="lazy"
      decoding="async"
      className="size-full object-contain"
    />
  </picture>
}
