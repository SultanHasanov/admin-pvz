import { Button, Drawer, Space, Switch, Tooltip, Typography } from 'antd'
import dayjs from 'dayjs'
import type { Employee, Shift } from '../../entities/types'
import { timeLabel } from '../../shared/dates'
import { statusTitles, statusTone } from '../../shared/shifts'
import { Badge, FormModal, useIsMobile } from '../../shared/ui'
import { ShiftActions } from './ShiftActions'

const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота']
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']

export interface DaySheetProps {
  date:string
  staff:Employee[]
  shiftsOfDay:Map<string, Shift[]>
  pointLabel:string
  pending:Set<string>
  onToggle:(employeeId:string, date:string, shift?:Shift) => void
  onPay:(shift:Shift) => void
  onReplace:(shift:Shift) => void
  onLinked:() => void
  onOpenWeek:(date:string) => void
  onClose:() => void
}

export function DaySheet(props:DaySheetProps) {
  const mobile = useIsMobile()
  const day = dayjs(props.date)
  const title = `${day.date()} ${MONTHS[day.month()]}, ${WEEKDAYS[day.day()]}`
  const body = <Body {...props}/>

  // На телефоне шторка снизу читается как родная, модалка посреди экрана — нет.
  return mobile
    ? <Drawer open placement="bottom" height="auto" title={title} onClose={props.onClose} styles={{ body: { paddingTop: 8 } }}>{body}</Drawer>
    : <FormModal title={title} onClose={props.onClose} footer={<Button onClick={props.onClose}>Закрыть</Button>}>{body}</FormModal>
}

function Body({ date, staff, shiftsOfDay, pointLabel, pending, onToggle, onPay, onReplace, onLinked, onOpenWeek }:DaySheetProps) {
  return <>
    <Typography.Text type="secondary" className="text-xs">{pointLabel}</Typography.Text>
    <div className="mt-3 grid gap-2">
      {staff.map(employee => {
        const shift = shiftsOfDay.get(employee.id)?.[0]
        // Начатую или завершённую смену переключателем не убрать — для этого есть кнопки статуса.
        const locked = Boolean(shift && shift.status !== 'PLANNED')
        return <div key={employee.id} className="rounded-lg border border-slate-200 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Typography.Text strong className="truncate">{employee.fullName}</Typography.Text>
              {shift && <div className="mt-1">
                <Space size={8} wrap>
                  <Badge tone={statusTone[shift.status]}>{statusTitles[shift.status]}</Badge>
                  <Typography.Text type="secondary" className="text-xs">{timeLabel(shift.startsAt)}–{timeLabel(shift.endsAt)}</Typography.Text>
                </Space>
              </div>}
            </div>
            <Tooltip title={locked ? `${statusTitles[shift!.status]} — снять можно только через статус` : undefined}>
              <Switch
                checked={Boolean(shift)} disabled={locked || pending.has(`${employee.id}|${date}`)}
                onChange={() => onToggle(employee.id, date, shift)}
              />
            </Tooltip>
          </div>
          {shift && <div className="mt-3">
            <ShiftActions shift={shift} onPay={onPay} onReplace={onReplace} onLinked={onLinked}/>
          </div>}
        </div>
      })}
    </div>
    <Button block className="mt-4" onClick={() => onOpenWeek(date)}>Открыть неделю</Button>
  </>
}
