import dayjs from 'dayjs'
import { weekLabel } from '../dates'
import { cn } from './cn'
import { tone as tones, type Tone } from './tokens'
import { haptics } from './haptics'

export interface MatrixCell { label:string; tone:Tone; strong?:boolean }

/**
 * Неделя по точкам: строка на ПВЗ, колонка на день.
 *
 * Месяц на несколько точек в 390px не помещается — в прототипе при выборе «Все ПВЗ»
 * сетка месяца заменяется именно этой матрицей, и видно, у какой точки провал в каком дне.
 */
export function WeekMatrix({ weekStart, rows, onWeek, onPick }:{
  weekStart:string
  rows:{ id:string; label:string; cells:Map<string, MatrixCell> }[]
  onWeek:(next:string) => void
  onPick?:(pointId:string, date:string) => void
}) {
  const days = Array.from({ length: 7 }, (_, index) => dayjs(weekStart).add(index, 'day'))
  const today = dayjs().format('YYYY-MM-DD')
  const label = weekLabel(weekStart)

  return <div className="rounded-lg border border-line bg-surface px-[11px] pt-3 pb-[13px]">
    <div className="mb-2 flex items-center gap-2">
      <button
        type="button"
        aria-label="Предыдущая неделя"
        className="tap flex size-[26px] items-center justify-center rounded-xs bg-line-faint text-[15px] leading-none text-muted-strong"
        onClick={() => onWeek(dayjs(weekStart).subtract(1, 'week').format('YYYY-MM-DD'))}
      >‹</button>
      <div className="flex-1 text-center text-[13px] font-semibold">{label}</div>
      <button
        type="button"
        aria-label="Следующая неделя"
        className="tap flex size-[26px] items-center justify-center rounded-xs bg-line-faint text-[15px] leading-none text-muted-strong"
        onClick={() => onWeek(dayjs(weekStart).add(1, 'week').format('YYYY-MM-DD'))}
      >›</button>
    </div>

    <div className="grid items-center gap-[3px]" style={{ gridTemplateColumns: '62px repeat(7, 1fr)' }}>
      <div/>
      {days.map(day => <div key={day.format('DD')} className="text-center">
        <div className="font-mono text-[9px] text-muted-soft">{['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'][(day.day() + 6) % 7]}</div>
        <div
          className="text-[11px] font-semibold tabular-nums"
          style={{ color: day.format('YYYY-MM-DD') === today ? 'var(--color-accent)' : 'var(--color-ink)' }}
        >{day.date()}</div>
      </div>)}
    </div>

    {rows.map(row => <div
      key={row.id}
      className="mt-[3px] grid items-stretch gap-[3px]"
      style={{ gridTemplateColumns: '62px repeat(7, 1fr)' }}
    >
      <div className="flex items-center pr-1 text-lbl leading-[1.2] font-semibold text-muted-strong">{row.label}</div>
      {days.map(day => {
        const date = day.format('YYYY-MM-DD')
        const cell = row.cells.get(date)
        const palette = tones[cell?.tone ?? 'neutral']
        return <button
          key={date}
          type="button"
          className={cn('tap flex h-[38px] items-center justify-center rounded-xs border-[1.5px] text-[8.5px] leading-[1.3] font-semibold')}
          style={{
            background: cell ? palette.bg : undefined,
            borderColor: cell?.strong ? palette.fg : cell ? palette.line : 'var(--color-cell-line)',
            color: palette.fg,
          }}
          onClick={() => { if (onPick) { haptics.tap(); onPick(row.id, date) } }}
        >{cell?.label ?? ''}</button>
      })}
    </div>)}
  </div>
}
