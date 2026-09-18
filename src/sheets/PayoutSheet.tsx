import { useState } from 'react'
import type { SalaryPayment } from '../entities/types'
import { Button } from '../shared/kit/Button'
import { DateField } from '../shared/kit/DateField'
import { Banner, Field, MoneyField } from '../shared/kit/Field'
import { PickList } from '../shared/kit/PickList'
import { moneyInput, parseMoney, rubles } from '../shared/money'
import { monthLabel, today } from '../shared/dates'
import { createSalaryPayment } from '../services/salary'
import { useWrite } from '../features/write'
import { useMonthTotals } from '../features/money/useMonthTotals'
import { useSalarySheets } from '../features/money/useSalarySheets'
import { scope } from '../services/queries'

/**
 * Аванс или остаток одному сотруднику.
 *
 * Сумма подставляется из ведомости: аванс — половина начисленного на сегодня,
 * остаток — всё, что не выплачено. Править можно, но по умолчанию считается,
 * а не вводится руками.
 */
export default function PayoutSheet({ kind = 'ADVANCE', employeeId: initial = '', close }:{
  kind?:SalaryPayment['kind']
  employeeId?:string
  close:() => void
}) {
  const totals = useMonthTotals()
  const salary = useSalarySheets(totals)
  const [employeeId, setEmployeeId] = useState(initial)
  const [amount, setAmount] = useState(() => {
    const sheet = salary.byEmployee(initial)
    if (!sheet) return ''
    return moneyInput(kind === 'ADVANCE' ? Math.round(sheet.accrued / 2) : Math.max(0, sheet.balance))
  })
  const [date, setDate] = useState(today())

  const sheet = salary.byEmployee(employeeId)
  const amountKopecks = parseMoney(amount)
  const valid = Boolean(employeeId) && amountKopecks > 0

  /** Смена сотрудника пересчитывает предложенную сумму — иначе она осталась бы от предыдущего. */
  const pick = (value:string) => {
    setEmployeeId(value)
    const next = salary.byEmployee(value)
    if (next) setAmount(moneyInput(kind === 'ADVANCE' ? Math.round(next.accrued / 2) : Math.max(0, next.balance)))
  }

  const write = useWrite({
    run: () => createSalaryPayment({
      employeeId,
      date,
      accrualMonth: totals.month,
      amountKopecks,
      kind,
    }),
    invalidate: [scope.payments],
    done: `${kind === 'ADVANCE' ? 'Аванс' : 'Выплата'} ${rubles(amountKopecks)}`,
    onDone: close,
  })

  return <>
    {!initial && <Field label="Сотрудник">
      <PickList
        value={employeeId}
        onPick={pick}
        options={salary.sheets.map(row => ({
          value: row.employeeId,
          name: row.fullName,
          sub: `начислено ${rubles(row.accrued)} · остаток ${rubles(row.balance)}`,
        }))}
      />
    </Field>}

    <MoneyField
      label="Сумма"
      value={amount}
      onValueChange={setAmount}
      hint={sheet ? `Начислено ${rubles(sheet.accrued)}, выплачено ${rubles(sheet.paid)}` : undefined}
    />

    <DateField label="Дата выплаты" value={date} onChange={setDate}/>

    {sheet && amountKopecks > sheet.balance && sheet.balance > 0 && <Banner>
      Сумма больше остатка {rubles(sheet.balance)} — в ведомости появится переплата.
    </Banner>}

    <Button block className="mt-3" disabled={!valid || write.isPending} onClick={() => write.mutate(undefined as void)}>
      {kind === 'ADVANCE' ? `Выдать аванс за ${monthLabel(totals.month).split(' ')[0].toLowerCase()}` : 'Выплатить остаток'}
    </Button>
  </>
}
