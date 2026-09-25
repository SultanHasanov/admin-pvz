import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { Screen, Header } from '../shared/kit/Screen'
import { Card, Hero } from '../shared/kit/Card'
import { List, ListRow, Pill } from '../shared/kit/ListRow'
import { SectionTitle } from '../shared/kit/Text'
import { Button } from '../shared/kit/Button'
import { EmptyState, Illustration, SkeletonRows } from '../shared/kit/Misc'
import { deductionTitles as titles, deductionTones as tones, eventText } from '../shared/deductions'
import { ownerLossOf } from '../entities/calculations'
import { rubles } from '../shared/money'
import { dayLabel, monthLabel } from '../shared/dates'
import { keys, scope } from '../services/queries'
import { deleteDeduction, listDeductionEvents } from '../services/deductions'
import { useWrite } from '../features/write'
import { useMonthTotals } from '../features/money/useMonthTotals'
import { useOrg } from '../app/OrgContext'
import { useNav } from '../app/nav'
import { useSheets } from '../app/sheets'
import { IconBox, IconCheck, IconClock, IconDeduction, IconWarning } from '../shared/kit/icons'

/**
 * Удержание WB: сумма, состояние и история решений.
 *
 * История — это события из `wb_deduction_events`, то есть ровно тот журнал, который
 * в прототипе показан под удержанием; туда же попадает «не согласен» от сотрудника.
 * Сумму можно разделить между несколькими сотрудниками — остаток остаётся убытком владельца.
 */
export default function Deduction() {
  const { id = '' } = useParams()
  const { month, pointName } = useOrg()
  const { back, canBack } = useNav()
  const { open } = useSheets()
  const totals = useMonthTotals()
  const events = useQuery({ queryKey: keys.deductionEvents(id), queryFn: () => listDeductionEvents(id), enabled: Boolean(id) })

  // Удаление — для удержания, внесённого по ошибке. Решение по настоящему — статусом, чтобы осталась история.
  const remove = useWrite({
    run: () => deleteDeduction(id),
    invalidate: [scope.deductions, scope.deductionParts, scope.newDeductions],
    done: 'Удержание удалено',
    onDone: back,
  })

  const deduction = totals.deductions.find(row => row.id === id)
  const header = <Header title="Удержание WB" onBack={canBack ? back : undefined}/>

  if (totals.loading) return <Screen header={header}><Card><SkeletonRows rows={3}/></Card></Screen>
  if (!deduction) return <Screen header={header}>
    <Card><EmptyState
      title="Удержание не найдено"
      sub={`В ${monthLabel(month).split(' ')[0].toLowerCase()} такого удержания нет — проверьте выбранный месяц`}
    /></Card>
  </Screen>

  const employee = totals.staff.find(person => person.id === deduction.employeeId)
  const nameOf = (employeeId:string) => totals.staff.find(person => person.id === employeeId)?.fullName ?? 'Сотрудник'
  const parts = totals.parts.filter(part => part.deductionId === deduction.id)
  const loss = ownerLossOf(deduction, totals.parts)

  return <Screen header={header}>
    <Hero
      label="Сумма удержания"
      value={rubles(deduction.amountKopecks)}
      note={deduction.reason}
    />

    <SectionTitle action={<Pill tone={tones[deduction.status]}>{titles[deduction.status]}</Pill>}>Состояние</SectionTitle>
    <Card>
      <List>
        <ListRow title="ПВЗ" right={pointName(deduction.pickupPointId)}/>
        <ListRow title="Дата события" right={dayLabel(deduction.eventAt ?? deduction.createdAt)}/>
        {!parts.length && <ListRow title="Сотрудник" right={employee?.fullName ?? 'не назначен'}/>}
        {deduction.comment && <ListRow title="Комментарий" sub={deduction.comment} align="start"/>}
      </List>
    </Card>

    {parts.length > 0 && <>
      <SectionTitle count={parts.length}>Кто платит</SectionTitle>
      <Card>
        <List>
          {parts.map(part => <ListRow
            key={part.employeeId}
            title={nameOf(part.employeeId)}
            right={<span className="text-bad">−{rubles(part.amountKopecks)}</span>}
          />)}
          {loss > 0 && <ListRow title="Убыток владельца" sub="Остаток, не разложенный на сотрудников" align="start" right={rubles(loss)}/>}
        </List>
      </Card>
    </>}

    <SectionTitle count={events.data?.length}>История</SectionTitle>
    <Card>
      {events.isLoading
        ? <SkeletonRows rows={2}/>
        : !events.data?.length
          ? <EmptyState visual={<Illustration name="finance"/>} title="Событий пока нет" sub="Здесь появятся смены статуса и решения по удержанию"/>
          : <List className="relative before:absolute before:top-6 before:bottom-6 before:left-[33px] before:w-px before:bg-line-strong">
            {events.data.map(event => <ListRow
              key={event.id}
              leading={<EventIcon type={event.eventType}/>}
              title={<span className={event.eventType === 'EMPLOYEE_DISAGREE' ? 'text-bad' : undefined}>{eventText(event, nameOf)}</span>}
              sub={dayLabel(event.createdAt)}
              align="start"
              className="relative"
            />)}
          </List>}
    </Card>

    <Button
      block
      className="mt-3"
      onClick={() => open('split', { id: deduction.id })}
    >{parts.length ? 'Изменить доли сотрудников' : 'Разделить между сотрудниками'}</Button>

    <Button
      block
      variant="secondary"
      className="mt-2"
      onClick={() => open('status', { id: deduction.id, status: deduction.status, employeeId: deduction.employeeId })}
    >Изменить статус</Button>

    <Button
      block
      variant="danger"
      className="mt-2"
      disabled={remove.isPending}
      onClick={() => open('confirm', {
        text: `Удалить удержание «${deduction.reason}» на ${rubles(deduction.amountKopecks)}? Это для записи, внесённой по ошибке: история решений пропадёт вместе с ним. Если WB удержание отменил — поменяйте статус.`,
        yesLabel: 'Удалить',
        tone: 'bad',
        onYes: () => remove.mutate(undefined as void),
      })}
    >Удалить удержание</Button>
  </Screen>
}

function EventIcon({ type }:{ type:string }) {
  if (type === 'EMPLOYEE_DISAGREE') return <IconBox tone="bad" size={36}><IconWarning size={18}/></IconBox>
  if (type === 'STATUS_CHANGED') return <IconBox tone="ok" size={36}><IconCheck size={18}/></IconBox>
  if (type === 'IMPORTED') return <IconBox tone="info" size={36}><IconDeduction size={18}/></IconBox>
  return <IconBox tone="neutral" size={36}><IconClock size={18}/></IconBox>
}
