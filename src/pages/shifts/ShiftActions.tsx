import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Popconfirm, Space, Tooltip } from 'antd'
import { CheckCircle2, Hourglass, PlayCircle, Trash2, UserCog, UserX } from 'lucide-react'
import type { Shift, ShiftStatus } from '../../entities/types'
import { deleteShiftSafe, setShiftStatus } from '../../services/shifts'

/** Кнопки одной смены: общие для вкладки «Список» и шторки дня в конструкторе. */
export function ShiftActions({ shift, onPay, onReplace, onLinked }:{
  shift:Shift
  onPay:(shift:Shift) => void
  onReplace:(shift:Shift) => void
  /** Смену держит удержание WB — объяснить это должен вызывающий, у него есть место под сообщение. */
  onLinked?:() => void
}) {
  const queryClient = useQueryClient()
  const invalidate = () => { void queryClient.invalidateQueries({ queryKey: ['shifts'] }) }

  const status = useMutation({
    mutationFn: ({ id, next }:{ id:string; next:ShiftStatus }) => setShiftStatus(id, next),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: () => deleteShiftSafe(shift.id),
    onSuccess: outcome => { if (outcome === 'linked') onLinked?.(); else invalidate() },
  })

  return <Space size={4} wrap>
    <Tooltip title="Как оплачивается смена"><Button size="small" icon={<Hourglass size={15}/>} onClick={() => onPay(shift)}/></Tooltip>
    {shift.status === 'PLANNED' && <Tooltip title="Начать смену">
      <Button size="small" icon={<PlayCircle size={15}/>} onClick={() => status.mutate({ id: shift.id, next: 'ON_DUTY' })}/>
    </Tooltip>}
    {(shift.status === 'ON_DUTY' || shift.status === 'PLANNED' || shift.status === 'REPLACED') && <Tooltip title="Завершить">
      <Button size="small" icon={<CheckCircle2 size={15}/>} onClick={() => status.mutate({ id: shift.id, next: 'COMPLETED' })}/>
    </Tooltip>}
    {shift.status !== 'COMPLETED' && <Tooltip title="Не вышел">
      <Button size="small" icon={<UserX size={15}/>} onClick={() => status.mutate({ id: shift.id, next: 'NO_SHOW' })}/>
    </Tooltip>}
    <Tooltip title="Заменить сотрудника"><Button size="small" icon={<UserCog size={15}/>} onClick={() => onReplace(shift)}/></Tooltip>
    <Popconfirm title="Удалить смену?" okText="Удалить" cancelText="Отмена" okButtonProps={{ danger: true }} onConfirm={() => remove.mutate()}>
      <Tooltip title="Удалить"><Button size="small" icon={<Trash2 size={15}/>} loading={remove.isPending}/></Tooltip>
    </Popconfirm>
  </Space>
}
