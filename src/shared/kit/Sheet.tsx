import type { ReactNode } from 'react'
import { Drawer } from 'vaul'
import { Dialog } from 'radix-ui'
import { useIsMobile } from '../responsive'
import { cn } from './cn'

interface SheetProps {
  open:boolean
  onClose:() => void
  title:ReactNode
  /** Вторая строка заголовка: ПВЗ и дата, сколько выбрано дней, за какой месяц. */
  sub?:ReactNode
  children:ReactNode
  /** Липкий футер с главным действием. Поднимается над клавиатурой через --kb. */
  footer?:ReactNode
  /** Шаг, который нельзя пропустить: закрытие только кнопкой. */
  dismissible?:boolean
}

const Body = ({ children }:{ children:ReactNode }) =>
  <div className="scroll-y flex-1 px-[18px] pt-1 pb-5">{children}</div>

const Head = ({ title, sub, onClose }:{ title:ReactNode; sub?:ReactNode; onClose:() => void }) =>
  <div className="flex flex-none items-start gap-2.5 px-[18px] pt-[9px] pb-1.5">
    <div className="flex-1">
      <div className="text-[19px] leading-[1.2] font-semibold tracking-[-0.02em]">{title}</div>
      {sub && <div className="mt-[3px] text-sub text-muted">{sub}</div>}
    </div>
    <button
      type="button"
      aria-label="Закрыть"
      className="tap flex size-7 flex-none items-center justify-center rounded-full bg-track text-[15px] text-muted-strong"
      onClick={onClose}
    >✕</button>
  </div>

const Footer = ({ children }:{ children:ReactNode }) =>
  <div className="flex-none px-[18px] pt-2 pb-[calc(18px+env(safe-area-inset-bottom)+var(--kb))]">{children}</div>

/**
 * Нижняя шторка — основная форма взаимодействия в прототипе: в ней живут все 38 диалогов.
 *
 * На телефоне это vaul: он тянется за пальцем, закрывается по скорости броска, умеет
 * вложенность и сам поднимает поле над клавиатурой. На мыши перетаскивание бессмысленно,
 * поэтому там обычный центрированный диалог с тем же содержимым.
 */
export function Sheet({ open, onClose, title, sub, children, footer, dismissible = true }:SheetProps) {
  const mobile = useIsMobile()
  const change = (next:boolean) => { if (!next) onClose() }

  if (mobile) return <Drawer.Root open={open} onOpenChange={change} dismissible={dismissible} repositionInputs>
    <Drawer.Portal>
      <Drawer.Overlay className="fixed inset-0 z-40 bg-ink/40"/>
      <Drawer.Content
        aria-describedby={undefined}
        className="fixed inset-x-0 bottom-0 z-40 flex max-h-[86dvh] flex-col rounded-t-2xl bg-bg shadow-[0_-10px_34px_rgba(27,22,20,0.18)] outline-none"
      >
        <div className="flex flex-none justify-center pt-[9px]">
          <div className="h-1 w-[38px] rounded-[3px] bg-handle"/>
        </div>
        <Drawer.Title asChild><Head title={title} sub={sub} onClose={onClose}/></Drawer.Title>
        <Body>{children}</Body>
        {footer && <Footer>{footer}</Footer>}
      </Drawer.Content>
    </Drawer.Portal>
  </Drawer.Root>

  return <Dialog.Root open={open} onOpenChange={change}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40"/>
      <Dialog.Content
        aria-describedby={undefined}
        onInteractOutside={event => { if (!dismissible) event.preventDefault() }}
        className={cn(
          'fixed top-1/2 left-1/2 z-40 flex max-h-[86dvh] w-[560px] max-w-[calc(100vw-32px)]',
          '-translate-1/2 flex-col rounded-xl bg-bg pt-2 shadow-[0_18px_50px_rgba(27,22,20,0.22)] outline-none',
        )}
      >
        <Dialog.Title asChild><Head title={title} sub={sub} onClose={onClose}/></Dialog.Title>
        <Body>{children}</Body>
        {footer && <Footer>{footer}</Footer>}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}
