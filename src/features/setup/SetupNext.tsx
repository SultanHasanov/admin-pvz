import type { ReactNode } from 'react'
import { Button } from '../../shared/kit/Button'
import type { SetupStepId, SetupStepInfo } from '../../entities/setup'
import { useNav } from '../../app/nav'
import { useSheets } from '../../app/sheets'
import { IconBox } from '../../shared/kit/icons'
import { SetupGlyph } from './SetupStrip'

/** Куда ведёт задание: на свой экран или в шторку прямо с места. */
export function useRunStep() {
  const { push } = useNav()
  const { open } = useSheets()
  return (id:SetupStepId) => {
    if (id === 'points') push('/more/points')
    else if (id === 'employees') push('/people/new')
    else if (id === 'defaultRate') open('setRate')
    else if (id === 'shifts') push('/sched/wizard')
    else if (id === 'income') open('op', { kind: 'INCOME' })
    else if (id === 'expense') open('op', { kind: 'EXPENSE' })
    else if (id === 'invite') push('/people')
    else if (id === 'tax') open('setTax')
    else if (id === 'payDays') open('setPayDays')
    else if (id === 'telegram') push('/more/telegram')
  }
}

/** Следующее задание крупно, с кнопкой — на экране настройки и на пустой главной. */
export function SetupNext({ step, label = 'Следующий шаг', footer }:{ step:SetupStepInfo; label?:ReactNode; footer?:ReactNode }) {
  const run = useRunStep()
  return <div className="mb-1 rounded-lg border border-accent-soft bg-accent-faint px-[15px] pt-3.5 pb-[15px]">
    <div className="flex items-start gap-3">
      <IconBox tone="accent" size={40}><SetupGlyph id={step.id} size={21}/></IconBox>
      <div className="min-w-0 flex-1">
        <div className="lbl text-accent">{label}</div>
        <div className="mt-1 text-title font-semibold">{step.title}</div>
        <div className="mt-0.5 mb-3.5 text-sub leading-[1.4] text-muted">{step.sub}</div>
      </div>
    </div>
    <Button block onClick={() => run(step.id)}>{step.action}</Button>
    {footer}
  </div>
}
