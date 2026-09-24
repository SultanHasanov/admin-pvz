import { useState } from 'react'
import { Button, TextButton } from '../shared/kit/Button'
import { Card } from '../shared/kit/Card'
import { List, ListRow } from '../shared/kit/ListRow'
import { Banner, MoneyField } from '../shared/kit/Field'
import { EmptyState } from '../shared/kit/Misc'
import { isValidMoney, moneyInput, parseMoney, rubles } from '../shared/money'
import { monthLabel, today } from '../shared/dates'
import { createSalaryPayment } from '../services/salary'
import { useWrite } from '../features/write'
import { useMonthTotals } from '../features/money/useMonthTotals'
import { useSalarySheets } from '../features/money/useSalarySheets'
import { scope } from '../services/queries'

/**
 * Выплата всем разом: аванс половиной начисленного или остаток целиком.
 *
 * Список показывается до нажатия и суммы в нём видны построчно — это единственное
 * действие в приложении, которое пишет сразу по всем сотрудникам, и «вслепую» оно
 * недопустимо. Каждая выплата остаётся отдельной строкой, чтобы её можно было снять.
 */
export default function PayAllSheet({ kind = 'ADVANCE', close }:{ kind?:'ADVANCE' | 'PAYMENT'; close:() => void }) {
  const totals = useMonthTotals()
  const salary = useSalarySheets(totals)
  const [skipped, setSkipped] = useState<string[]>([])
  // Суммы, которые владелец поправил руками: аванс «половиной» подходит не всем.
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState(false)

  const rows = salary.sheets
    .map(sheet => ({
      sheet,
      suggested: kind === 'ADVANCE' ? Math.round(sheet.accrued / 2) - sheet.paid : Math.max(0, sheet.balance),
    }))
    .filter(row => row.suggested > 0)
    .map(row => {
      const edit = edits[row.sheet.employeeId]
      return { ...row, amount: edit === undefined ? row.suggested : isValidMoney(edit) ? parseMoney(edit) : 0 }
    })

  const chosen = rows.filter(row => !skipped.includes(row.sheet.employeeId) && row.amount > 0)
  const total = chosen.reduce((sum, row) => sum + row.amount, 0)
  const period = monthLabel(totals.month).split(' ')[0].toLowerCase()

  const write = useWrite({
    run: async () => {
      // Последовательно, а не пачкой: каждая выплата — своя строка с собственной датой,
      // и при ошибке на одном сотруднике остальные уже записаны.
      for (const row of chosen) {
        await createSalaryPayment({
          employeeId: row.sheet.employeeId,
          date: today(),
          accrualMonth: totals.month,
          amountKopecks: row.amount,
          kind,
        })
      }
    },
    invalidate: [scope.payments],
    done: `${kind === 'ADVANCE' ? 'Аванс' : 'Выплата'} ${rubles(total)} · ${chosen.length}`,
    onDone: close,
  })

  if (!rows.length) return <Card>
    <EmptyState
      title={kind === 'ADVANCE' ? 'Аванс выдавать нечего' : 'Остаток закрыт'}
      sub={`За ${period} все суммы уже выплачены`}
    />
  </Card>

  return <>
    {kind === 'PAYMENT' && totals.month >= today().slice(0, 7) && <Banner>
      Месяц ещё идёт: смены после сегодняшнего дня в остаток не попали.
    </Banner>}

    <div className="mb-2 flex items-baseline justify-between gap-3 text-sub text-muted">
      <span>{kind === 'ADVANCE' ? 'Половина начисленного за вычетом выплаченного.' : 'Остаток к выплате за месяц.'} Снимите галочку, чтобы не платить.</span>
      <TextButton onClick={() => setEditing(value => !value)}>{editing ? 'Готово' : 'Изменить суммы'}</TextButton>
    </div>

    <Card>
      <List>
        {rows.map(row => {
          const id = row.sheet.employeeId
          const off = skipped.includes(id)
          return <div key={id}>
            <ListRow
              leading={<span
                aria-hidden
                className={off
                  ? 'flex size-[22px] flex-none items-center justify-center rounded-xs border border-line-strong bg-surface'
                  : 'flex size-[22px] flex-none items-center justify-center rounded-xs border border-accent bg-accent text-[13px] font-semibold text-white'}
              >{off ? '' : '✓'}</span>}
              title={<span className={off ? 'text-muted line-through' : undefined}>{row.sheet.fullName}</span>}
              sub={`начислено ${rubles(row.sheet.accrued)}${row.sheet.paid ? ` · выплачено ${rubles(row.sheet.paid)}` : ''}`}
              right={off ? undefined : rubles(row.amount)}
              rightSub={off ? 'не платим' : edits[id] !== undefined && row.amount !== row.suggested ? 'своя сумма' : undefined}
              onClick={() => setSkipped(current => off ? current.filter(item => item !== id) : [...current, id])}
            />
            {editing && !off && <div className="px-4 pb-3">
              <MoneyField
                value={edits[id] ?? moneyInput(row.suggested)}
                onValueChange={value => setEdits(current => ({ ...current, [id]: value }))}
                hint={`Предложено ${rubles(row.suggested)}`}
              />
            </div>}
          </div>
        })}
      </List>
    </Card>

    <div className="mt-3 flex items-baseline justify-between gap-2">
      <div className="lbl">Итого</div>
      <div className="text-lead font-semibold tabular-nums">{rubles(total)}</div>
    </div>

    <Button block className="mt-2" disabled={!chosen.length || write.isPending} onClick={() => write.mutate(undefined as void)}>
      {kind === 'ADVANCE' ? 'Выдать аванс' : 'Выплатить остаток'} · {chosen.length}
    </Button>
  </>
}
