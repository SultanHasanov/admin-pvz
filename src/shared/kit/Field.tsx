import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from './cn'
import { Label } from './Text'

/** Общая рамка поля. Кегль 16px обязателен: при меньшем iOS зумит страницу на фокусе. */
const control = 'w-full rounded-[13px] border border-line-strong bg-surface px-[15px] py-[14px] text-base outline-none placeholder:text-muted-faint focus:border-accent'

export function Field({ label, hint, error, children, className }:{
  label?:ReactNode
  /** Подсказка под полем: что именно запомнено, по какой ставке считается. */
  hint?:ReactNode
  error?:ReactNode
  children:ReactNode
  className?:string
}) {
  return <div className={cn('mb-[13px]', className)}>
    {label && <Label className="mb-[7px]">{label}</Label>}
    {children}
    {error
      ? <div className="mt-[6px] text-sub leading-[1.45] text-bad">{error}</div>
      : hint && <div className="mt-[6px] text-sub leading-[1.45] text-muted">{hint}</div>}
  </div>
}

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  label?:ReactNode
  hint?:ReactNode
  error?:ReactNode
}

export function TextField({ label, hint, error, type, ...rest }:TextFieldProps) {
  const id = useId()
  const [shown, setShown] = useState(false)
  const secret = type === 'password'
  return <Field label={label && <label htmlFor={id}>{label}</label>} hint={hint} error={error}>
    {secret
      ? <div className="relative">
        <input id={id} className={cn(control, 'pr-12')} aria-invalid={!!error} type={shown ? 'text' : 'password'} {...rest}/>
        <button
          type="button"
          aria-label={shown ? 'Скрыть пароль' : 'Показать пароль'}
          className="tap absolute inset-y-0 right-1 flex w-11 items-center justify-center text-muted"
          onClick={() => setShown(!shown)}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path d="M1.8 10S4.8 4.5 10 4.5 18.2 10 18.2 10 15.2 15.5 10 15.5 1.8 10 1.8 10Z" stroke="currentColor" strokeWidth="1.6"/>
            <circle cx="10" cy="10" r="2.6" stroke="currentColor" strokeWidth="1.6"/>
            {shown && <path d="M3 17 17 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>}
          </svg>
        </button>
      </div>
      : <input id={id} className={control} aria-invalid={!!error} type={type} {...rest}/>}
  </Field>
}

/**
 * Денежное поле. Клавиатура числовая, но `type="text"`: у `type="number"` на телефоне
 * прокручивается значение от случайного свайпа, а точность копеек ломается.
 */
export function MoneyField({ label, hint, error, value, onValueChange, placeholder = '0' }:{
  label?:ReactNode
  hint?:ReactNode
  error?:ReactNode
  /** Строка рублей, как её видит пользователь: «2 200». Копейки считает вызывающий код. */
  value:string
  onValueChange:(value:string) => void
  placeholder?:string
}) {
  const id = useId()
  return <Field label={label && <label htmlFor={id}>{label}</label>} hint={hint} error={error}>
    <div className="relative">
      <input
        id={id}
        className={cn(control, 'pr-9 font-mono tabular-nums')}
        inputMode="numeric"
        autoComplete="off"
        value={value}
        aria-invalid={!!error}
        placeholder={placeholder}
        onChange={event => {
          // Пробелы-разделители расставляем сами, чтобы курсор не прыгал от чужого форматирования.
          const digits = event.target.value.replace(/[^\d]/g, '')
          onValueChange(digits ? Number(digits).toLocaleString('ru-RU').replace(/ /g, ' ') : '')
        }}
      />
      <span className="pointer-events-none absolute top-1/2 right-[15px] -translate-y-1/2 text-base text-muted">₽</span>
    </div>
  </Field>
}

export function TextArea({ label, hint, value, onValueChange, placeholder, rows = 3 }:{
  label?:ReactNode
  hint?:ReactNode
  value:string
  onValueChange:(value:string) => void
  placeholder?:string
  rows?:number
}) {
  const id = useId()
  return <Field label={label && <label htmlFor={id}>{label}</label>} hint={hint}>
    <textarea
      id={id}
      rows={rows}
      className={cn(control, 'resize-none leading-[1.4]')}
      value={value}
      placeholder={placeholder}
      onChange={event => onValueChange(event.target.value)}
    />
  </Field>
}

/** Предупреждение в шторке: «прошлые смены не пересчитываются», «месяц уже закрыт». */
export const Banner = ({ children, tone = 'warn' }:{ children:ReactNode; tone?:'warn' | 'bad' | 'info' }) =>
  <div className={cn(
    'mb-[11px] rounded-[13px] border px-[13px] py-3 text-[13px] leading-[1.45]',
    tone === 'warn' && 'border-warn-banner-line bg-warn-banner text-warn-ink',
    tone === 'bad' && 'border-bad-tint-2 bg-bad-tint text-bad-strong',
    tone === 'info' && 'border-info-tint-2 bg-info-tint text-info',
  )}>{children}</div>
