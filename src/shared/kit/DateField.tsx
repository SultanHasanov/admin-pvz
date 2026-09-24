import { useState } from 'react'
import dayjs from 'dayjs'
import { Field } from './Field'
import { MonthCalendar } from './MonthCalendar'
import { haptics } from './haptics'
import { dayLabel, monthLabel } from '../dates'
import { Chevron } from './icons'

/**
 * Выбор даты внутри формы: значение кнопкой, календарь раскрывается на месте.
 *
 * Вложенной шторкой календарь делать нельзя — в прототипе шторка одна за раз, и при
 * возврате из календаря заполненная форма потерялась бы. Поэтому календарь живёт
 * в самой форме.
 */
export function DateField({ label, value, onChange, hint }:{
  label:string
  value:string
  onChange:(date:string) => void
  hint?:string
}) {
  const [open, setOpen] = useState(false)
  // Листаемый месяц отдельно от выбранной даты: можно уйти на полгода вперёд и вернуться.
  const [month, setMonth] = useState(value.slice(0, 7))
  const shift = (step:number) => { haptics.tap(); setMonth(dayjs(`${month}-01`).add(step, 'month').format('YYYY-MM')) }

  return <Field label={label} hint={hint}>
    <button
      type="button"
      className="tap flex w-full items-center justify-between rounded-[13px] border border-line-strong bg-surface px-[15px] py-[14px] text-base"
      onClick={() => { haptics.tap(); setMonth(value.slice(0, 7)); setOpen(!open) }}
    >
      <span>{dayLabel(value)}, {dayjs(value).format('dddd')}</span>
      <span className="text-muted"><Chevron dir={open ? 'up' : 'down'} size={18}/></span>
    </button>

    {open && <div className="mt-2">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" aria-label="Предыдущий месяц" className="tap flex size-11 items-center justify-center rounded-md border border-line bg-surface text-accent" onClick={() => shift(-1)}><Chevron dir="left" size={22}/></button>
        <span className="text-row font-semibold">{monthLabel(month)}</span>
        <button type="button" aria-label="Следующий месяц" className="tap flex size-11 items-center justify-center rounded-md border border-line bg-surface text-accent" onClick={() => shift(1)}><Chevron size={22}/></button>
      </div>
      <MonthCalendar
        month={month}
        days={new Map()}
        selected={value}
        onPick={date => { onChange(date); setOpen(false) }}
      />
    </div>}
  </Field>
}
