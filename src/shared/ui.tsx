import { useEffect, type ReactNode } from 'react'
import { X, type LucideIcon } from 'lucide-react'

export function Title({ title, subtitle, children }:{ title:string; subtitle?:string; children?:ReactNode }) {
  return <div className="mb-5 flex flex-wrap items-center justify-between gap-3 sm:mb-6">
    <div className="min-w-0"><h1 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>{subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}</div>
    {children}
  </div>
}

export function Metric({ label, value, icon:Icon, tone = 'neutral' }:{ label:string; value:string; icon:LucideIcon; tone?:'green' | 'red' | 'neutral' }) {
  const styles = { green: 'bg-brand-50 text-brand-600', red: 'bg-red-50 text-red-600', neutral: 'bg-slate-100 text-slate-600' }
  return <div className="card p-3 sm:p-4">
    <div className="flex items-start justify-between gap-2"><span className="text-xs text-slate-500 sm:text-sm">{label}</span><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${styles[tone]}`}><Icon size={16}/></span></div>
    <p className="mt-3 text-lg font-bold break-words sm:mt-4 sm:text-xl">{value}</p>
  </div>
}

export function Modal({ title, onClose, children, footer }:{ title:string; onClose:() => void; children:ReactNode; footer?:ReactNode }) {
  useEffect(() => {
    const escape = (event:KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', escape)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', escape); document.body.style.overflow = '' }
  }, [onClose])
  return <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-4">
    <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 safe-b sm:max-w-xl sm:rounded-2xl sm:p-6" role="dialog" aria-modal="true">
      <div className="mb-4 flex items-start justify-between gap-3"><h2 className="text-lg font-semibold">{title}</h2><button aria-label="Закрыть" className="-m-2 p-2 text-slate-400" onClick={onClose}><X size={20}/></button></div>
      {children}
      {footer && <div className="mt-5 flex flex-wrap gap-2">{footer}</div>}
    </div>
  </div>
}

export function Field({ label, hint, children }:{ label:string; hint?:ReactNode; children:ReactNode }) {
  return <label className="block"><span className="label">{label}</span>{children}{hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}</label>
}

export function EmptyState({ text, action }:{ text:string; action?:ReactNode }) {
  return <div className="px-4 py-10 text-center text-sm text-slate-500">{text}{action && <div className="mt-4 flex justify-center">{action}</div>}</div>
}

export function Loading({ text = 'Загружаем…' }:{ text?:string }) {
  return <div className="px-4 py-10 text-center text-sm text-slate-400">{text}</div>
}

export function ErrorNote({ error }:{ error:unknown }) {
  if (!error) return null
  return <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error instanceof Error ? error.message : String(error)}</p>
}

export function Badge({ children, tone = 'slate' }:{ children:ReactNode; tone?:'slate' | 'green' | 'amber' | 'red' }) {
  const styles = { slate: 'bg-slate-100 text-slate-600', green: 'bg-brand-50 text-brand-600', amber: 'bg-amber-50 text-amber-700', red: 'bg-red-50 text-red-600' }
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-1 text-xs ${styles[tone]}`}>{children}</span>
}

export const confirmAction = (question:string) => window.confirm(question)
