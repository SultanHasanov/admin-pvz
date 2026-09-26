import dayjs from 'dayjs'
import { cn } from './cn'
import { tone as tones, type Tone } from './tokens'
import { haptics } from './haptics'

export interface MatrixCell {
  lines:string[]
  tone:Tone
  strong?:boolean
  /** Незакрытое место — пунктирная рамка, как в сетке месяца. */
  vacant?:boolean
}

/**
 * Неделя по точкам: строка на ПВЗ, колонка на день.
 *
 * Месяц на несколько точек в 390px не помещается — в прототипе при выборе «Все ПВЗ»
 * сетка месяца заменяется именно этой матрицей, и видно, у какой точки провал в каком дне.
 * Листание недели — снаружи, общими стрелками графика.
 */
export function WeekMatrix({ weekStart, rows, onPick }:{
  weekStart:string
  rows:{ id:string; label:string; cells:Map<string, MatrixCell> }[]
  onPick?:(pointId:string, date:string) => void
}) {
  const days = Array.from({ length: 7 }, (_, index) => dayjs(weekStart).add(index, 'day'))
  const today = dayjs().format('YYYY-MM-DD')

  return <div className="rounded-lg border border-line bg-surface px-[11px] pt-3 pb-[13px]">
    <div className="grid items-center gap-[3px]" style={{ gridTemplateColumns: '62px repeat(7, 1fr)' }}>
      <div/>
      {days.map(day => {
        const isToday = day.format('YYYY-MM-DD') === today
        return <div key={day.format('DD')} className="flex flex-col items-center">
          <div className="font-mono text-axis text-muted">{['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'][(day.day() + 6) % 7]}</div>
          <div className={cn(
            'flex h-4 min-w-4 items-center justify-center text-tiny leading-none font-semibold tabular-nums',
            isToday ? 'rounded-full bg-accent px-1 text-white' : 'text-ink',
          )}>{day.date()}</div>
        </div>
      })}
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
          aria-label={`${row.label}, ${day.format('D MMMM')}: ${cell?.lines.join(', ') || 'свободно'}`}
          className={cn(
            'tap flex h-11 min-w-0 flex-col items-center justify-center rounded-xs text-[10px] leading-[1.2] font-semibold',
            cell?.vacant ? 'border-2 border-dashed' : 'border-[1.5px]',
          )}
          style={{
            background: cell ? palette.bg : undefined,
            borderColor: cell?.strong ? palette.fg : cell ? palette.line : 'var(--color-cell-line)',
            color: palette.fg,
          }}
          onClick={() => { if (onPick) { haptics.tap(); onPick(row.id, date) } }}
        >{cell?.lines.map(line => <span key={line} className="max-w-full truncate">{line}</span>)}</button>
      })}
    </div>)}
  </div>
}
