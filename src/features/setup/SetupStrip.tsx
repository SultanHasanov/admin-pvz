import { cn } from '../../shared/kit/cn'
import { haptics } from '../../shared/kit/haptics'
import {
  Chevron, IconBox, IconCheck, IconDeduction, IconExpense, IconIncome, IconInvite,
  IconLock, IconPeople, IconPoint, IconRate, IconSchedule, IconTax, IconTelegram, IconPayout,
} from '../../shared/kit/icons'
import type { SetupStatus, SetupStepId } from '../../entities/setup'
import { useNav } from '../../app/nav'
import { useSetup } from './useSetup'

/** Полоса прогресса по делениям — тот же приём, что шаги регистрации. */
export const SetupBar = ({ done, total }:{ done:number; total:number }) =>
  <div className="flex gap-1.5">
    {Array.from({ length: total }, (_, index) =>
      <div key={index} className={cn('h-[3px] flex-1 rounded-sm', index < done ? 'bg-accent' : 'bg-line-strong')}/>)}
  </div>

/** Кружок задания: пустой, с галочкой или приглушённый, если задание пока закрыто. */
export function SetupGlyph({ id, size = 18 }:{ id:SetupStepId; size?:number }) {
  if (id === 'points') return <IconPoint size={size}/>
  if (id === 'employees') return <IconPeople size={size}/>
  if (id === 'defaultRate') return <IconRate size={size}/>
  if (id === 'shifts') return <IconSchedule size={size}/>
  if (id === 'income') return <IconIncome size={size}/>
  if (id === 'expense') return <IconExpense size={size}/>
  if (id === 'invite') return <IconInvite size={size}/>
  if (id === 'tax') return <IconTax size={size}/>
  if (id === 'payDays') return <IconPayout size={size}/>
  if (id === 'telegram') return <IconTelegram size={size}/>
  return <IconDeduction size={size}/>
}

export function StepMark({ status, id }:{ status:SetupStatus; id:SetupStepId }) {
  if (status === 'done') return <IconBox tone="ok" size={32}><IconCheck size={18}/></IconBox>
  if (status === 'locked') return <IconBox tone="neutral" size={32} className="opacity-60"><IconLock size={16}/></IconBox>
  return <IconBox tone={status === 'next' ? 'accent' : 'neutral'} size={32}><SetupGlyph id={id}/></IconBox>
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
