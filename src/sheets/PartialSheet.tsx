import { useState } from 'react'
import dayjs from 'dayjs'
import type { PayMode } from '../entities/types'
import { Button } from '../shared/kit/Button'
import { Field } from '../shared/kit/Field'
import { PickList } from '../shared/kit/PickList'
import { Stepper } from '../shared/kit/Segmented'
import { setShiftPayMode, updateShiftTimes } from '../services/shifts'
import { useWrite } from '../features/write'
import { scope } from '../services/queries'

/**
 * Неполный выход: половина смены или фактические часы.
 *
 * Для часов пишем фактическое время смены, а не «коэффициент»: расчёт зарплаты считает
 * часы по actual_start/actual_end, и только так сумма останется объяснимой через месяц.
 */
export default function PartialSheet({ shiftId, payMode, startsAt, close }:{
  shiftId:string
  payMode:PayMode
  startsAt:string
  close:() => void
}) {
  const [mode, setMode] = useState<PayMode>(payMode)
  const [hours, setHours] = useState(6)

  const write = useWrite({
    run: async () => {
      await setShiftPayMode(shiftId, mode)
      if (mode === 'HOURS') {
        const start = dayjs(startsAt)
        await updateShiftTimes(shiftId, start.toISOString(), start.add(hours, 'hour').toISOString())
      } else {
        // Возврат к полной или половине смены снимает ранее записанные часы.
        await updateShiftTimes(shiftId, null, null)
      }
    },
    invalidate: [scope.shifts],
    done: mode === 'FULL' ? 'Полная смена' : mode === 'HALF' ? 'Половина смены' : `${hours} ч на смене`,
    onDone: close,
  })

  return <>
    <Field>
      <PickList
        value={mode}
        onPick={value => setMode(value as PayMode)}
        options={[
          { value: 'FULL', name: 'Полная смена', sub: 'Ставка за смену целиком' },
          { value: 'HALF', name: 'Половина смены', sub: 'Половина ставки' },
          { value: 'HOURS', name: 'По часам', sub: 'Часы × часовая ставка, если она задана' },
        ]}
      />
    </Field>

    {mode === 'HOURS' && <Field label="Часов на смене" hint={`Смена началась в ${dayjs(startsAt).format('HH:mm')}`}>
      <div className="flex justify-center py-1">
        <Stepper value={hours} min={1} max={24} onChange={setHours} suffix="ч"/>
      </div>
    </Field>}

    <Button block className="mt-2" disabled={write.isPending} onClick={() => write.mutate(undefined as void)}>
      Сохранить
    </Button>
  </>
}
