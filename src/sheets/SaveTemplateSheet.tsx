import { useState } from 'react'
import type { PayMode } from '../entities/types'
import type { SlotPlan } from '../entities/slots'
import { Button } from '../shared/kit/Button'
import { TextField } from '../shared/kit/Field'
import { saveScheduleTemplate } from '../services/scheduleTemplates'
import { useWrite } from '../features/write'
import { scope } from '../services/queries'

/**
 * Сохранить настроенный график шаблоном.
 *
 * Шаблон хранит число мест и очередь по каждому месту, но не период: график применяют
 * к разным месяцам, и вшитые даты делали бы шаблон одноразовым.
 */
export default function SaveTemplateSheet({ plans, pointId, startsAt, endsAt, payMode, close }:{
  plans:SlotPlan[]
  pointId:string
  startsAt:string
  endsAt:string
  payMode:PayMode
  close:() => void
}) {
  const [name, setName] = useState('')

  const employeeIds = [...new Set(plans.flatMap(plan => plan.pattern.kind === 'cycle'
    ? plan.pattern.participants.map(participant => participant.employeeId)
    : plan.pattern.kind === 'alternatingBlocks'
      ? [plan.pattern.firstId, plan.pattern.secondId].filter(Boolean)
      : Object.keys(plan.pattern.byEmployee)))]

  const write = useWrite({
    run: () => saveScheduleTemplate({
      name,
      pattern: { v: 2, kind: 'slots', slots: plans },
      employeeIds,
      pickupPointId: pointId,
      startsAt,
      endsAt,
      payMode,
    }),
    invalidate: [scope.scheduleTemplates],
    done: 'Шаблон сохранён',
    onDone: close,
  })

  return <>
    <TextField
      label="Название"
      placeholder="Например: Основной 2/2"
      value={name}
      onChange={event => setName(event.target.value)}
      hint={`Сотрудников на смене: ${plans.length} · сотрудников в очередях: ${employeeIds.length}`}
    />

    <Button block disabled={!name.trim() || write.isPending} onClick={() => write.mutate(undefined as void)}>
      Сохранить шаблон
    </Button>
  </>
}
