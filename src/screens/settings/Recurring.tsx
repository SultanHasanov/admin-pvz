import { useQueries } from '@tanstack/react-query'
import { Screen, Header } from '../../shared/kit/Screen'
import { Card } from '../../shared/kit/Card'
import { Button } from '../../shared/kit/Button'
import { EmptyState, ErrorNote, SkeletonRows } from '../../shared/kit/Misc'
import { cn } from '../../shared/kit/cn'
import { useLayout } from '../../shared/kit/layout'
import { rubles } from '../../shared/money'
import { dayLabel } from '../../shared/dates'
import { keys, scope } from '../../services/queries'
import {
  confirmRecurringExpense, listRecurringExpenses, listRecurringOccurrences,
  recurringDueDate, skipRecurringExpense,
} from '../../services/finance'
import { recurringState } from '../../features/home/useAlerts'
import { useWrite } from '../../features/write'
import { useOrg } from '../../app/OrgContext'
import { useNav } from '../../app/nav'
import { useSheets } from '../../app/sheets'

/**
 * Регулярные расходы месяца. Каждый ждёт подтверждения: «Оплачено» создаёт операцию
 * в финансах, «Пропустить» закрывает месяц без расхода. Сами они ничего не списывают —
 * аренда может прийти другой суммой, и тихая запись была бы неправдой.
 */
export default function Recurring() {
  const { month, pointId, pointName } = useOrg()
  const { back, canBack } = useNav()
  const { open } = useSheets()
  const { desktop } = useLayout()

  const [recurring, occurrences] = useQueries({
    queries: [
      { queryKey: keys.recurring, queryFn: listRecurringExpenses },
      { queryKey: keys.recurringOccurrences(month), queryFn: () => listRecurringOccurrences(month) },
    ],
  })

  const invalidate = [scope.recurring, scope.recurringOccurrences, scope.transactions]
  const pay = useWrite({
    run: ({ id, dueOn }:{ id:string; dueOn:string; label:string }) => confirmRecurringExpense(id, dueOn),
    invalidate,
    done: vars => `${vars.label} в расходах`,
  })
  const skip = useWrite({
    run: ({ id, dueOn }:{ id:string; dueOn:string }) => skipRecurringExpense(id, dueOn),
    invalidate,
    done: 'Пропущено в этом месяце',
  })

  const rows = (recurring.data ?? [])
    .filter(row => row.active && (!pointId || row.pickupPointId === pointId))
    .map(expense => {
      const dueOn = recurringDueDate(month, expense.dayOfMonth)
      const occurrence = occurrences.data?.find(row => row.recurringExpenseId === expense.id && row.dueOn === dueOn)
      return { expense, dueOn, status: occurrence?.status ?? 'PENDING' }
    })
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn))

  return <Screen header={<Header title="Регулярные расходы" onBack={canBack ? back : undefined}/>}>
    <div className="mb-3 text-row leading-[1.45] text-muted">
      Каждый месяц эти расходы ждут подтверждения. «Оплачено» создаёт операцию в финансах.
    </div>

    {recurring.error && <div className="mb-3"><ErrorNote error={recurring.error}/></div>}
    {recurring.isLoading && <Card><SkeletonRows rows={3}/></Card>}
    {!recurring.isLoading && !rows.length && <Card>
      <EmptyState title="Регулярных расходов нет" sub="Аренда, интернет и уборка — добавьте их один раз, дальше они будут напоминать о себе"/>
    </Card>}

    {/* Десктоп: карточки в две колонки, а не таблица — у ожидающих свои кнопки. */}
    <div className={cn('grid items-start gap-2', desktop && 'grid-cols-2')}>
      {rows.map(({ expense, dueOn, status }) => {
        const due = status === 'PENDING'
        const state = due ? recurringState(dueOn) : null
        return <div key={expense.id} className={cn('rounded-lg border bg-surface p-4', due ? 'border-warn-banner-line' : 'border-line')}>
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-row font-medium">{expense.category}</div>
              <div className="mt-0.5 text-sub text-muted">
                {pointName(expense.pickupPointId)} · {expense.dayOfMonth} число каждого месяца
              </div>
            </div>
            <div className="text-right">
              <div className="text-row font-semibold tabular-nums">{rubles(expense.amountKopecks)}</div>
              <div className={cn('mt-0.5 text-sub', due ? 'text-warn' : status === 'PAID' ? 'text-ok' : 'text-muted')}>
                {due ? `ожидает оплаты · ${state!.text}` : status === 'PAID' ? 'оплачено' : 'пропущено'}
              </div>
            </div>
          </div>
          {due && <div className="mt-3 grid grid-cols-2 gap-2">
            <Button
              disabled={pay.isPending}
              onClick={() => pay.mutate({ id: expense.id, dueOn, label: `${expense.category} · ${rubles(expense.amountKopecks)}` })}
            >Оплачено</Button>
            <Button variant="secondary" disabled={skip.isPending} onClick={() => skip.mutate({ id: expense.id, dueOn })}>Пропустить</Button>
          </div>}
          {due && <div className="mt-2 text-sub text-muted">Срок — {dayLabel(dueOn)}</div>}
        </div>
      })}
    </div>

    <Button block variant="secondary" className="mt-3" onClick={() => open('newRecur')}>Добавить регулярный расход</Button>
  </Screen>
}
