import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { EntryKind, Transaction } from '../entities/types'
import { Button } from '../shared/kit/Button'
import { Checkbox } from '../shared/kit/Checkbox'
import { DateField } from '../shared/kit/DateField'
import { Field, MoneyField, TextField } from '../shared/kit/Field'
import { ChoiceChips } from '../shared/kit/PickList'
import { cn } from '../shared/kit/cn'
import { moneyInput, parseMoney, rubles } from '../shared/money'
import { today } from '../shared/dates'
import { keys, scope } from '../services/queries'
import { createTransaction, deleteTransaction, listExpenseCategories, updateTransaction } from '../services/finance'
import { listEntryPresets, rememberAmount } from '../services/presets'
import { useWrite } from '../features/write'
import { useOrg } from '../app/OrgContext'

const INCOME_CATEGORIES = ['Выручка WB', 'Платное хранение', 'Прочий доход']

/**
 * Доход или расход одной формой.
 *
 * Сумма подставляется из запомненной для пары «ПВЗ + категория»: в ПВЗ одни и те же
 * платежи повторяются каждый месяц, и заново набирать «45 000» за аренду бессмысленно.
 * Галочка «Запомнить» перезаписывает пресет.
 *
 * С `entry` — правка уже записанной операции из журнала: те же поля, плюс удаление.
 */
export default function OpSheet({ kind: kindProp = 'EXPENSE', entry, close }:{ kind?:EntryKind; entry?:Transaction; close:() => void }) {
  const kind = entry?.kind ?? kindProp
  const { points, defaultPointId, pointName } = useOrg()
  const active = points.filter(point => !point.archivedAt)

  const [pointId, setPointId] = useState(entry?.pickupPointId || defaultPointId || active[0]?.id || '')
  const [category, setCategory] = useState(entry?.category ?? '')
  const [amount, setAmount] = useState(entry ? moneyInput(entry.amountKopecks) : '')
  const [date, setDate] = useState(entry?.date ?? today())
  const [note, setNote] = useState(entry?.description ?? '')
  const [remember, setRemember] = useState(false)

  const presets = useQuery({
    queryKey: keys.presets(pointId),
    queryFn: () => listEntryPresets(pointId),
    enabled: Boolean(pointId),
  })
  const categories = useQuery({
    queryKey: keys.categories(),
    queryFn: () => listExpenseCategories(),
    enabled: kind === 'EXPENSE',
  })

  const known = useMemo(() => kind === 'INCOME'
    ? INCOME_CATEGORIES
    : (categories.data ?? []).map(row => row.name), [kind, categories.data])

  const preset = presets.data?.find(row => row.kind === kind && row.categoryName === category)

  /** Выбор категории сразу подставляет запомненную сумму, но не затирает уже введённую. */
  const pickCategory = (name:string) => {
    setCategory(name)
    const remembered = presets.data?.find(row => row.kind === kind && row.categoryName === name)
    if (remembered && !amount) setAmount(moneyInput(remembered.amountKopecks))
  }

  const amountKopecks = parseMoney(amount)
  const valid = Boolean(pointId) && category.trim().length > 0 && amountKopecks > 0

  const write = useWrite({
    run: async () => {
      const input = { kind, pickupPointId: pointId, category: category.trim(), amountKopecks, date, description: note }
      if (entry) await updateTransaction(entry.id, input)
      else await createTransaction(input)
      if (remember) await rememberAmount({ pickupPointId: pointId, kind, category: category.trim(), amountKopecks })
    },
    invalidate: [scope.transactions, scope.presets, scope.categories, scope.recurringOccurrences],
    done: entry
      ? `Операция изменена · ${rubles(amountKopecks)}`
      : `${kind === 'INCOME' ? 'Доход' : 'Расход'} ${rubles(amountKopecks)} · ${pointName(pointId)}`,
    onDone: close,
  })

  const remove = useWrite({
    run: () => deleteTransaction(kind, entry!.id),
    invalidate: [scope.transactions, scope.recurringOccurrences],
    done: 'Операция удалена',
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

    <Field label="Категория">
      <div className="mb-2 flex flex-wrap gap-2">
        {known.map(name => <button
          key={name}
          type="button"
          className={cn(
            'tap rounded-sm border px-3 py-[7px] text-act font-medium',
            category === name ? 'border-accent bg-accent-tint text-accent' : 'border-line bg-surface',
          )}
          onClick={() => pickCategory(name)}
        >{name}</button>)}
      </div>
      <TextField
        placeholder="Или впишите свою"
        value={category}
        onChange={event => setCategory(event.target.value)}
      />
    </Field>

    <MoneyField
      label="Сумма"
      value={amount}
      onValueChange={setAmount}
      hint={preset ? `Запомнено для «${preset.categoryName}»: ${rubles(preset.amountKopecks)}` : undefined}
    />

    <DateField label="Дата" value={date} onChange={setDate}/>

    <TextField
      label="Комментарий"
      placeholder="Необязательно"
      value={note}
      onChange={event => setNote(event.target.value)}
    />

    {Boolean(pointId) && category.trim() && <Checkbox checked={remember} onChange={setRemember}>
      Запомнить эту сумму для «{category.trim()}» на {pointName(pointId)}
    </Checkbox>}

    <Button
      block
      className="mt-3"
      disabled={!valid || write.isPending}
      onClick={() => write.mutate(undefined as void)}
    >{entry ? 'Сохранить' : kind === 'INCOME' ? 'Добавить доход' : 'Добавить расход'}</Button>

    {entry && <Button
      block
      variant="danger"
      className="mt-2"
      disabled={remove.isPending}
      onClick={() => remove.mutate(undefined as void)}
    >Удалить операцию</Button>}
  </>
}
