import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toastDone, toastError } from '../shared/kit/Toaster'

/**
 * Запись в базу из шторки: выполнить, обновить затронутые запросы, сказать об этом тостом.
 *
 * Тост обязателен: шторка закрывается сразу после нажатия, и без подтверждения непонятно,
 * прошла ли запись. Ошибку тоже показываем тостом, а не тихо — иначе пользователь
 * решит, что сохранилось.
 */
export function useWrite<TVars>({ run, invalidate, done, onDone }:{
  run:(vars:TVars) => Promise<unknown>
  /** Префиксы ключей кэша, которые нужно перезапросить. */
  invalidate:readonly (readonly unknown[])[]
  done?:string | ((vars:TVars) => string)
  onDone?:() => void
}) {
  const client = useQueryClient()

  return useMutation({
    mutationFn: run,
    onSuccess: (_data, vars) => {
      for (const key of invalidate) void client.invalidateQueries({ queryKey: key })
      const message = typeof done === 'function' ? done(vars) : done
      if (message) toastDone(message)
      onDone?.()
    },
    onError: error => toastError(error instanceof Error ? error.message : 'Не удалось сохранить'),
  })
}
