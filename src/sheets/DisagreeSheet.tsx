import { useState } from 'react'
import { Button } from '../shared/kit/Button'
import { Banner, TextArea } from '../shared/kit/Field'
import { rubles } from '../shared/money'
import { dayLabel } from '../shared/dates'
import { disagreeWithDeduction } from '../services/deductions'
import { useWrite } from '../features/write'
import { useMe } from '../features/me/useMe'
import { scope } from '../services/queries'

/**
 * «Не согласен с удержанием» — реплика сотрудника в историю удержания.
 *
 * Статус удержания сотрудник не меняет: решение остаётся за владельцем. Реплика нужна,
 * чтобы спор был записан там же, где решение, а не в переписке.
 */
export default function DisagreeSheet({ id, reason, amountKopecks, date, close }:{
  id:string
  reason:string
  /** Доля сотрудника, а не вся сумма: спорит он со своей частью. */
  amountKopecks:number
  date:string
  close:() => void
}) {
  const { employeeId } = useMe()
  const [note, setNote] = useState('')

  const write = useWrite({
    run: () => disagreeWithDeduction(id, employeeId!, note),
    invalidate: [scope.deductionEvents],
    done: 'Отправлено владельцу',
    onDone: close,
  })

  return <>
    {!employeeId && <Banner>Аккаунт не связан с карточкой сотрудника — возражение отправить не от кого.</Banner>}

    <div className="mb-3 text-row leading-[1.45] text-muted">
      {reason} · {rubles(amountKopecks)} · {dayLabel(date)}. Владелец увидит ваш комментарий в истории удержания.
    </div>

    <TextArea
      label="Почему не согласны"
      value={note}
      onValueChange={setNote}
      placeholder="Например: в этот день работал не я"
      rows={3}
    />

    <Button block disabled={!employeeId || write.isPending} onClick={() => write.mutate(undefined as void)}>
      Отправить владельцу
    </Button>
  </>
}
