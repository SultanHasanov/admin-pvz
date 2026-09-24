import { useState } from 'react'
import { Button } from '../../shared/kit/Button'
import { Field, MoneyField, TextField } from '../../shared/kit/Field'
import { cn } from '../../shared/kit/cn'
import { parseMoney, moneyInput, rubles } from '../../shared/money'
import { currentMonth, monthLabel } from '../../shared/dates'
import type { RecurringExpense } from '../../entities/types'
import { planDelete, planEdit, SUGGESTED_FIXED_COSTS } from '../../entities/fixedCosts'
import { closeRecurringExpense, createRecurringExpense, deleteRecurringExpense, updateRecurringExpense } from '../../services/finance'
import { useWrite } from '../../features/write'
import { useOrg } from '../../app/OrgContext'
import { useSheets } from '../../app/sheets'
import { scope } from '../../services/queries'
import { PointButton } from '../PointButton'

/**
 * Постоянный расход: аренда, камеры, уборка. Задаётся один раз и считается в каждом
 * месяце, в прошлых тоже. Правка и удаление — с текущего месяца, прошлые не меняются.
 * `cost` — правка существующего, `title` — подставленное название из подсказок.
 */
export default function NewRecurSheet({ cost, title: suggested, close }:{ cost?:RecurringExpense; title?:string; close:() => void }) {
  const { defaultPointId, pointName } = useOrg()
  const { open } = useSheets()
  const month = currentMonth()
  const monthName = monthLabel(month).split(' ')[0].toLowerCase()

  const [title, setTitle] = useState(cost?.category ?? suggested ?? '')
  // Новый — на пункт по умолчанию; «Все ПВЗ» (пустая строка) — общий расход.
  const [pointId, setPointId] = useState(cost ? cost.pickupPointId ?? '' : defaultPointId ?? '')
  const [amount, setAmount] = useState(cost ? moneyInput(cost.amountKopecks) : '')

  const kopecks = parseMoney(amount)
  const change = { category: title.trim(), pickupPointId: pointId || null, amountKopecks: kopecks }
  const plan = cost ? planEdit(cost, change, month) : null
  const valid = Boolean(change.category && kopecks > 0) && (!cost || plan !== null)
  const invalidate = [scope.recurring, scope.categories, scope.transactions]

  const write = useWrite({
    run: async () => {
      if (!cost) return createRecurringExpense({ ...change, startMonth: null })
      if (plan?.kind === 'update') return updateRecurringExpense(cost.id, change)
      if (plan?.kind === 'closeAndCreate') {
        await closeRecurringExpense(cost.id, plan.endMonth)
        await createRecurringExpense({ ...change, startMonth: plan.startMonth })
      }
    },
    invalidate,
    done: () => cost ? `Сохранено · ${rubles(kopecks)} в месяц с ${monthName}` : `${change.category} · ${rubles(kopecks)} каждый месяц`,
    onDone: close,
  })

  const remove = useWrite({
    run: async () => {
      const removal = planDelete(cost!, month)
      if (removal.kind === 'delete') await deleteRecurringExpense(cost!.id)
      else if (removal.kind === 'close') await closeRecurringExpense(cost!.id, removal.endMonth)
    },
    invalidate,
    done: 'Постоянный расход удалён',
    onDone: close,
  })

  return <>
    <TextField label="Название" value={title} placeholder="Камеры" onChange={event => setTitle(event.target.value)}/>
    {!cost && <div className="-mt-1 mb-3 flex flex-wrap gap-2">
      {SUGGESTED_FIXED_COSTS.map(name => <button
        key={name}
        type="button"
        className={cn('tap rounded-sm border px-3 py-[7px] text-act font-medium', title === name ? 'border-accent bg-accent-tint text-accent' : 'border-line bg-surface')}
        onClick={() => setTitle(name)}
      >{name}</button>)}
    </div>}

    <PointButton value={pointId} onPick={setPointId} withAll/>

    <MoneyField
      label="Сумма в месяц"
      value={amount}
      onValueChange={setAmount}
      hint={cost
        ? `Новая сумма — с ${monthName}, прошлые месяцы не меняются`
        : 'Считается в каждом месяце, в прошлых тоже'}
    />

    <Button block disabled={!valid || write.isPending} onClick={() => write.mutate(undefined as void)}>
      {cost ? 'Сохранить' : 'Добавить'}
    </Button>

    {cost && <Field className="mt-2">
      <Button block variant="danger" disabled={remove.isPending} onClick={() => open('confirm', {
        text: `Удалить «${cost.category}» · ${cost.pickupPointId ? pointName(cost.pickupPointId) : 'все ПВЗ'}? Перестанет считаться с ${monthName}, в прошлых месяцах останется.`,
        yesLabel: 'Удалить',
        tone: 'bad',
        onYes: () => remove.mutate(undefined as void),
      })}>Удалить</Button>
    </Field>}
  </>
}
