import { Screen, Header } from '../shared/kit/Screen'
import { Card } from '../shared/kit/Card'
import { List, ListRow } from '../shared/kit/ListRow'
import { SectionTitle } from '../shared/kit/Text'
import { Button, TextButton } from '../shared/kit/Button'
import { ErrorNote, SkeletonRows } from '../shared/kit/Misc'
import type { SetupStep, SetupStepId } from '../entities/setup'
import { SetupBar, StepMark } from '../features/setup/SetupStrip'
import { useSetup } from '../features/setup/useSetup'
import { SetupNext, useRunStep } from '../features/setup/SetupNext'
import { useNav } from '../app/nav'
import { useSheets } from '../app/sheets'

/**
 * «Настройка пункта»: задания для нового владельца. Следующее задание — крупно
 * с кнопкой, остальные — списком. Задание ведёт на свой экран или открывает шторку
 * прямо отсюда (одна шторка за раз), выполненное отмечается само.
 */
export default function Setup() {
  const { back, canBack } = useNav()
  const { open } = useSheets()
  const setup = useSetup()
  const run = useRunStep()

  const header = <Header title="Настройка пункта" onBack={canBack ? back : undefined}/>
  if (setup.loading) return <Screen header={header}><Card><SkeletonRows rows={6}/></Card></Screen>
  if (setup.error) return <Screen header={header}><ErrorNote error={setup.error}/></Screen>

  const next = setup.next
  const finished = setup.done === setup.total

  return <Screen header={header}>
    <div className="mb-4 px-0.5">
      <div className="mb-2.5 flex items-baseline gap-2">
        <div className="text-date leading-[1.15] font-semibold tracking-[-0.025em] tabular-nums">{setup.done} из {setup.total}</div>
        <div className="text-row text-muted">{finished ? 'всё готово' : 'готово'}</div>
      </div>
      <SetupBar done={setup.done} total={setup.total}/>
    </div>

    {next && <SetupNext step={next}/>}

    {finished && <Card className="mb-1 px-[15px] pt-3.5 pb-[15px]">
      <div className="text-title font-semibold">Пункт настроен</div>
      <div className="mt-0.5 mb-3.5 text-sub leading-[1.4] text-muted">
        Доходы, расходы, график и зарплаты теперь считаются на главной
      </div>
      {!setup.hidden && <Button block variant="secondary" disabled={setup.saving} onClick={() => setup.setHidden(true)}>Убрать с главной</Button>}
    </Card>}

    <SectionTitle>Все задания</SectionTitle>
    <StepList steps={setup.steps.filter(step => !step.optional)} onRun={run}/>

    <SectionTitle>Дополнительно</SectionTitle>
    <StepList steps={setup.steps.filter(step => step.optional)} onRun={run}/>

    {!finished && <div className="mt-3 text-center">
      {setup.hidden
        ? <TextButton onClick={() => setup.setHidden(false)}>Показывать на главной</TextButton>
        : <TextButton tone="muted" onClick={() => open('confirm', {
          text: 'Убрать настройку с главной? Вернуть её можно в разделе «Ещё».',
          yesLabel: 'Убрать',
          onYes: () => setup.setHidden(true),
        })}>Убрать с главной</TextButton>}
    </div>}
  </Screen>
}

function StepList({ steps, onRun }:{ steps:readonly SetupStep[]; onRun:(id:SetupStepId) => void }) {
  return <Card>
    <List>
      {steps.map(step => <ListRow
        key={step.id}
        leading={<StepMark status={step.status}/>}
        title={<span className={step.status === 'done' || step.status === 'locked' ? 'text-muted' : undefined}>{step.title}</span>}
        sub={step.status === 'locked' ? step.lockedSub : step.status === 'done' ? 'Готово' : step.sub}
        chevron={step.status === 'next' || step.status === 'todo'}
        onClick={step.status === 'next' || step.status === 'todo' ? () => onRun(step.id) : undefined}
      />)}
    </List>
  </Card>
}
