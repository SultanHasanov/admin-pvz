import { Popconfirm, Tooltip } from 'antd'
import dayjs from 'dayjs'
import { X } from 'lucide-react'
import type { Shift } from '../../entities/types'
import { timeLabel } from '../../shared/dates'
import { statusColors, statusTitles } from '../../shared/shifts'

/** Плашка смены в недельной сетке на десктопе: её можно перетащить в другую клетку. */
export function ShiftChip({ shift, dragging, onDragStart, onDragEnd, onDelete }:{
  shift:Shift; dragging:boolean
  onDragStart:() => void; onDragEnd:() => void; onDelete:() => void
}) {
  const colors = statusColors[shift.status]
  return <Tooltip title={`${timeLabel(shift.startsAt)}–${timeLabel(shift.endsAt)} · ${statusTitles[shift.status]}`}>
    <div
      draggable onDragStart={onDragStart} onDragEnd={onDragEnd}
      style={{
        position: 'relative', borderRadius: 8, padding: '6px 4px', cursor: 'grab',
        background: colors.background, border: `1px solid ${colors.border}`, color: colors.color,
        fontSize: 11, fontWeight: 600, lineHeight: 1.2, textAlign: 'center',
        opacity: dragging ? 0.4 : 1,
      }}
    >
      {dayjs(shift.startsAt).format('HH:mm')}
      <Popconfirm title="Удалить смену?" okText="Удалить" cancelText="Отмена" okButtonProps={{ danger: true }} onConfirm={onDelete}>
        <button
          aria-label="Удалить смену" onClick={event => event.stopPropagation()}
          style={{
            position: 'absolute', top: -6, right: -6, width: 16, height: 16, borderRadius: 8,
            border: `1px solid ${colors.border}`, background: '#fff', color: '#64748b',
            display: 'grid', placeItems: 'center', cursor: 'pointer', padding: 0,
          }}
        ><X size={10}/></button>
      </Popconfirm>
    </div>
  </Tooltip>
}
