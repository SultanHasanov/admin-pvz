import { useState } from 'react'
import type { DeductionStatus } from '../entities/types'
import { Button } from '../shared/kit/Button'
import { Banner, Field } from '../shared/kit/Field'
import { PickList } from '../shared/kit/PickList'
import { setDeductionStatus } from '../services/deductions'
import { useWrite } from '../features/write'
import { useMonthTotals } from '../features/money/useMonthTotals'
import { scope } from '../services/queries'

/**
 * Статус удержания WB. Формулировки — решения владельца, а не названия из базы:
 * «оспариваем», «на сотруднике», «наш убыток». От статуса зависят деньги, поэтому
 * под выбором сразу написано, что он меняет в расчёте.
 */
const OPTIONS:{ value:DeductionStatus; name:string; sub:string }[] = [
  { value: 'NEW', name: 'Новое', sub: 'Решение ещё не принято' },
  { value: 'INVESTIGATING', name: 'Разбираемся', sub: 'Выясняем, кто и при каких обстоятельствах' },
  { value: 'DISPUTED', name: 'Оспариваем в WB', sub: 'Отправлено возражение, ждём ответа' },
  { value: 'EMPLOYEE_LIABILITY', name: 'На сотруднике', sub: 'Вычтется из его зарплаты в этом месяце' },
  { value: 'OWNER_LOSS', name: 'Наш убыток', sub: 'Уменьшит прибыль месяца, с сотрудника не берём' },
  { value: 'CANCELLED_BY_WB', name: 'WB отменил', sub: 'Удержание снято, в расчёт не идёт' },
  { value: 'CONFIRMED_BY_WB', name: 'WB подтвердил', sub: 'Списано окончательно, уменьшит прибыль' },
]

export default function StatusSheet({ id, status, employeeId, close }:{
  id:string
  status:DeductionStatus
  employeeId?:string | null
  close:() => void
}) {
  const totals = useMonthTotals()
  const [next, setNext] = useState<DeductionStatus>(status)
  const employee = totals.staff.find(person => person.id === employeeId)

  const write = useWrite({
    run: () => setDeductionStatus(id, next),
    invalidate: [scope.deductions, scope.newDeductions, scope.deductionEvents],
    done: next === 'EMPLOYEE_LIABILITY' ? 'Удержание попадёт в вычеты сотрудника' : 'Статус изменён',
    onDone: close,
  })

  return <>
    {next === 'EMPLOYEE_LIABILITY' && !employee && <Banner>
      Сотрудник не выбран — вычитать будет не из кого. Назначьте сотрудника в карточке удержания.
    </Banner>}

    <Field>
      <PickList value={next} onPick={value => setNext(value as DeductionStatus)} options={OPTIONS}/>
    </Field>

    <Button block disabled={next === status || write.isPending} onClick={() => write.mutate(undefined as void)}>
      Сохранить статус
    </Button>
  </>
}
