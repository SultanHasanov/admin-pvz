import { useState } from 'react'
import { Button } from '../shared/kit/Button'
import { Banner, MoneyField } from '../shared/kit/Field'
import { Card } from '../shared/kit/Card'
import { List, ListRow } from '../shared/kit/ListRow'
import { EmptyState } from '../shared/kit/Misc'
import { moneyInput, parseMoney, rubles } from '../shared/money'
import { setDeductionParts } from '../services/deductions'
import { useWrite } from '../features/write'
import { useMonthTotals } from '../features/money/useMonthTotals'
import { scope } from '../services/queries'

/**
 * Разделить удержание между сотрудниками: «Ирина 1 000, Камила 1 000, 400 — убыток».
 *
 * Сумма по людям не может превысить удержание — это же правило стоит триггером в базе,
 * и лучше показать его до запроса. Всё, что не разложено, остаётся убытком владельца;
 * пустые поля — «на этом человеке ничего». Статус ставит RPC: есть части — «из зарплаты».
 */
export default function SplitSheet({ id, close }:{ id:string; close:() => void }) {
  const totals = useMonthTotals()
  const deduction = totals.deductions.find(row => row.id === id)

  // Предлагаем сначала тех, кто работает на точке удержания: делят обычно между сменой.
  const staff = totals.staff
    .filter(person => person.status === 'ACTIVE')
    .sort((a, b) => Number(b.pickupPointIds.includes(deduction?.pickupPointId ?? ''))
      - Number(a.pickupPointIds.includes(deduction?.pickupPointId ?? '')))

  const [amounts, setAmounts] = useState<Record<string, string>>(() => {
    const current = totals.parts.filter(part => part.deductionId === id)
    if (current.length) return Object.fromEntries(current.map(part => [part.employeeId, moneyInput(part.amountKopecks)]))
    // Удержание было на одном человеке целиком — это и есть стартовая раскладка.
    return deduction?.employeeId ? { [deduction.employeeId]: moneyInput(deduction.amountKopecks) } : {}
  })

  const parts = Object.entries(amounts)
    .map(([employeeId, value]) => ({ employeeId, amountKopecks: value.trim() ? parseMoney(value) : 0 }))
    .filter(part => Number.isFinite(part.amountKopecks) && part.amountKopecks > 0)
  const assigned = parts.reduce((sum, part) => sum + part.amountKopecks, 0)
  const total = deduction?.amountKopecks ?? 0
  const over = assigned > total

  const write = useWrite({
    run: () => setDeductionParts(id, parts),
    invalidate: [scope.deductions, scope.deductionParts, scope.deductionEvents, scope.newDeductions],
    done: parts.length
      ? `Разделено: ${parts.length} чел.${total - assigned > 0 ? ` · убыток ${rubles(total - assigned)}` : ''}`
      : 'Удержание — убыток владельца',
    onDone: close,
  })

  if (!deduction) return <Card><EmptyState title="Удержание не найдено" sub="Откройте его заново из списка"/></Card>

  return <>
    <div className="mb-3 text-row leading-[1.45] text-muted">
      {deduction.reason} · {rubles(total)}. Пустое поле — на этом сотруднике ничего.
    </div>

    {staff.map(person => <MoneyField
      key={person.id}
      label={person.fullName}
      value={amounts[person.id] ?? ''}
      onValueChange={value => setAmounts(current => ({ ...current, [person.id]: value }))}
    />)}

    {over && <Banner tone="bad">По сотрудникам {rubles(assigned)} — больше суммы удержания на {rubles(assigned - total)}</Banner>}

    <Card className="mb-3">
      <List>
        <ListRow title="На сотрудниках" right={rubles(assigned)}/>
        <ListRow title="Убыток владельца" right={rubles(Math.max(0, total - assigned))}/>
      </List>
    </Card>

    <Button block disabled={over || write.isPending} onClick={() => write.mutate(undefined as void)}>
      Сохранить доли
    </Button>
  </>
}
