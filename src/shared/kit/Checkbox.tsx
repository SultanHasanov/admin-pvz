import { useId, type ReactNode } from 'react'
import { Checkbox as Base } from 'radix-ui'
import { haptics } from './haptics'

/**
 * Флажок с подписью. Подпись — отдельный `label for`, а не обёртка: так область нажатия
 * покрывает и текст, и сам квадрат, а текст в две строки не съезжает относительно флажка.
 */
export function Checkbox({ checked, onChange, children }:{
  checked:boolean
  onChange:(checked:boolean) => void
  children:ReactNode
}) {
  const id = useId()
  return <div className="flex items-start gap-2.5 py-1">
    <Base.Root
      id={id}
      checked={checked}
      onCheckedChange={value => { haptics.tap(); onChange(value === true) }}
      className="tap mt-px flex size-[22px] flex-none items-center justify-center rounded-xs border border-line-strong bg-surface data-[state=checked]:border-accent data-[state=checked]:bg-accent"
    >
      <Base.Indicator className="text-[13px] leading-none font-semibold text-white">✓</Base.Indicator>
    </Base.Root>
    <label htmlFor={id} className="text-row leading-[1.35]">{children}</label>
  </div>
}
