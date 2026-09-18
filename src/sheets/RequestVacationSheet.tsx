import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { Button } from '../shared/kit/Button'
import { Banner, Field } from '../shared/kit/Field'
import { ChoiceChips } from '../shared/kit/PickList'
import { SkeletonRows } from '../shared/kit/Misc'
import { VACATION_REASONS } from '../shared/requests'
import { today } from '../shared/dates'
import { DateField } from '../shared/kit/DateField'
import { keys, scope } from '../services/queries'
import { currentEmployeeId } from '../services/org'
import { createShiftRequest } from '../services/requests'
import { useWrite } from '../features/write'

const OPTIONS = VACATION_REASONS.map(reason => ({ value: reason.label, label: reason.label }))

/** Запрос отпуска или выходного. Решение принимает владелец — здесь только просьба. */
export default function RequestVacationSheet({ close }:{ close:() => void }) {
  // Отпуск просят заранее: по умолчанию предлагаем неделю через месяц, а не завтрашний день.
  const start = dayjs(today()).add(1, 'month').date(20)
  const [from, setFrom] = useState(start.format('YYYY-MM-DD'))
  const [to, setTo] = useState(start.add(7, 'day').format('YYYY-MM-DD'))
  const [reason, setReason] = useState(VACATION_REASONS[0].label)

  const me = useQuery({ queryKey: keys.me, queryFn: currentEmployeeId })
  const kind = VACATION_REASONS.find(row => row.label === reason)?.kind ?? 'VACATION'
  const days = dayjs(to).diff(dayjs(from), 'day') + 1

  const write = useWrite({
    run: () => createShiftRequest({
      employeeId: me.data!,
      kind,
      dateFrom: from,
      dateTo: to,
      reason,
    }),
    invalidate: [scope.requests],
    done: 'Запрос на отпуск отправлен',
    onDone: close,
  })

  if (me.isLoading) return <SkeletonRows rows={2}/>

  return <>
    {!me.data && <Banner>
      Аккаунт не связан с карточкой сотрудника — заявку отправить некому. Попросите владельца прислать приглашение.
    </Banner>}

    <div className="mb-3 text-row leading-[1.45] text-muted">
      Запрос уйдёт владельцу. При подтверждении дни в графике станут «Отпуск, нужна замена».
    </div>

    <DateField label="С даты" value={from} onChange={setFrom}/>
    <DateField
      label="По дату"
      value={to}
      onChange={setTo}
      hint={days > 0 ? `${days} дн.` : 'Дата окончания раньше начала — запрос будет на один день'}
    />

    <Field label="Причина">
      <ChoiceChips value={reason} options={OPTIONS} onPick={setReason}/>
    </Field>

    <Button block disabled={!me.data || write.isPending} onClick={() => write.mutate(undefined as void)}>
      Отправить запрос
    </Button>
  </>
}
