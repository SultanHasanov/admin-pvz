import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '../shared/kit/Button'
import { Banner, Field } from '../shared/kit/Field'
import { ChoiceChips } from '../shared/kit/PickList'
import { SkeletonRows } from '../shared/kit/Misc'
import { SHIFT_REASONS } from '../shared/requests'
import { dayLabel } from '../shared/dates'
import { keys, scope } from '../services/queries'
import { currentEmployeeId } from '../services/org'
import { createShiftRequest } from '../services/requests'
import { useWrite } from '../features/write'
import { useOrg } from '../app/OrgContext'

const OPTIONS = SHIFT_REASONS.map(reason => ({ value: reason, label: reason }))

/**
 * «Не смогу выйти» — заявка сотрудника на конкретную смену.
 *
 * Сотрудник ничего не меняет в графике сам: смена остаётся за ним, пока владелец
 * не примет решение. Иначе точка тихо осталась бы без человека, и никто бы не узнал.
 */
export default function CantWorkSheet({ date, pointId, close }:{
  date:string
  pointId?:string
  close:() => void
}) {
  const { pointName } = useOrg()
  const [reason, setReason] = useState<string>(SHIFT_REASONS[0])

  const me = useQuery({ queryKey: keys.me, queryFn: currentEmployeeId })

  const write = useWrite({
    run: () => createShiftRequest({
      employeeId: me.data!,
      pickupPointId: pointId ?? null,
      kind: 'SHIFT',
      dateFrom: date,
      dateTo: date,
      reason,
    }),
    invalidate: [scope.requests],
    done: 'Запрос отправлен владельцу',
    onDone: close,
  })

  if (me.isLoading) return <SkeletonRows rows={2}/>

  return <>
    {!me.data && <Banner>
      Аккаунт не связан с карточкой сотрудника — заявку отправить некому. Попросите владельца прислать приглашение.
    </Banner>}

    <div className="mb-3 text-row leading-[1.45] text-muted">
      Владелец увидит это в «Требуют внимания» и назначит замену — статус будет виден вам.
    </div>

    <Field
      label="Причина"
      hint={`Смена: ${dayLabel(date)}${pointId ? ` · ${pointName(pointId)}` : ''}`}
    >
      <ChoiceChips value={reason} options={OPTIONS} onPick={setReason}/>
    </Field>

    <Button block disabled={!me.data || write.isPending} onClick={() => write.mutate(undefined as void)}>
      Сообщить владельцу
    </Button>
  </>
}
