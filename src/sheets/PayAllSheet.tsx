import { useState } from 'react'
import { Button } from '../shared/kit/Button'
import { Card } from '../shared/kit/Card'
import { Avatar, List, ListRow } from '../shared/kit/ListRow'
import { Banner } from '../shared/kit/Field'
import { EmptyState } from '../shared/kit/Misc'
import { initials } from '../shared/shifts'
import { rubles } from '../shared/money'
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

  const rows = salary.sheets
    .map(sheet => ({
      sheet,
      amount: kind === 'ADVANCE' ? Math.round(sheet.accrued / 2) - sheet.paid : Math.max(0, sheet.balance),
    }))
    .filter(row => row.amount > 0)

  const chosen = rows.filter(row => !skipped.includes(row.sheet.employeeId))
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

    <Card>
      <List>
        {rows.map(row => {
          const off = skipped.includes(row.sheet.employeeId)
          return <ListRow
            key={row.sheet.employeeId}
            leading={<Avatar initials={initials(row.sheet.fullName)} tone={off ? 'neutral' : 'accent'}/>}
            title={<span className={off ? 'text-muted line-through' : undefined}>{row.sheet.fullName}</span>}
            sub={`начислено ${rubles(row.sheet.accrued)}`}
            right={rubles(row.amount)}
            rightSub={off ? 'пропустить' : 'выплатить'}
            rightSubTone={off ? 'neutral' : 'ok'}
            onClick={() => setSkipped(current => off
              ? current.filter(id => id !== row.sheet.employeeId)
              : [...current, row.sheet.employeeId])}
          />
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
