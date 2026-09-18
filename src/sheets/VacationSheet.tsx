import { useState } from 'react'
import dayjs from 'dayjs'
import type { VacationKind } from '../entities/types'
import { Button } from '../shared/kit/Button'
import { Field } from '../shared/kit/Field'
import { ChoiceChips } from '../shared/kit/PickList'
import { DateField } from '../shared/kit/DateField'
import { today } from '../shared/dates'
import { createVacation } from '../services/vacations'
import { useWrite } from '../features/write'
import { useMonthTotals } from '../features/money/useMonthTotals'
import { scope } from '../services/queries'

const KINDS:{ value:VacationKind; label:string }[] = [
  { value: 'UNPAID', label: 'Отпуск' },
  { value: 'SICK', label: 'Больничный' },
]

const titleOf = (kind:VacationKind) => kind === 'SICK' ? 'Больничный' : 'Отпуск'

/**
 * Владелец отмечает отпуск сам, без заявки: так бывает чаще, чем через приложение —
 * договорились устно, а в графике это должно быть видно.
 *
 * Дни отпуска не удаляют смены: человек остаётся в графике, но место считается
 * свободным и день попадает в «нужна замена». Снять смену — отдельное решение.
 */
export default function VacationSheet({ employeeId, close }:{ employeeId:string; close:() => void }) {
  const totals = useMonthTotals()
  const [kind, setKind] = useState<VacationKind>('UNPAID')
  const [from, setFrom] = useState(today())
  const [to, setTo] = useState(dayjs(today()).add(7, 'day').format('YYYY-MM-DD'))

  const employee = totals.staff.find(person => person.id === employeeId)
  const days = dayjs(to).diff(dayjs(from), 'day') + 1

  const write = useWrite({
    run: () => createVacation({ employeeId, dateFrom: from, dateTo: to, kind }),
    invalidate: [scope.vacations, scope.shifts],
    done: `${titleOf(kind)}: дни в графике помечены как требующие замены`,
    onDone: close,
  })

  return <>
    <Field label="Тип" hint={employee ? employee.fullName : undefined}>
      <ChoiceChips value={kind} options={KINDS} onPick={setKind}/>
    </Field>

    <DateField label="С" value={from} onChange={setFrom}/>
    <DateField
      label="По"
      value={to}
      onChange={setTo}
      hint={days > 0 ? `${days} дн.` : 'Дата окончания раньше начала — отпуск будет на один день'}
    />

    <Button block disabled={write.isPending} onClick={() => write.mutate(undefined as void)}>
      Сохранить
    </Button>
  </>
}
