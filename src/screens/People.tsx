import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { Screen, FilterRow } from '../shared/kit/Screen'
import { Card } from '../shared/kit/Card'
import { Avatar, List, ListRow } from '../shared/kit/ListRow'
import { SectionTitle } from '../shared/kit/Text'
import { Chip, EmptyState, ErrorNote, SkeletonRows } from '../shared/kit/Misc'
import { Fab } from '../shared/kit/TabBar'
import { initials } from '../shared/shifts'
import { rubles } from '../shared/money'
import { monthLabel, today as todayDate } from '../shared/dates'
import { vacationOn } from '../services/vacations'
import { keys } from '../services/queries'
import { listEmployees } from '../services/employees'
import { useVacations } from '../features/schedule/useVacations'
import { useMonthTotals } from '../features/money/useMonthTotals'
import { useSalarySheets } from '../features/money/useSalarySheets'
import { useOrg } from '../app/OrgContext'
import { useNav } from '../app/nav'
import { useSheets } from '../app/sheets'

/**
 * Сотрудники. Группы идут по состоянию: сначала те, кто работает, потом отпуска
 * и отключённые — так список отвечает на вопрос «кто у меня сейчас есть».
 *
 * «В отпуске» — это сегодняшняя дата внутри отрезка отпуска, а не поле в карточке:
 * отпуск кончается сам, и отдельный статус пришлось бы не забывать снимать.
 */
export default function People() {
  const { month, pointId, pointName } = useOrg()
  const { push } = useNav()
  const { open } = useSheets()
  // Десктоп: список стоит слева от карточки, и открытый сотрудник подсвечен.
  const { id: selected } = useParams()
  const totals = useMonthTotals()
  const salary = useSalarySheets(totals)
  const { vacations } = useVacations(month)
  // Общая выборка — только активные (их ставят в смены). Отключённых дочитываем для своей группы.
  const everyone = useQuery({ queryKey: keys.employees(true), queryFn: () => listEmployees(true) })
  const archived = (everyone.data ?? []).filter(employee => employee.status !== 'ACTIVE' && (!pointId || employee.pickupPointIds.includes(pointId)))

  const today = todayDate()
  const period = monthLabel(month).split(' ')[0]
  const onVacation = (id:string) => !!vacationOn(vacations, id, today)

  const active = totals.staff.filter(employee => employee.status === 'ACTIVE')
  const groups = [
    { label: 'Активные', rows: active.filter(employee => !onVacation(employee.id)) },
    { label: 'В отпуске', rows: active.filter(employee => onVacation(employee.id)) },
    { label: 'Отключённые', rows: archived },
  ].filter(group => group.rows.length)

  return <Screen
    filters={<FilterRow>
      <Chip onClick={() => open('pvzPick')}>{pointId ? pointName(pointId) : 'Все ПВЗ'}</Chip>
      <Chip onClick={() => open('monthPick')}>{period}</Chip>
    </FilterRow>}
  >
    {totals.error && <div className="mb-3"><ErrorNote error={totals.error}/></div>}

    {totals.loading && <Card><SkeletonRows rows={4}/></Card>}

    {!totals.loading && !totals.staff.length && <Card>
      <EmptyState
        title="Сотрудников пока нет"
        sub={pointId ? `На ПВЗ «${pointName(pointId)}» никто не привязан` : 'Добавьте первого сотрудника, чтобы вести график и зарплату'}
      />
    </Card>}

    {groups.map(group => <div key={group.label}>
      <SectionTitle count={group.rows.length}>{group.label}</SectionTitle>
      <Card>
        <List>
          {group.rows.map(employee => {
            const sheet = salary.byEmployee(employee.id)
            return <ListRow
              key={employee.id}
              leading={<Avatar
                initials={initials(employee.fullName)}
                tone={employee.status !== 'ACTIVE' ? 'neutral' : onVacation(employee.id) ? 'info' : 'accent'}
              />}
              title={employee.fullName}
              sub={[
                employee.pickupPointIds.map(id => pointName(id)).join(', ') || 'Без ПВЗ',
                employee.rateKopecks ? rubles(employee.rateKopecks) : null,
              ].filter(Boolean).join(' · ')}
              right={sheet ? rubles(sheet.accrued) : undefined}
              rightSub={sheet ? `${sheet.shifts} смен` : undefined}
              selected={employee.id === selected}
              onClick={() => push(`/people/${employee.id}`)}
            />
          })}
        </List>
      </Card>
    </div>)}

    <Fab onClick={() => push('/people/new')}/>
  </Screen>
}
