import { useState } from 'react'
import dayjs from 'dayjs'
import { Field } from './Field'
import { MonthCalendar } from './MonthCalendar'
import { haptics } from './haptics'
import { dayLabel } from '../dates'

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
  const month = value.slice(0, 7)

  return <Field label={label} hint={hint}>
    <button
      type="button"
      className="tap flex w-full items-center justify-between rounded-[13px] border border-line-strong bg-surface px-[15px] py-[14px] text-base"
      onClick={() => { haptics.tap(); setOpen(!open) }}
    >
      <span>{dayLabel(value)}, {dayjs(value).format('dddd')}</span>
      <span className="text-axis text-muted">{open ? '▴' : '▾'}</span>
    </button>

    {open && <div className="mt-2">
      <MonthCalendar
        month={month}
        days={new Map()}
        selected={value}
        onPick={date => { onChange(date); setOpen(false) }}
      />
    </div>}
  </Field>
}
