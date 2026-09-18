import { Toaster as Sonner, toast as sonner } from 'sonner'
import { haptics } from './haptics'

/**
 * Тосты прототипа: тёмная плашка сверху, под вырезом экрана, галочка слева, одна строка текста.
 * Живут 2,6 секунды — столько же, сколько в прототипе (`toast()` там сбрасывает таймер).
 */
export const Toaster = () => <Sonner
  position="top-center"
  duration={2600}
  visibleToasts={2}
  offset="calc(env(safe-area-inset-top) + 12px)"
  gap={8}
  toastOptions={{
    unstyled: true,
    classNames: {
      toast: 'flex w-[calc(100vw-36px)] items-center gap-2.5 rounded-[15px] bg-ink px-[15px] py-[13px] text-row font-medium text-white shadow-[0_10px_30px_rgba(27,22,20,0.28)]',
    },
  }}
/>

const mark = (symbol:string, color:string) =>
  <span className="flex size-[22px] flex-none items-center justify-center rounded-full text-[13px] font-semibold" style={{ background: color, color: '#fff' }}>{symbol}</span>

/** Подтверждение действия: операция добавлена, смена назначена, аванс выдан. */
export const toastDone = (message:string) => {
  haptics.success()
  sonner.custom(() => <>{mark('✓', 'var(--color-ok)')}<span>{message}</span></>)
}

/** Действие прошло, но с оговоркой: часть дней пропущена, месяц уже закрыт. */
export const toastWarn = (message:string) => {
  haptics.warn()
  sonner.custom(() => <>{mark('!', 'var(--color-warn)')}<span>{message}</span></>)
}

export const toastError = (message:string) => {
  haptics.error()
  sonner.custom(() => <>{mark('✕', 'var(--color-bad)')}<span>{message}</span></>)
}
