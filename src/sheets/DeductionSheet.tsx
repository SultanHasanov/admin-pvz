import { useState } from 'react'
import dayjs from 'dayjs'
import { Button } from '../shared/kit/Button'
import { DateField } from '../shared/kit/DateField'
import { Field, MoneyField, TextField } from '../shared/kit/Field'
import { ChoiceChips, PickList } from '../shared/kit/PickList'
import { parseMoney, rubles } from '../shared/money'
import { today } from '../shared/dates'
import { createDeduction } from '../services/deductions'
import { useWrite } from '../features/write'
import { useMonthTotals } from '../features/money/useMonthTotals'
import { useOrg } from '../app/OrgContext'
import { scope } from '../services/queries'

const REASONS = ['Недостача при инвентаризации', 'Повреждение товара', 'Просрочен возврат', 'Пересорт при выдаче', 'Утеря товара']

/**
 * Удержание WB вручную. Нужно всегда, даже когда подключён кабинет: синхронизация
 * ломается на стороне WB, и владелец не должен от неё зависеть.
 *
 * Сотрудник необязателен: сразу после события часто неизвестно, кто виноват, —
 * удержание создаётся со статусом «новое» и распределяется позже.
 */
export default function DeductionSheet({ close }:{ close:() => void }) {
  const { points, defaultPointId, pointName } = useOrg()
  const totals = useMonthTotals()
  const active = points.filter(point => !point.archivedAt)

  const [pointId, setPointId] = useState(defaultPointId || active[0]?.id || '')
  const [employeeId, setEmployeeId] = useState('')
  const [reason, setReason] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today())

  const staff = totals.staff.filter(person => !pointId || person.pickupPointIds.includes(pointId))
  const amountKopecks = parseMoney(amount)
  const valid = Boolean(pointId) && reason.trim().length > 0 && amountKopecks > 0

  const write = useWrite({
    run: () => createDeduction({
      pickupPointId: pointId,
      employeeId: employeeId || null,
      eventAt: dayjs(`${date}T12:00`).toISOString(),
      amountKopecks,
      reason: reason.trim(),
    }),
    invalidate: [scope.deductions, scope.newDeductions],
    done: `Удержание ${rubles(amountKopecks)} · ${pointName(pointId)}`,
    onDone: close,
  })

  return <>
    {active.length > 1 && <Field label="Пункт выдачи">
      <ChoiceChips
        value={pointId}
        onPick={setPointId}
        options={active.map(point => ({ value: point.id, label: point.name.replace(/^ПВЗ\s+/, '') }))}
      />
    </Field>}

    <Field label="Причина">
      <div className="mb-2 grid gap-2">
        {REASONS.map(item => <button
          key={item}
          type="button"
          className={`tap rounded-sm border px-3 py-2.5 text-left text-act font-medium ${reason === item ? 'border-accent bg-accent-tint text-accent' : 'border-line bg-surface'}`}
          onClick={() => setReason(item)}
        >{item}</button>)}
      </div>
      <TextField placeholder="Или впишите свою" value={reason} onChange={event => setReason(event.target.value)}/>
    </Field>

    <MoneyField label="Сумма удержания" value={amount} onValueChange={setAmount}/>
    <DateField label="Дата события" value={date} onChange={setDate}/>

    <Field label="Сотрудник" hint="Можно оставить пустым и распределить позже">
      <PickList
        value={employeeId}
        onPick={value => setEmployeeId(value === employeeId ? '' : value)}
        options={[
          { value: '', name: 'Пока неизвестно', sub: 'Удержание встанет в очередь на решение' },
          ...staff.map(person => ({ value: person.id, name: person.fullName })),
        ]}
      />
    </Field>

    <Button block className="mt-3" disabled={!valid || write.isPending} onClick={() => write.mutate(undefined as void)}>
      Добавить удержание
    </Button>
  </>
}
