import dayjs from 'dayjs'
import { cn } from './cn'
import { tone as tones, type Tone } from './tokens'
import { haptics } from './haptics'

export interface CalendarDay {
  date:string
  /** Что написать под числом: инициалы вышедших, «нет» для пустого дня. */
  lines:string[]
  tone:Tone
  /** Пустая клетка требует внимания — её рамку рисуем сплошным цветом тона. */
  strong?:boolean
}

const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']

/**
 * Сетка месяца. Клетка 52px — минимальная, в которую влезают число и строка инициалов,
 * и при этом семь колонок помещаются в 390px без горизонтальной прокрутки.
 */
export function MonthCalendar({ month, days, selected, onPick }:{
  month:string
  days:Map<string, CalendarDay>
  selected?:string
  onPick?:(date:string) => void
}) {
  const first = dayjs(`${month}-01`)
  const lead = (first.day() + 6) % 7
  const total = first.daysInMonth()
  const cells = Array.from({ length: Math.ceil((lead + total) / 7) * 7 }, (_, index) =>
    index < lead || index >= lead + total ? null : first.add(index - lead, 'day'))
  const today = dayjs().format('YYYY-MM-DD')

  return <div className="rounded-lg border border-line bg-surface px-[11px] pt-3 pb-[13px]">
    <div className="mb-[5px] grid grid-cols-7 gap-[3px]">
      {WEEKDAYS.map((day, index) => <div
        key={day}
        className={cn('text-center font-mono text-axis', index > 4 ? 'text-muted-faint' : 'text-muted')}
      >{day}</div>)}
    </div>

    <div className="grid grid-cols-7 gap-[3px]">
      {cells.map((day, index) => {
        if (!day) return <div key={`gap-${index}`}/>
        const date = day.format('YYYY-MM-DD')
        const entry = days.get(date)
        const palette = tones[entry?.tone ?? 'neutral']
        const isToday = date === today
        const isSelected = date === selected

        return <button
          key={date}
          type="button"
          className={cn(
            'tap flex h-[52px] flex-col items-center justify-center gap-px rounded-md border-[1.5px]',
            date > today && 'opacity-90',
          )}
          style={{
            background: entry ? palette.bg : undefined,
            borderColor: isSelected ? 'var(--color-ink)' : entry?.strong ? palette.fg : entry ? palette.line : 'var(--color-cell-line)',
          }}
          onClick={() => { if (onPick) { haptics.tap(); onPick(date) } }}
        >
          <div
            className="text-tiny leading-[1.1] font-semibold tabular-nums"
            style={{ color: isToday ? 'var(--color-accent)' : entry ? palette.fg : 'var(--color-muted)' }}
          >{day.date()}</div>
          {entry?.lines.slice(0, 2).map(line => <div
            key={line}
            className="text-[9px] leading-[1.25] font-semibold"
            style={{ color: palette.fg }}
          >{line}</div>)}
        </button>
      })}
    </div>
  </div>
}
