import { cn } from '../../shared/kit/cn'
import { haptics } from '../../shared/kit/haptics'
import { Chevron } from '../../shared/kit/icons'
import { tone } from '../../shared/kit/tokens'
import type { SetupStatus } from '../../entities/setup'
import { useNav } from '../../app/nav'
import { useSetup } from './useSetup'

/** Полоса прогресса по делениям — тот же приём, что шаги регистрации. */
export const SetupBar = ({ done, total }:{ done:number; total:number }) =>
  <div className="flex gap-1.5">
    {Array.from({ length: total }, (_, index) =>
      <div key={index} className={cn('h-[3px] flex-1 rounded-sm', index < done ? 'bg-accent' : 'bg-line-strong')}/>)}
  </div>

/** Кружок задания: пустой, с галочкой или приглушённый, если задание пока закрыто. */
export function StepMark({ status }:{ status:SetupStatus }) {
  if (status === 'done') return <div
    className="flex size-[26px] flex-none items-center justify-center rounded-full"
    style={{ background: tone.ok.bg, color: tone.ok.fg }}
  >
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M3 7.4 5.8 10 11 4.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  </div>
  return <div className={cn(
    'size-[26px] flex-none rounded-full border-2',
    status === 'next' ? 'border-accent' : 'border-line-strong',
    status === 'locked' && 'opacity-50',
  )}/>
}

/**
 * Вход в настройку на главной: прогресс и следующее задание. Пропадает, когда
 * владелец скрыл список; у организаций до появления заданий он скрыт сразу.
 */
export function SetupStrip() {
  const { push } = useNav()
  const setup = useSetup()
  if (setup.loading || setup.error || !setup.available || setup.hidden) return null

  return <button
    type="button"
    className="tap mb-3 block w-full rounded-lg border border-line bg-surface px-[15px] pt-3 pb-3.5 text-left active:bg-surface-soft"
    onClick={() => { haptics.tap(); push('/home/setup') }}
  >
    <div className="mb-2.5 flex items-center gap-2">
      <div className="flex-1 text-row font-semibold">Настройка пункта</div>
      <div className="text-sub font-medium text-muted tabular-nums">{setup.done} из {setup.total}</div>
      <div className="text-chevron"><Chevron size={20}/></div>
    </div>
    <SetupBar done={setup.done} total={setup.total}/>
    <div className="mt-2.5 truncate text-sub text-muted">
      {setup.next ? <>Дальше: <span className="font-medium text-ink">{setup.next.title.toLowerCase()}</span></> : 'Всё готово — пункт настроен'}
    </div>
  </button>
}
