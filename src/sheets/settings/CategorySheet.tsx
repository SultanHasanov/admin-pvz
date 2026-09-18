import { useState } from 'react'
import { Button } from '../../shared/kit/Button'
import { TextField } from '../../shared/kit/Field'
import { ensureExpenseCategory, renameExpenseCategory } from '../../services/finance'
import { useWrite } from '../../features/write'
import { scope } from '../../services/queries'

/**
 * Новая категория расхода или переименование. Операции ссылаются на категорию по id,
 * поэтому переименование сразу меняет подпись во всех прошлых расходах.
 */
export default function CategorySheet({ id, name, close }:{ id?:string; name?:string; close:() => void }) {
  const [value, setValue] = useState(name ?? '')

  const write = useWrite({
    run: () => id ? renameExpenseCategory(id, value.trim()) : ensureExpenseCategory(value.trim()),
    invalidate: [scope.categories, scope.transactions, scope.recurring],
    done: 'Категория сохранена',
    onDone: close,
  })

  return <>
    <TextField label="Название" value={value} placeholder="Хозтовары" onChange={event => setValue(event.target.value)}/>
    <Button block disabled={!value.trim() || value.trim() === name || write.isPending} onClick={() => write.mutate(undefined as void)}>Сохранить</Button>
  </>
}
