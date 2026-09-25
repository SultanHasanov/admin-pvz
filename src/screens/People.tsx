import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { Screen, FilterRow } from '../shared/kit/Screen'
import { Card } from '../shared/kit/Card'
import { Avatar, List, ListRow } from '../shared/kit/ListRow'
import { SectionTitle } from '../shared/kit/Text'
import { Chip, EmptyState, ErrorNote, SkeletonRows } from '../shared/kit/Misc'
import { Button } from '../shared/kit/Button'
import { Fab } from '../shared/kit/TabBar'
import { Switch } from '../shared/kit/Switch'
import { initials } from '../shared/shifts'
import { rubles } from '../shared/money'
import { plural } from '../shared/format'
import { monthLabel } from '../shared/dates'
import { keys, scope } from '../services/queries'
import { listEmployees, setEmployeeStatus } from '../services/employees'
import { useWrite } from '../features/write'
import { useMonthTotals } from '../features/money/useMonthTotals'
import { useSalarySheets } from '../features/money/useSalarySheets'
import { useOrg } from '../app/OrgContext'
import { useNav } from '../app/nav'
import { useSheets } from '../app/sheets'

/**
 * Сотрудники: сначала те, кто работает, потом отключённые — так список отвечает
 * на вопрос «кто у меня сейчас есть».
 *
 * Переключатель в строке отключает уволившегося сразу, без захода в карточку:
 * он остаётся в прошлых расчётах, но пропадает из выбора в графике. Тот же
 * переключатель в группе «Отключённые» возвращает человека.
 */
export default function People() {
  const { month, pointId, pointName, pointTitle } = useOrg()
  const { push } = useNav()
  const { open } = useSheets()
  // Десктоп: список стоит слева от карточки, и открытый сотрудник подсвечен.
  const { id: selected } = useParams()
  const totals = useMonthTotals()
  const salary = useSalarySheets(totals)
  // Общая выборка — только активные (их ставят в смены). Отключённых дочитываем для своей группы.
  const everyone = useQuery({ queryKey: keys.employees(true), queryFn: () => listEmployees(true) })
  const archived = (everyone.data ?? []).filter(employee => employee.status !== 'ACTIVE' && (!pointId || employee.pickupPointIds.includes(pointId)))

  const period = monthLabel(month).split(' ')[0]

  const toggle = useWrite<{ id:string; name:string; on:boolean }>({
    run: ({ id, on }) => setEmployeeStatus(id, on ? 'ACTIVE' : 'ARCHIVED'),
    invalidate: [scope.employees],
    done: ({ name, on }) => on ? `Снова в работе: ${name}` : `Отключили: ${name}. В графике больше не предлагаем`,
  })

  const active = totals.staff.filter(employee => employee.status === 'ACTIVE')
  const groups = [
    { label: 'Активные', rows: active },
    { label: 'Отключённые', rows: archived },
  ].filter(group => group.rows.length)

  return <Screen
    filters={<FilterRow>
      <Chip onClick={() => open('pvzPick')}>{pointTitle}</Chip>
      <Chip onClick={() => open('monthPick')}>{period}</Chip>
    </FilterRow>}
  >
    {totals.error && <div className="mb-3"><ErrorNote error={totals.error}/></div>}

    {totals.loading && <Card><SkeletonRows rows={4}/></Card>}

    {!totals.loading && !totals.staff.length && <Card>
      <EmptyState
        title="Сотрудников пока нет"
        sub={pointId ? `На ПВЗ «${pointName(pointId)}» никто не привязан` : 'Добавьте первого сотрудника, чтобы вести график и зарплату'}
        action={<Button variant="secondary" onClick={() => push('/people/new')}>Добавить сотрудника</Button>}
      />
    </Card>}

    {groups.map(group => <div key={group.label}>
      <SectionTitle count={group.rows.length}>{group.label}</SectionTitle>
      <Card>
        <List>
          {group.rows.map(employee => {
            const sheet = salary.byEmployee(employee.id)
            const on = employee.status === 'ACTIVE'
            const busy = toggle.isPending && toggle.variables?.id === employee.id
            // Переключатель — рядом со строкой, а не внутри: строка сама кнопка,
            // и вложенная кнопка открывала бы карточку вместе с переключением.
            return <div key={employee.id} className={employee.id === selected ? 'flex items-center bg-accent-tint' : 'flex items-center'}>
              <ListRow
                className="min-w-0 flex-1 pr-2"
                leading={<Avatar
                  initials={initials(employee.fullName)}
                  tone={on ? 'accent' : 'neutral'}
                />}
                title={employee.fullName}
                // Ставка — в карточке: рядом с переключателем строке не хватает ширины.
                sub={[
                  employee.pickupPointIds.map(id => pointName(id).replace(/^ПВЗ\s+/, '')).join(', ') || 'Без ПВЗ',
                  !on ? null : sheet?.shifts ? `${sheet.shifts} ${plural(sheet.shifts, 'смена', 'смены', 'смен')}` : 'нет смен в графике',
                ].filter(Boolean).join(' · ')}
                // Число справа без подписи читалось то как «к выплате», то как ставка.
                right={sheet?.shifts ? rubles(sheet.accrued) : undefined}
                rightSub={sheet?.shifts ? 'начислено' : undefined}
                selected={employee.id === selected}
                onClick={() => push(`/people/${employee.id}`)}
              />
              <Switch
                className="mr-[15px]"
                checked={on}
                disabled={busy}
                label={on ? `Отключить ${employee.fullName}` : `Включить ${employee.fullName}`}
                onChange={next => toggle.mutate({ id: employee.id, name: employee.fullName.split(' ')[0], on: next })}
              />
            </div>
          })}
        </List>
      </Card>
    </div>)}

    <Fab label="Сотрудник" onClick={() => push('/people/new')}/>
  </Screen>
}
