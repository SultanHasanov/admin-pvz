import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { countDone, nextStep, stepsOf } from '../../entities/setup'
import { keys, scope } from '../../services/queries'
import { getSetupProgress, setSetupHidden } from '../../services/setup'
import { useAnySheetOpen } from '../../app/sheets'
import { useWrite } from '../write'

/**
 * Задания «Настройка пункта» для экрана и полоски на главной.
 *
 * Прогресс перезапрашиваем при каждом показе экрана и после закрытия шторки: задание
 * закрывается записью в другом месте (новый сотрудник, первый доход), и перечислять
 * `scope.setup` в каждой такой записи — значит однажды забыть его.
 */
export function useSetup() {
  const query = useQuery({ queryKey: keys.setup, queryFn: getSetupProgress, refetchOnMount: 'always' })

  const sheetOpen = useAnySheetOpen()
  const wasOpen = useRef(sheetOpen)
  const { refetch } = query
  useEffect(() => {
    if (wasOpen.current && !sheetOpen) void refetch()
    wasOpen.current = sheetOpen
  }, [sheetOpen, refetch])

  const hide = useWrite({
    run: (hidden:boolean) => setSetupHidden(hidden),
    invalidate: [scope.setup],
    done: hidden => hidden ? 'Настройка убрана с главной' : 'Настройка снова на главной',
  })

  const steps = query.data ? stepsOf(query.data) : []
  return {
    /** `null` — не владелец: заданий нет. */
    available: query.data !== null,
    loading: query.isPending,
    error: query.error,
    steps,
    done: countDone(steps),
    total: steps.length,
    next: nextStep(steps),
    hidden: query.data?.hidden ?? true,
    setHidden: (hidden:boolean) => hide.mutate(hidden),
    saving: hide.isPending,
  }
}
