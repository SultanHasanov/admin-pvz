import { useState } from 'react'
import { Button } from '../shared/kit/Button'
import { DateField } from '../shared/kit/DateField'
import { Field, MoneyField, TextField } from '../shared/kit/Field'
import { PickList } from '../shared/kit/PickList'
import { Segmented } from '../shared/kit/Segmented'
import { parseMoney, rubles } from '../shared/money'
import { today } from '../shared/dates'
import { createBonus, createPenalty } from '../services/salary'
import { useWrite } from '../features/write'
import { useMonthTotals } from '../features/money/useMonthTotals'
import { scope } from '../services/queries'

/**
 * Премия или штраф. Одна шторка на оба случая: поля совпадают, а знак суммы —
 * это выбор в переключателе, а не минус, который легко не заметить.
 */
export default function AdjustmentSheet({ employeeId: initial = '', close }:{ employeeId?:string; close:() => void }) {
  const totals = useMonthTotals()
  const [sign, setSign] = useState<'bonus' | 'penalty'>('bonus')
  const [employeeId, setEmployeeId] = useState(initial)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [date, setDate] = useState(today())

  const amountKopecks = parseMoney(amount)
  const valid = Boolean(employeeId) && amountKopecks > 0 && (sign === 'bonus' || reason.trim().length > 0)
  const name = totals.staff.find(person => person.id === employeeId)?.fullName ?? ''

  const write = useWrite({
    run: () => sign === 'bonus'
      ? createBonus({ employeeId, date, amountKopecks, comment: reason.trim() || undefined })
      : createPenalty({ employeeId, date, amountKopecks, reason: reason.trim() }),
    invalidate: [scope.bonuses, scope.penalties],
    done: `${sign === 'bonus' ? 'Премия' : 'Штраф'} ${rubles(amountKopecks)} · ${name.split(' ')[0]}`,
    onDone: close,
  })

  return <>
    <Segmented
      className="mb-3"
      value={sign}
      onChange={setSign}
      options={[{ value: 'bonus', label: 'Премия' }, { value: 'penalty', label: 'Штраф' }]}
    />

    {!initial && <Field label="Сотрудник">
      <PickList
        value={employeeId}
        onPick={setEmployeeId}
        options={totals.staff.map(person => ({ value: person.id, name: person.fullName }))}
      />
    </Field>}

    <MoneyField label="Сумма" value={amount} onValueChange={setAmount}/>

    <TextField
      label={sign === 'bonus' ? 'За что' : 'Причина'}
      placeholder={sign === 'bonus' ? 'Рекорд по выдачам' : 'Опоздание'}
      value={reason}
      onChange={event => setReason(event.target.value)}
    />

    <DateField label="Дата" value={date} onChange={setDate}/>

    <Button block className="mt-3" disabled={!valid || write.isPending} onClick={() => write.mutate(undefined as void)}>
      {sign === 'bonus' ? 'Добавить премию' : 'Добавить штраф'}
    </Button>
  </>
}
