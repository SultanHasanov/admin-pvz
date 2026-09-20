import { useState, type ReactElement } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { Screen, Header } from '../../shared/kit/Screen'
import { Card } from '../../shared/kit/Card'
import { SectionTitle } from '../../shared/kit/Text'
import { Button } from '../../shared/kit/Button'
import { TextField } from '../../shared/kit/Field'
import { Stepper } from '../../shared/kit/Segmented'
import { EmptyState, SkeletonRows } from '../../shared/kit/Misc'
import type { PickupPoint, SlotConfig } from '../../entities/types'
import { DEFAULT_SLOTS } from '../../entities/slots'
import { keys, scope } from '../../services/queries'
import { createPickupPoint, listPickupPoints, setPickupPointArchived, setSlotConfig, updatePickupPoint } from '../../services/points'
import { useWrite } from '../../features/write'
import { useNav } from '../../app/nav'
import { useSheets } from '../../app/sheets'

/** Дни недели в нумерации slot_config: от понедельника (0). См. инвариант 7 в PROGRESS.md. */
const WEEKDAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье']

/**
 * Пункт выдачи: название, адрес, часы работы и сколько человек выходит в день.
 *
 * Часы работы становятся временем смен по умолчанию. Места по дням недели — то, из чего
 * считаются дырки в графике: «в выходные двое» задаётся здесь, а не в каждом графике.
 */
export default function PointEdit() {
  const { id = 'new' } = useParams()
  const points = useQuery({ queryKey: keys.pointsAll, queryFn: () => listPickupPoints(true) })
  const point = points.data?.find(row => row.id === id)
  const { back, canBack } = useNav()
  const header = <Header title={id === 'new' ? 'Новый пункт' : 'Пункт выдачи'} onBack={canBack ? back : undefined}/>

  if (id !== 'new' && points.isLoading) return <Screen header={header}><Card><SkeletonRows rows={3}/></Card></Screen>
  if (id !== 'new' && !point) return <Screen header={header}><Card><EmptyState title="Пункт не найден"/></Card></Screen>

  // Форма монтируется заново для каждого пункта: начальные значения берутся один раз.
  return <PointForm key={id} point={point} header={header}/>
}

function PointForm({ point, header }:{ point?:PickupPoint; header:ReactElement }) {
  const { back } = useNav()
  const { open } = useSheets()
  const [name, setName] = useState(point?.name ?? '')
  const [address, setAddress] = useState(point?.address ?? '')
  const [from, setFrom] = useState(point?.hours?.from ?? '09:00')
  const [to, setTo] = useState(point?.hours?.to ?? '21:00')
  const [slots, setSlots] = useState<SlotConfig>(point?.slotConfig ?? DEFAULT_SLOTS)

  const setDay = (index:number, count:number) => setSlots(current => {
    const wd = { ...(current.wd ?? {}) }
    // Совпало с обычным числом — исключение не нужно, иначе оно переживёт смену обычного.
    if (count === current.def) delete wd[index]
    else wd[index] = count
    return { ...current, wd }
  })

  const save = useWrite({
    run: async () => {
      const input = { name, address, timezone: point?.timezone ?? 'Europe/Moscow', hours: { from, to } }
      let id = point?.id
      if (id) await updatePickupPoint(id, input)
      else id = (await createPickupPoint(input)).id
      await setSlotConfig(id, slots)
    },
    invalidate: [scope.points],
    done: point ? 'Пункт обновлён' : 'Пункт добавлен',
    onDone: back,
  })

  const archive = useWrite({
    run: () => setPickupPointArchived(point!.id, !point!.archivedAt),
    invalidate: [scope.points],
    done: point?.archivedAt ? 'Пункт вернулся в работу' : 'Пункт в архиве',
    onDone: back,
  })

  const valid = name.trim().length > 0 && /^\d\d:\d\d$/.test(from) && /^\d\d:\d\d$/.test(to)

  return <Screen header={header} footer={<Button block disabled={!valid || save.isPending} onClick={() => save.mutate(undefined as void)}>Сохранить</Button>}>
    <div className="mb-3 text-row leading-[1.45] text-muted">
      {point ? 'Часы работы становятся временем смен по умолчанию.' : 'Новый пункт появится в выборе ПВЗ и в графике.'}
    </div>

    <Card className="p-4">
      <TextField label="Название" value={name} placeholder="ПВЗ Ленина 12" onChange={event => setName(event.target.value)}/>
      <TextField label="Адрес" value={address} placeholder="ул. Ленина, 12" onChange={event => setAddress(event.target.value)}/>
      <div className="grid grid-cols-2 gap-2">
        <TextField label="Открытие" type="time" value={from} onChange={event => setFrom(event.target.value)}/>
        <TextField label="Закрытие" type="time" value={to} onChange={event => setTo(event.target.value)}/>
      </div>
    </Card>

    <SectionTitle>Сотрудников на смене</SectionTitle>
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-row">Обычно</div>
        <Stepper value={slots.def} min={1} max={4} onChange={def => setSlots(current => ({ ...current, def }))}/>
      </div>
      <div className="mt-2 text-sub leading-[1.4] text-muted">
        Если в какие-то дни нужно больше людей — задайте ниже. Нехватка сотрудника будет видна в графике.
      </div>
      <div className="mt-3 border-t border-line-soft">
        {WEEKDAYS.map((label, index) => <div key={label} className="flex items-center justify-between gap-3 border-b border-line-soft py-2 last:border-b-0">
          <div className={slots.wd?.[index] !== undefined ? 'text-row font-medium' : 'text-row text-muted'}>{label}</div>
          <Stepper value={slots.wd?.[index] ?? slots.def} min={1} max={4} onChange={count => setDay(index, count)}/>
        </div>)}
      </div>
    </Card>

    {point && <Button
      block
      variant={point.archivedAt ? 'secondary' : 'danger'}
      className="mt-3"
      disabled={archive.isPending}
      onClick={() => open('confirm', {
        text: point.archivedAt
          ? `Вернуть ${point.name} из архива?`
          : `Перенести ${point.name} в архив? Прошлые расчёты останутся.`,
        yesLabel: point.archivedAt ? 'Вернуть' : 'В архив',
        tone: point.archivedAt ? 'accent' : 'bad',
        onYes: () => archive.mutate(undefined as void),
      })}
    >{point.archivedAt ? 'Вернуть из архива' : 'Перенести в архив'}</Button>}
  </Screen>
}
