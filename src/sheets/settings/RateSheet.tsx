import { useState } from 'react'
import dayjs from 'dayjs'
import { Button } from '../../shared/kit/Button'
import { MoneyField } from '../../shared/kit/Field'
import { DateField } from '../../shared/kit/DateField'
import { parseMoney, rubles } from '../../shared/money'
import { dayLabel, today } from '../../shared/dates'
import { rateForDate } from '../../entities/calculations'
import { saveRate } from '../../services/employees'
import { useWrite } from '../../features/write'
import { useMonthTotals } from '../../features/money/useMonthTotals'
import { scope } from '../../services/queries'

/**
 * Новая ставка сотрудника с даты. Прошлые смены считаются по ставке на свою дату —
 * поэтому это запись в историю, а не правка текущей ставки.
 */
export default function RateSheet({ employeeId, close }:{ employeeId:string; close:() => void }) {
  const totals = useMonthTotals()
  const rules = totals.rules.filter(rule => rule.employeeId === employeeId)
  const current = rateForDate(rules, today())
  const [amount, setAmount] = useState('')
  // По умолчанию — с первого числа следующего месяца: менять ставку посреди месяца
  // значит считать один месяц по двум ставкам.
  const [from, setFrom] = useState(dayjs(today()).add(1, 'month').startOf('month').format('YYYY-MM-DD'))
  const kopecks = parseMoney(amount)

  const write = useWrite({
    run: () => saveRate(employeeId, {
      paymentType: current?.paymentType ?? 'SHIFT',
      rateKopecks: kopecks,
      monthlyNormDays: current?.monthlyNormDays ?? 22,
      salaryRateId: null,
      hourlyRateKopecks: current?.hourlyRateKopecks ?? null,
    }, from),
    invalidate: [scope.salaryRules, scope.employees],
    done: `Новая ставка с ${dayLabel(from)} · прошлые смены не пересчитываются`,
    onDone: close,
  })

  return <>
    <div className="mb-3 text-row leading-[1.45] text-muted">
      Смены до даты изменения останутся по старой ставке{current ? ` ${rubles(current.rateKopecks)}` : ''}.
    </div>
    <MoneyField label="Новая ставка" value={amount} onValueChange={setAmount}/>
    <DateField label="Действует с" value={from} onChange={setFrom}/>
    <Button block disabled={!(kopecks > 0) || write.isPending} onClick={() => write.mutate(undefined as void)}>Сохранить ставку</Button>
  </>
}
