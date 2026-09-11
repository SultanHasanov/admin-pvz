import { Card, Tooltip, Typography } from 'antd'
import dayjs from 'dayjs'
import type { Employee, Shift } from '../../entities/types'
import { monthEnd, monthStart } from '../../shared/dates'
import { employeeTone, initials } from '../../shared/shifts'
import { useIsMobile } from '../../shared/ui'

export interface DayEntry { employeeId:string; shift?:Shift; preview?:boolean }

const SHORT = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']

export interface MonthGridProps {
  month:string
  /** Ключ — YYYY-MM-DD. */
  entriesByDate:Map<string, DayEntry[]>
  employees:Employee[]
  selected?:string
  /** В предпросмотре мастера клетки не кликаются. */
  readOnly?:boolean
  dimmed?:string
  onPickDay?:(date:string) => void
}

export function MonthGrid({ month, entriesByDate, employees, selected, readOnly, dimmed, onPickDay }:MonthGridProps) {
  const mobile = useIsMobile()
  const first = dayjs(monthStart(month))
  const lead = (first.day() + 6) % 7
  const total = dayjs(monthEnd(month)).diff(first, 'day')
  const cells = Array.from({ length: Math.ceil((lead + total) / 7) * 7 }, (_, index) =>
    index < lead || index >= lead + total ? null : first.add(index - lead, 'day'))

  const tone = (employeeId:string) => employeeTone(Math.max(0, employees.findIndex(e => e.id === employeeId)))
  const nameOf = (employeeId:string) => employees.find(e => e.id === employeeId)?.fullName ?? 'Сотрудник'

  // 1px зазор поверх серого фона даёт волосяные разделители, не переполняя клетки границами.
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 1, background: '#e9edf0', borderRadius: 10, overflow: 'hidden' }}>
    {SHORT.map(day => <div key={day} style={{ background: '#fafafa', padding: '6px 0', textAlign: 'center' }}>
      <Typography.Text type="secondary" style={{ fontSize: 10 }}>{day}</Typography.Text>
    </div>)}

    {cells.map((day, index) => {
      if (!day) return <div key={`gap-${index}`} style={{ background: '#fafafa', minHeight: 56 }}/>
      const date = day.format('YYYY-MM-DD')
      const entries = entriesByDate.get(date) ?? []
      const weekend = day.day() === 0 || day.day() === 6
      const today = day.isSame(dayjs(), 'day')
      // День, где все смены сорвались, гасим — точки там означают не работу, а её отсутствие.
      const spent = entries.length > 0 && entries.every(e => e.shift && (e.shift.status === 'NO_SHOW' || e.shift.status === 'REPLACED'))

      return <div
        key={date}
        onClick={() => !readOnly && onPickDay?.(date)}
        style={{
          background: today ? '#f0fdf4' : '#fff', minHeight: 56, padding: '4px 3px',
          cursor: readOnly ? 'default' : 'pointer',
          outline: selected === date ? '2px solid #16a34a' : undefined, outlineOffset: -2,
          opacity: spent ? 0.55 : 1,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 600, color: today ? '#15803d' : weekend ? '#94a3b8' : '#172026' }}>{day.date()}</div>
        <div className="mt-1 flex flex-wrap gap-[3px]">
          {entries.slice(0, 3).map((entry, position) => <Marker
            key={`${entry.employeeId}-${position}`} mobile={mobile} entry={entry}
            color={tone(entry.employeeId)} name={nameOf(entry.employeeId)}
            faded={Boolean(dimmed && dimmed !== entry.employeeId)}
          />)}
          {entries.length > 3 && <span style={{ fontSize: 9, color: '#64748b', lineHeight: '10px' }}>+{entries.length - 3}</span>}
        </div>
      </div>
    })}
  </div>
}

function Marker({ mobile, entry, color, name, faded }:{ mobile:boolean; entry:DayEntry; color:string; name:string; faded:boolean }) {
  const style = entry.preview
    // Предпросмотр в мастере: полая точка сразу отличает будущую смену от уже существующей.
    ? { background: 'transparent', border: `1.5px dashed ${color}` }
    : { background: color, border: `1px solid ${color}` }

  if (mobile) return <Tooltip title={name}>
    <span style={{ width: 8, height: 8, borderRadius: 4, display: 'inline-block', opacity: faded ? 0.25 : 1, ...style }}/>
  </Tooltip>

  return <Tooltip title={name}>
    <span style={{
      fontSize: 10, fontWeight: 600, lineHeight: '14px', padding: '0 4px', borderRadius: 4,
      color: entry.preview ? color : '#fff', opacity: faded ? 0.3 : 1, ...style,
    }}>{initials(name)}</span>
  </Tooltip>
}

/** Легенда обязательна: без неё цветные точки ничего не значат. */
export function MonthLegend({ employees, dimmed, onDim }:{ employees:Employee[]; dimmed?:string; onDim?:(id?:string) => void }) {
  if (!employees.length) return null
  const style = (index:number, id:string) => ({
    display: 'inline-flex' as const, alignItems: 'center' as const, gap: 6,
    border: 0, background: 'transparent', padding: 0,
    cursor: onDim ? 'pointer' : 'default',
    opacity: dimmed && dimmed !== id ? 0.4 : 1,
    tone: employeeTone(index),
  })

  return <div className="mt-3 flex flex-wrap gap-x-3 gap-y-2">
    {employees.map((employee, index) => {
      const { tone, ...box } = style(index, employee.id)
      const content = <>
        <span style={{ width: 8, height: 8, borderRadius: 4, background: tone }}/>
        <Typography.Text className="text-xs">{employee.fullName}</Typography.Text>
      </>
      // В предпросмотре мастера подсветка не нужна — там кнопка была бы мёртвой.
      return onDim
        ? <button key={employee.id} type="button" style={box} onClick={() => onDim(dimmed === employee.id ? undefined : employee.id)}>{content}</button>
        : <span key={employee.id} style={box}>{content}</span>
    })}
  </div>
}

export function MonthSummary({ month, entriesByDate }:{ month:string; entriesByDate:Map<string, DayEntry[]> }) {
  const first = dayjs(monthStart(month))
  const days = dayjs(monthEnd(month)).diff(first, 'day')
  const empty = Array.from({ length: days }, (_, i) => first.add(i, 'day').format('YYYY-MM-DD'))
    .filter(date => !entriesByDate.get(date)?.length).length
  return <Card size="small" variant="outlined" className="mt-3">
    <Typography.Text type={empty ? 'warning' : 'secondary'} className="text-xs">
      {empty ? `Дней без смен: ${empty}` : 'Каждый день месяца закрыт сменой'}
    </Typography.Text>
  </Card>
}
