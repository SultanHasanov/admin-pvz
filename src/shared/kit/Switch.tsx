import { Switch as Base } from 'radix-ui'
import { cn } from './cn'
import { haptics } from './haptics'

/**
 * Переключатель «включён / выключен» без подписи — подпись даёт строка, в которой он стоит,
 * поэтому `label` обязателен: без него экранный диктор прочитал бы просто «переключатель».
 */
export function Switch({ checked, onChange, label, disabled, className }:{
  checked:boolean
  onChange:(checked:boolean) => void
  label:string
  disabled?:boolean
  className?:string
}) {
  return <Base.Root
    checked={checked}
    disabled={disabled}
    aria-label={label}
    onCheckedChange={value => { haptics.tap(); onChange(value) }}
    className={cn(
      'tap relative inline-flex h-[26px] w-[44px] flex-none items-center rounded-full border border-line-strong bg-line-soft p-[2px] transition-colors disabled:opacity-50 data-[state=checked]:border-accent data-[state=checked]:bg-accent',
      className,
    )}
  >
    <Base.Thumb className="block size-[20px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.2)] transition-transform data-[state=checked]:translate-x-[18px]"/>
  </Base.Root>
}
