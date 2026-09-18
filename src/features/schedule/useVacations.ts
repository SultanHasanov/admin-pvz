import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import type { Absence } from '../../entities/slots'
import { monthEnd, monthStart } from '../../shared/dates'
import { keys } from '../../services/queries'
import { listVacations, toAbsences } from '../../services/vacations'

/**
 * Отпуска, задевающие месяц.
 *
 * Запрашиваются на границы месяца, а не на остаток от сегодня: отпуск, начавшийся
 * в прошлом месяце, всё ещё идёт и всё ещё освобождает место на смене.
 */
export function useVacations(month:string) {
  const from = monthStart(month)
  const to = dayjs(monthEnd(month)).subtract(1, 'day').format('YYYY-MM-DD')

  const query = useQuery({
    queryKey: keys.vacations(from, to),
    queryFn: () => listVacations(from, to),
  })

  const vacations = useMemo(() => query.data ?? [], [query.data])
  const absences = useMemo<Absence[]>(() => toAbsences(vacations), [vacations])

  return { vacations, absences, loading: query.isLoading }
}
