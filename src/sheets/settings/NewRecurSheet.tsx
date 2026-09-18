import { useState } from 'react'
import { Button } from '../../shared/kit/Button'
import { Field, MoneyField, TextField } from '../../shared/kit/Field'
import { ChoiceChips } from '../../shared/kit/PickList'
import { parseMoney, rubles } from '../../shared/money'
import { createRecurringExpense } from '../../services/finance'
import { useWrite } from '../../features/write'
import { useOrg } from '../../app/OrgContext'
import { scope } from '../../services/queries'

/**
 * Регулярный расход: аренда, интернет, уборка. Каждый месяц он ждёт подтверждения —
 * «Оплачено» создаёт операцию, а не списывает сам: сумма бывает разной.
 */
export default function NewRecurSheet({ close }:{ close:() => void }) {
  const { points, defaultPointId } = useOrg()
  const active = points.filter(point => !point.archivedAt)
  const [title, setTitle] = useState('')
  const [pointId, setPointId] = useState(defaultPointId || active[0]?.id || '')
  const [amount, setAmount] = useState('')
  const [day, setDay] = useState('5')

  const kopecks = parseMoney(amount)
  const dayNumber = Number(day)
  const valid = Boolean(title.trim() && pointId && kopecks > 0 && Number.isInteger(dayNumber) && dayNumber >= 1 && dayNumber <= 31)

  const write = useWrite({
    run: () => createRecurringExpense({ pickupPointId: pointId, category: title.trim(), amountKopecks: kopecks, dayOfMonth: dayNumber }),
    invalidate: [scope.recurring, scope.recurringOccurrences, scope.categories],
    done: () => `Регулярный расход добавлен · ${rubles(kopecks)} каждое ${dayNumber} число`,
    onDone: close,
  })

  return <>
    <TextField label="Название" value={title} placeholder="Аренда" hint="Станет категорией расхода" onChange={event => setTitle(event.target.value)}/>
    {active.length > 1 && <Field label="ПВЗ">
      <ChoiceChips value={pointId} onPick={setPointId} options={active.map(point => ({ value: point.id, label: point.name.replace(/^ПВЗ\s+/, '') }))}/>
    </Field>}
    <MoneyField label="Сумма" value={amount} onValueChange={setAmount}/>
    <TextField label="День месяца" inputMode="numeric" value={day} onChange={event => setDay(event.target.value)}/>
    <Button block disabled={!valid || write.isPending} onClick={() => write.mutate(undefined as void)}>Добавить</Button>
  </>
}
