import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { Screen, Header } from '../shared/kit/Screen'
import { Card } from '../shared/kit/Card'
import { Avatar, List, ListRow, Pill } from '../shared/kit/ListRow'
import { SectionTitle, Label } from '../shared/kit/Text'
import { Button, TextButton } from '../shared/kit/Button'
import { EmptyState, SkeletonRows } from '../shared/kit/Misc'
import { accrueShifts } from '../entities/calculations'
import { initials, statusTitles } from '../shared/shifts'
import { payModeTitles } from '../shared/salary'
import { rubles } from '../shared/money'
import { dayLabel, monthLabel, timeLabel, today } from '../shared/dates'
import { vacationOn } from '../services/vacations'
import { keys, scope } from '../services/queries'
import { listEmployees, setEmployeeStatus } from '../services/employees'
import { useWrite } from '../features/write'
import { useVacations } from '../features/schedule/useVacations'
import { useMonthTotals } from '../features/money/useMonthTotals'
import { useSalarySheets } from '../features/money/useSalarySheets'
import { useOrg } from '../app/OrgContext'
import { useNav } from '../app/nav'
import { useSheets } from '../app/sheets'

/** Карточка сотрудника: кто это, по какой ставке считается и что выходит за месяц. */
export default function Employee() {
  const { id = '' } = useParams()
  const { month, pointName } = useOrg()
  const { back, canBack, push } = useNav()
  const { open } = useSheets()
  const totals = useMonthTotals()
  const salary = useSalarySheets(totals)
  const { vacations } = useVacations(month)

  // Отключённого нет в общей выборке (она только из активных) — берём из полной.
  const everyone = useQuery({ queryKey: keys.employees(true), queryFn: () => listEmployees(true) })
  const employee = totals.staff.find(person => person.id === id) ?? everyone.data?.find(person => person.id === id)
  const active = employee?.status === 'ACTIVE'
  const toggle = useWrite({
    run: () => setEmployeeStatus(id, active ? 'ARCHIVED' : 'ACTIVE'),
    invalidate: [scope.employees],
    done: active ? 'Сотрудник отключён' : 'Сотрудник включён',
  })
  const vacationNow = vacationOn(vacations, id, today())
  // Ближайший отпуск: идущий или ещё не начавшийся — прошедший владельцу уже не нужен.
  const vacationNext = vacations
    .filter(vacation => vacation.employeeId === id && vacation.dateTo >= today())
    .sort((a, b) => a.dateFrom.localeCompare(b.dateFrom))[0]
  const sheet = salary.byEmployee(id)
  const rules = totals.rules.filter(rule => rule.employeeId === id)
  const shifts = totals.shifts
    .filter(shift => shift.employeeId === id)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const period = monthLabel(month).split(' ')[0].toLowerCase()

  const header = <Header title="Сотрудник" onBack={canBack ? back : undefined}/>

  if (totals.loading || (everyone.isLoading && !employee)) return <Screen header={header}><Card><SkeletonRows rows={4}/></Card></Screen>
  if (!employee) return <Screen header={header}>
    <Card><EmptyState title="Сотрудник не найден" sub="Возможно, карточка была удалена или относится к другому ПВЗ"/></Card>
  </Screen>

  const calc = [
    { title: 'Начислено по сменам', value: sheet?.accrued ?? 0 },
    { title: 'Премии', value: sheet?.bonuses ?? 0 },
    { title: 'Штрафы', value: -(sheet?.penalties ?? 0) },
    { title: 'Удержания WB', value: -(sheet?.deductions ?? 0) },
    { title: 'Выплачено', value: -(sheet?.paid ?? 0) },
  ].filter(row => row.value !== 0)

  return <Screen header={header}>
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <Avatar initials={initials(employee.fullName)} size={44}/>
        <div className="min-w-0 flex-1">
          <div className="truncate text-lead font-semibold tracking-[-0.02em]">{employee.fullName}</div>
          <div className="mt-0.5 text-sub text-muted">{employee.phone || 'Телефон не указан'}</div>
        </div>
        <Pill tone={employee.status !== 'ACTIVE' ? 'neutral' : vacationNow ? 'info' : 'ok'}>
          {employee.status !== 'ACTIVE' ? 'отключён' : vacationNow ? 'в отпуске' : 'активен'}
        </Pill>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3 border-t border-line-soft pt-3">
        <div>
          <Label>Ставка за смену</Label>
          <div className="mt-1 text-lead font-semibold tabular-nums">{rubles(employee.rateKopecks)}</div>
        </div>
        <TextButton onClick={() => push(`/people/${id}/rates`)}>История ставки ›</TextButton>
      </div>
      {rules.length > 1 && <div className="mt-2 text-sub leading-[1.4] text-muted">
        Смены до даты изменения считаются по старой ставке — прошлые расчёты не пересчитываются.
      </div>}
    </Card>

    <Card className="mt-3">
      <List>
        <ListRow
          title="Отпуск или больничный"
          sub={vacationNext
            ? `${vacationNext.kind === 'SICK' ? 'Больничный' : 'Отпуск'} ${dayLabel(vacationNext.dateFrom)} – ${dayLabel(vacationNext.dateTo)}`
            : 'Дни в графике станут «нужна замена»'}
          right={vacationNow ? 'есть' : undefined}
          align="start"
          chevron
          onClick={() => open('vacation', { employeeId: id })}
        />
        <ListRow
          title="Пригласить в приложение"
          sub="Код и ссылка: сотрудник увидит свой график и деньги"
          align="start"
          chevron
          onClick={() => push(`/people/${id}/invite`)}
        />
        <ListRow
          title="Изменить данные"
          sub="Имя, телефон, пункты выдачи"
          align="start"
          chevron
          onClick={() => push(`/people/${id}/edit`)}
        />
        <ListRow
          title={<span className={active ? 'text-bad-strong' : 'text-ok'}>{active ? 'Отключить сотрудника' : 'Включить сотрудника'}</span>}
          chevron
          onClick={() => active
            ? open('confirm', {
              text: `Отключить ${employee.fullName}? Он останется в прошлых расчётах, но исчезнет из выбора в графике.`,
              yesLabel: 'Отключить',
              tone: 'bad',
              onYes: () => toggle.mutate(undefined as void),
            })
            : toggle.mutate(undefined as void)}
        />
      </List>
    </Card>

    <SectionTitle>Расчёт за {period}</SectionTitle>
    <Card>
      <List>
        {calc.map(row => <ListRow
          key={row.title}
          title={row.title}
          right={<span className={row.value < 0 ? 'text-bad' : undefined}>{rubles(row.value)}</span>}
          chevron
          onClick={() => push(`/people/${id}/payroll`)}
        />)}
        <ListRow
          title={<span className="font-semibold">Остаток к выплате</span>}
          right={<span className="font-semibold">{rubles(sheet?.balance ?? 0)}</span>}
          chevron
          onClick={() => push(`/people/${id}/payroll`)}
        />
      </List>
    </Card>

    <SectionTitle count={shifts.length}>Смены в {period}</SectionTitle>
    <Card>
      {shifts.length === 0
        ? <EmptyState title="Смен в этом месяце нет"/>
        : <List>
          {shifts.map(shift => <ListRow
            key={shift.id}
            title={`${dayLabel(shift.startsAt)} · ${timeLabel(shift.startsAt)}–${timeLabel(shift.endsAt)}`}
            sub={`${pointName(shift.pickupPointId)}${shift.payMode === 'FULL' ? '' : ` · ${payModeTitles[shift.payMode]}`}`}
            right={rubles(accrueShifts([shift].filter(row => row.status === 'COMPLETED'), rules))}
            rightSub={statusTitles[shift.status]}
            rightSubTone={shift.status === 'COMPLETED' ? 'ok' : shift.status === 'NO_SHOW' ? 'bad' : 'neutral'}
          />)}
        </List>}
    </Card>

    <div className="mt-3 flex gap-2">
      <Button className="flex-1" onClick={() => open('payout', { kind: 'PAYMENT', employeeId: id })}>Выплатить</Button>
      <Button className="flex-1" variant="secondary" onClick={() => open('adj', { employeeId: id })}>Премия или штраф</Button>
    </div>
  </Screen>
}
