import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Hourglass, PlayCircle, Trash2, UserCog, UserX } from 'lucide-react'
import type { Shift, ShiftStatus } from '../../entities/types'
import { RowActions, type RowAction } from '../../shared/ui'
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

  const items:RowAction[] = [
    { key: 'pay', label: 'Как оплачивается смена', icon: <Hourglass size={15}/>, onClick: () => onPay(shift) },
  ]
  if (shift.status === 'PLANNED') items.push({
    key: 'start', label: 'Начать смену', icon: <PlayCircle size={15}/>,
    onClick: () => status.mutate({ id: shift.id, next: 'ON_DUTY' }),
  })
  if (shift.status === 'ON_DUTY' || shift.status === 'PLANNED' || shift.status === 'REPLACED') items.push({
    key: 'complete', label: 'Завершить', icon: <CheckCircle2 size={15}/>,
    onClick: () => status.mutate({ id: shift.id, next: 'COMPLETED' }),
  })
  if (shift.status !== 'COMPLETED') items.push({
    key: 'no-show', label: 'Не вышел', icon: <UserX size={15}/>,
    onClick: () => status.mutate({ id: shift.id, next: 'NO_SHOW' }),
  })
  items.push(
    { key: 'replace', label: 'Заменить сотрудника', icon: <UserCog size={15}/>, onClick: () => onReplace(shift) },
    {
      key: 'delete', label: 'Удалить', icon: <Trash2 size={15}/>, danger: true,
      confirm: 'Удалить смену?', loading: remove.isPending, onClick: () => remove.mutate(),
    },
  )

  return <RowActions items={items}/>
}
