import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '../../shared/kit/Button'
import { TextField } from '../../shared/kit/Field'
import { keys } from '../../services/queries'
import { getPayoutSettings, savePayoutDays } from '../../services/payoutSettings'
import { useWrite } from '../../features/write'

const dayOk = (value:number) => Number.isInteger(value) && value >= 1 && value <= 31

/**
 * Дни выплат. Аванс — в месяце начисления, остаток — в следующем: по ним считаются
 * напоминания в колокольчике и подпись «ближайшая выплата» у сотрудника.
 */
export default function SetPayDaysSheet({ close }:{ close:() => void }) {
  const settings = useQuery({ queryKey: keys.payoutSettings, queryFn: getPayoutSettings })
  const [advance, setAdvance] = useState<string>()
  const [rest, setRest] = useState<string>()
  const advanceValue = advance ?? String(settings.data?.advanceDay ?? 15)
  const restValue = rest ?? String(settings.data?.payday ?? 5)
  const valid = dayOk(Number(advanceValue)) && dayOk(Number(restValue))

  const write = useWrite({
    run: () => savePayoutDays(Number(advanceValue), Number(restValue)),
    invalidate: [keys.payoutSettings],
    done: 'Дни выплат обновлены',
    onDone: close,
  })

  return <>
    <TextField label="День аванса" inputMode="numeric" value={advanceValue} hint="В месяце начисления" onChange={event => setAdvance(event.target.value)}/>
    <TextField label="День остатка" inputMode="numeric" value={restValue} hint="В следующем месяце — когда месяц уже закрыт" onChange={event => setRest(event.target.value)}/>
    <Button block disabled={!valid || write.isPending} onClick={() => write.mutate(undefined as void)}>
      {valid ? 'Сохранить' : 'Число месяца от 1 до 31'}
    </Button>
  </>
}
