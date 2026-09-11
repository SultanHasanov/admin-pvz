import { Button, Card, Space, Tooltip, Typography } from 'antd'
import dayjs from 'dayjs'
import { Plus } from 'lucide-react'
import type { Employee, Shift } from '../../entities/types'
import { weekDays } from '../../shared/dates'
import { statusColors, statusTitles } from '../../shared/shifts'
import { useIsMobile } from '../../shared/ui'
import { ShiftChip } from './ShiftChip'

const SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']

/** Полоска из 7 переключателей дней недели. Используется и в редакторе, и в мастере графика. */
export function WeekdayStrip({ value, onChange, disabled }:{ value:number[]; onChange:(next:number[]) => void; disabled?:boolean }) {
  const order = [1, 2, 3, 4, 5, 6, 0]
  return <div className="grid grid-cols-7 gap-1">
    {order.map(day => {
      const active = value.includes(day)
      return <button
        key={day} type="button" disabled={disabled}
        onClick={() => onChange(active ? value.filter(d => d !== day) : [...value, day])}
        style={{
          height: 40, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: disabled ? 'default' : 'pointer',
          border: `1px solid ${active ? '#16a34a' : '#e9edf0'}`,
          background: active ? '#f0fdf4' : '#fff',
          color: active ? '#15803d' : '#94a3b8',
          opacity: disabled ? 0.5 : 1,
        }}
      >{SHORT[day]}</button>
    })}
  </div>
}

export interface WeekEditorProps {
  weekStart:string
  staff:Employee[]
  /** Ключ — `employeeId|YYYY-MM-DD`. */
  board:Map<string, Shift[]>
  pending:Set<string>
  onToggle:(employeeId:string, date:string, shift?:Shift) => void
  onDelete:(shift:Shift) => void
  onMove:(shift:Shift, employeeId:string, date:string) => void
}

const cellKey = (employeeId:string, date:string) => `${employeeId}|${date}`
/** Смены в статусе «идёт», «завершена» и прочих правят из «Списка», а не переключателем. */
const locked = (shift?:Shift) => Boolean(shift && shift.status !== 'PLANNED')

export function WeekEditor(props:WeekEditorProps) {
  return useIsMobile() ? <MobileWeek {...props}/> : <DesktopWeek {...props}/>
}

function MobileWeek({ weekStart, staff, board, pending, onToggle }:WeekEditorProps) {
  const days = weekDays(weekStart)
  return <div className="grid gap-3">
    {staff.map(employee => {
      const total = days.filter(day => board.get(cellKey(employee.id, day.format('YYYY-MM-DD')))?.length).length
      return <Card key={employee.id} size="small" variant="outlined" styles={{ body: { padding: 12 } }}>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <Typography.Text strong className="truncate">{employee.fullName}</Typography.Text>
          <Typography.Text type="secondary" className="shrink-0 text-xs">{total ? `${total} смен` : 'без смен'}</Typography.Text>
        </div>
        {/* 7 колонок по ~43px помещаются в 328 доступных пикселей — горизонтального скролла нет. */}
        <div className="grid grid-cols-7 gap-1">
          {days.map(day => {
            const date = day.format('YYYY-MM-DD')
            const key = cellKey(employee.id, date)
            const shift = board.get(key)?.[0]
            const colors = shift ? statusColors[shift.status] : null
            const busy = pending.has(key)
            const fixed = locked(shift)
            return <Tooltip key={date} title={fixed ? `${statusTitles[shift!.status]} — правится в «Списке»` : undefined}>
              <button
                type="button" disabled={busy || fixed}
                onClick={() => onToggle(employee.id, date, shift)}
                style={{
                  height: 44, borderRadius: 8, padding: 0, cursor: busy || fixed ? 'default' : 'pointer',
                  border: `1px solid ${colors?.border ?? '#e9edf0'}`,
                  background: colors?.background ?? '#fff',
                  color: colors?.color ?? '#94a3b8',
                  opacity: busy ? 0.5 : 1,
                }}
              >
                <div style={{ fontSize: 9, lineHeight: 1 }}>{SHORT[day.day()]}</div>
                <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>
                  {shift ? dayjs(shift.startsAt).format('HH') : day.date()}
                </div>
              </button>
            </Tooltip>
          })}
        </div>
      </Card>
    })}
  </div>
}

function DesktopWeek({ weekStart, staff, board, pending, onToggle, onDelete, onMove }:WeekEditorProps) {
  const days = weekDays(weekStart)
  const columns = '190px repeat(7, minmax(0, 1fr))'
  return <DesktopGrid columns={columns} days={days} staff={staff} board={board} pending={pending} onToggle={onToggle} onDelete={onDelete} onMove={onMove}/>
}

function DesktopGrid({ columns, days, staff, board, pending, onToggle, onDelete, onMove }:{
  columns:string; days:dayjs.Dayjs[]
} & Omit<WeekEditorProps, 'weekStart'>) {
  return <Card variant="outlined" styles={{ body: { padding: 0 } }}>
    <div style={{ display: 'grid', gridTemplateColumns: columns, borderBottom: '1px solid #e9edf0' }}>
      <div style={{ padding: '10px 12px', borderRight: '1px solid #e9edf0' }}>
        <Typography.Text type="secondary" className="text-xs font-semibold">Сотрудник</Typography.Text>
      </div>
      {days.map(day => {
        const weekend = day.day() === 0 || day.day() === 6
        const today = day.isSame(dayjs(), 'day')
        return <div key={day.format('DD')} style={{ padding: '6px 4px', textAlign: 'center', background: today ? '#dcfce7' : weekend ? '#fafafa' : undefined }}>
          <div className="text-sm font-semibold" style={{ color: weekend ? '#94a3b8' : undefined }}>{day.date()}</div>
          <div className="text-[10px]" style={{ color: '#94a3b8' }}>{SHORT[day.day()]}</div>
        </div>
      })}
    </div>

    {staff.map(employee => <DesktopRow
      key={employee.id} columns={columns} days={days} employee={employee}
      board={board} pending={pending} onToggle={onToggle} onDelete={onDelete} onMove={onMove}
    />)}
  </Card>
}

function DesktopRow({ columns, days, employee, board, pending, onToggle, onDelete, onMove }:{
  columns:string; days:dayjs.Dayjs[]; employee:Employee
} & Omit<WeekEditorProps, 'weekStart' | 'staff'>) {
  const total = days.filter(day => board.get(cellKey(employee.id, day.format('YYYY-MM-DD')))?.length).length
  return <div style={{ display: 'grid', gridTemplateColumns: columns, borderBottom: '1px solid #f1f5f9' }}>
    <div style={{ padding: '10px 12px', borderRight: '1px solid #e9edf0' }}>
      <div className="truncate text-sm font-medium">{employee.fullName}</div>
      <Typography.Text type="secondary" className="text-xs">{total ? `${total} смен` : 'без смен'}</Typography.Text>
    </div>
    {days.map(day => {
      const date = day.format('YYYY-MM-DD')
      const shift = board.get(cellKey(employee.id, date))?.[0]
      const weekend = day.day() === 0 || day.day() === 6
      return <Cell
        key={date} date={date} weekend={weekend} shift={shift}
        busy={pending.has(cellKey(employee.id, date))}
        onCreate={() => onToggle(employee.id, date, undefined)}
        onDelete={() => shift && onDelete(shift)}
        onDropShift={dropped => onMove(dropped, employee.id, date)}
      />
    })}
  </div>
}

/** Перетаскивание живёт только здесь: на телефоне нативный HTML5-drag не работает. */
function Cell({ date, weekend, shift, busy, onCreate, onDelete, onDropShift }:{
  date:string; weekend:boolean; shift?:Shift; busy:boolean
  onCreate:() => void; onDelete:() => void; onDropShift:(shift:Shift) => void
}) {
  return <DropZone weekend={weekend} onDropShift={onDropShift}>
    {shift
      ? <DraggableChip shift={shift} onDelete={onDelete}/>
      : <button
        type="button" disabled={busy} onClick={onCreate} aria-label={`Поставить смену ${date}`}
        className="grid h-full w-full place-items-center opacity-0 transition-opacity hover:opacity-70"
        style={{ border: 0, background: 'transparent', cursor: busy ? 'default' : 'pointer' }}
      ><Plus size={16} color="#94a3b8"/></button>}
  </DropZone>
}

/** Перетаскиваемую смену держим в модуле: dataTransfer в React-событиях отдаёт только строку. */
let dragged:Shift | null = null

function DraggableChip({ shift, onDelete }:{ shift:Shift; onDelete:() => void }) {
  return <ShiftChip
    shift={shift} dragging={dragged?.id === shift.id}
    onDragStart={() => { dragged = shift }}
    onDragEnd={() => { dragged = null }}
    onDelete={onDelete}
  />
}

function DropZone({ weekend, children, onDropShift }:{ weekend:boolean; children:React.ReactNode; onDropShift:(shift:Shift) => void }) {
  return <div
    onDragOver={event => { if (dragged) event.preventDefault() }}
    onDrop={event => { event.preventDefault(); if (dragged) { onDropShift(dragged); dragged = null } }}
    style={{ minHeight: 56, padding: 4, borderLeft: '1px solid #f1f5f9', background: weekend ? '#fafafa' : undefined }}
  >{children}</div>
}

export function WeekTotals({ weekStart, staff, board }:{ weekStart:string; staff:Employee[]; board:Map<string, Shift[]> }) {
  const days = weekDays(weekStart)
  const empty = days.filter(day => !staff.some(e => board.get(cellKey(e.id, day.format('YYYY-MM-DD')))?.length)).length
  return <Space size={16} wrap className="mt-3">
    <Typography.Text type="secondary" className="text-xs">
      Смен за неделю: {days.reduce((sum, day) => sum + staff.filter(e => board.get(cellKey(e.id, day.format('YYYY-MM-DD')))?.length).length, 0)}
    </Typography.Text>
    {empty > 0 && <Typography.Text type="warning" className="text-xs">Дней без смен: {empty}</Typography.Text>}
  </Space>
}

export { cellKey }
export const WeekNav = ({ weekStart, onChange, label }:{ weekStart:string; onChange:(next:string) => void; label:string }) => <Space>
  <Button onClick={() => onChange(dayjs(weekStart).subtract(1, 'week').format('YYYY-MM-DD'))} aria-label="Предыдущая неделя">‹</Button>
  <Typography.Text strong style={{ minWidth: 140, display: 'inline-block', textAlign: 'center' }}>{label}</Typography.Text>
  <Button onClick={() => onChange(dayjs(weekStart).add(1, 'week').format('YYYY-MM-DD'))} aria-label="Следующая неделя">›</Button>
</Space>
