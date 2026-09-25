import type { ReactNode, SVGProps } from 'react'
import { cn } from './cn'
import { tone as tones, type Tone } from './tokens'

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  size?:number
  strokeWidth?:number
}

const Icon = ({ size = 21, strokeWidth = 1.8, className, children, ...props }:IconProps & { children:ReactNode }) =>
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"
    className={cn('inline-block flex-none', className)} {...props}>
    <g stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">{children}</g>
  </svg>

/** Нижняя навигация: сохраняем плотные силуэты исходного прототипа. */
export const IconHome = ({ size = 21, ...props }:IconProps) => <Icon size={size} {...props}><path d="M3 20V10h5v10M9.5 20V5h5v15M16 20v-7h5v7" fill="currentColor" stroke="none"/></Icon>
export const IconSchedule = (props:IconProps) => <Icon {...props}><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 9h18M8 3v4M16 3v4M7 13h3v3H7zM14 13h3v3h-3z"/></Icon>
export const IconPeople = (props:IconProps) => <Icon {...props}><circle cx="9" cy="8" r="3.5"/><circle cx="17.5" cy="9" r="2.5"/><path d="M3 21c0-3.6 2.7-5.8 6-5.8s6 2.2 6 5.8M16 15.8c3 .2 5 2 5 4.7"/></Icon>
export const IconMoney = (props:IconProps) => <Icon {...props}><rect x="2.5" y="6" width="19" height="13" rx="3"/><circle cx="12" cy="12.5" r="3"/><path d="M6 10h.01M18 15h.01"/></Icon>
export const IconMore = ({ size = 21, ...props }:IconProps) => <Icon size={size} {...props}><circle cx="5" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="2" fill="currentColor" stroke="none"/></Icon>

export const IconPoint = (props:IconProps) => <Icon {...props}><path d="M4 10h16v11H4zM3 10l2-6h14l2 6M8 21v-6h5v6M3 10c0 1.7 1 2.7 2.5 2.7S8 11.7 8 10c0 1.7 1 2.7 2.5 2.7S13 11.7 13 10c0 1.7 1 2.7 2.5 2.7S18 11.7 18 10c0 1.7 1 2.7 3 2.7"/></Icon>
export const IconSettings = (props:IconProps) => <Icon {...props}><path d="M4 6h10M18 6h2M4 12h3M11 12h9M4 18h8M16 18h4"/><circle cx="16" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="14" cy="18" r="2"/></Icon>
export const IconRate = (props:IconProps) => <Icon {...props}><path d="M7 20V5h7.2a4 4 0 0 1 0 8H7M7 16h8"/></Icon>
export const IconPerson = (props:IconProps) => <Icon {...props}><circle cx="12" cy="8" r="4"/><path d="M4.5 21c.5-4.2 3.1-6.5 7.5-6.5s7 2.3 7.5 6.5"/></Icon>
export const IconInvite = (props:IconProps) => <Icon {...props}><circle cx="9" cy="8" r="3.5"/><path d="M3 20c.3-3.8 2.6-5.8 6-5.8 1.2 0 2.2.2 3.1.7M17 12v8M13 16h8"/></Icon>
export const IconIncome = (props:IconProps) => <Icon {...props}><path d="M12 3v13M7 11l5 5 5-5M4 21h16"/></Icon>
export const IconExpense = (props:IconProps) => <Icon {...props}><path d="M12 21V8M7 13l5-5 5 5M4 3h16"/></Icon>
export const IconAdvance = (props:IconProps) => <Icon {...props}><rect x="3" y="6" width="18" height="14" rx="3"/><path d="M16 10h5v6h-5a3 3 0 0 1 0-6Z"/><circle cx="16" cy="13" r=".7" fill="currentColor" stroke="none"/></Icon>
export const IconDeduction = (props:IconProps) => <Icon {...props}><path d="M5 3h14v18l-3-2-4 2-4-2-3 2zM8 8h8M8 12h5M15.5 15.5l3 3M18.5 15.5l-3 3"/></Icon>
export const IconRecurring = (props:IconProps) => <Icon {...props}><path d="M20 8a8 8 0 0 0-13.8-2L4 8M4 4v4h4M4 16a8 8 0 0 0 13.8 2l2.2-2M20 20v-4h-4"/></Icon>
export const IconCategory = (props:IconProps) => <Icon {...props}><path d="M3 12.5V5h7.5L21 15.5 15.5 21z"/><circle cx="8" cy="9" r="1.5"/></Icon>
export const IconHistory = (props:IconProps) => <Icon {...props}><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5M12 7v5l3.5 2"/></Icon>
export const IconTelegram = (props:IconProps) => <Icon {...props}><path d="m3 11 17-7-4 16-5-5-3 3 .5-5zM8.5 13 20 4"/></Icon>
export const IconSync = (props:IconProps) => <Icon {...props}><path d="M20 8a8 8 0 0 0-13.8-2L4 8M4 4v4h4M4 16a8 8 0 0 0 13.8 2l2.2-2M20 20v-4h-4"/></Icon>
export const IconTax = (props:IconProps) => <Icon {...props}><path d="m6 19 12-14"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/></Icon>
export const IconPayout = (props:IconProps) => <Icon {...props}><path d="M4 5h16v14H4zM4 9h16M8 14h5"/></Icon>
export const IconWarning = (props:IconProps) => <Icon {...props}><path d="M10.2 4.3 2.8 18a2 2 0 0 0 1.8 3h14.8a2 2 0 0 0 1.8-3L13.8 4.3a2 2 0 0 0-3.6 0Z"/><path d="M12 9v5M12 17.5h.01"/></Icon>
export const IconClock = (props:IconProps) => <Icon {...props}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></Icon>
export const IconSend = (props:IconProps) => <Icon {...props}><path d="m3 11 18-8-7 18-3-7zM11 14 21 3"/></Icon>
export const IconInstall = (props:IconProps) => <Icon {...props}><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></Icon>
export const IconCheck = (props:IconProps) => <Icon {...props}><path d="m5 12.5 4.2 4.2L19.5 6.5"/></Icon>
export const IconLock = (props:IconProps) => <Icon {...props}><rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></Icon>
export const IconBuilding = (props:IconProps) => <Icon {...props}><path d="M4 21V4h11v17M15 9h5v12M8 8h3M8 12h3M8 16h3M17.5 13h.01M17.5 17h.01"/></Icon>
export const IconReceipt = (props:IconProps) => <Icon {...props}><path d="M5 3h14v18l-3-2-4 2-4-2-3 2zM8 8h8M8 12h8M8 16h5"/></Icon>
export const IconRepair = (props:IconProps) => <Icon {...props}><path d="M14.5 6.5a4 4 0 0 0-5-5l2.4 2.4-2.8 2.8-2.4-2.4a4 4 0 0 0 5 5L20 17.6 17.6 20z"/></Icon>
export const IconConnection = (props:IconProps) => <Icon {...props}><path d="M5 9.5a10 10 0 0 1 14 0M8 13a5.8 5.8 0 0 1 8 0M11 16.5a1.5 1.5 0 0 1 2 0"/></Icon>

const turn = { right: 0, down: 90, left: 180, up: 270 } as const
export const Chevron = ({ dir = 'right', size = 18 }:{ dir?:keyof typeof turn; size?:number }) =>
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden className="inline-block flex-none" style={{ transform: `rotate(${turn[dir]}deg)` }}>
    <path d="M7.5 4.5 13 10l-5.5 5.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>

export function IconBox({ children, tone: t = 'neutral', size = 36, className }:{
  children:ReactNode
  tone?:Tone
  size?:32 | 36 | 40
  className?:string
}) {
  return <span aria-hidden className={cn('inline-flex flex-none items-center justify-center rounded-sm', className)}
    style={{ width: size, height: size, background: tones[t].bg, color: tones[t].fg }}>{children}</span>
}

export function StatusIcon({ status, size = 36 }:{ status:'done' | 'warning' | 'error' | 'waiting' | 'locked'; size?:32 | 36 | 40 }) {
  const config = {
    done: { tone: 'ok' as Tone, icon: <IconCheck size={18}/> },
    warning: { tone: 'warn' as Tone, icon: <IconWarning size={18}/> },
    error: { tone: 'bad' as Tone, icon: <IconWarning size={18}/> },
    waiting: { tone: 'info' as Tone, icon: <IconClock size={18}/> },
    locked: { tone: 'neutral' as Tone, icon: <IconLock size={17}/> },
  }[status]
  return <IconBox tone={config.tone} size={size}>{config.icon}</IconBox>
}
