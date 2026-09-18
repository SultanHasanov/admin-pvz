import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import type { Shift } from '../../entities/types'
import { deriveWeekPattern, generateSlots, withTimes, type PlannedSlot } from '../../entities/schedule'
import { weeksOfMonth } from '../../shared/dates'

/** Недели, на которые предлагаем повторить график: текущий месяц и следующий — обычный горизонт планирования. */
export function weekOptions(month:string, exclude:string):string[] {
  const next = dayjs(`${month}-01`).add(1, 'month').format('YYYY-MM')
  return [...new Set([...weeksOfMonth(month), ...weeksOfMonth(next)])].filter(week => week !== exclude)
}

/**
 * Копирование заполненной недели на другие. Записью не занимается — отдаёт выходы
 * в общий движок применения, чтобы конфликты решались одинаково везде.
 */
export function useCopyWeek({ weekStart, month, shifts }:{ weekStart:string; month:string; shifts:Shift[] }) {
  const { pattern, times } = useMemo(() => deriveWeekPattern(weekStart, shifts), [weekStart, shifts])
  const options = useMemo(() => weekOptions(month, weekStart), [month, weekStart])
  const [selected, setSelected] = useState<string[]>([])

  const staffCount = Object.values(pattern.byEmployee).filter(days => days.length).length
  const perWeek = Object.values(pattern.byEmployee).reduce((sum, days) => sum + days.length, 0)

  /** Выходы для выбранных недель с сохранением личного времени каждого сотрудника. */
  const build = ():PlannedSlot[] => withTimes(
    selected.flatMap(week => generateSlots(pattern, week, dayjs(week).add(6, 'day').format('YYYY-MM-DD'))),
    times,
  )

  return {
    options, selected, setSelected,
    toggleAll: () => setSelected(current => current.length === options.length ? [] : options),
    staffCount, perWeek,
    /** На пустой неделе копировать нечего. */
    empty: perWeek === 0,
    build,
  }
}
