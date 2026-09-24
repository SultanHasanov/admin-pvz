import { useCallback, useMemo, useRef } from 'react'
import { useQueries, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import type { Tone } from '../../shared/kit/tokens'
import { buildFeed, payoutAlert, unreadOf, type FeedItem, type FeedRead } from '../../entities/notifications'
import { rubles } from '../../shared/money'
import { dayLabel, today } from '../../shared/dates'
import { keys } from '../../services/queries'
import { listNewDeductions } from '../../services/deductions'
import { listRecurringExpenses, listRecurringOccurrences, recurringDueDate } from '../../services/finance'
import { listShiftRequests } from '../../services/requests'
import { listNotificationReads, markNotificationsRead } from '../../services/notifications'
import { getPayoutSettings } from '../../services/payoutSettings'
import { useMonthTotals } from '../money/useMonthTotals'
import { useSalarySheets } from '../money/useSalarySheets'
import { groupHoles, useHoles } from '../schedule/useHoles'
import { useOrg } from '../../app/OrgContext'

/** Совместимость с прежним именем: экраны ждут `Alert`, а это строка ленты. */
export type Alert = FeedItem

/** Состояние регулярного расхода на сегодня: просрочен, сегодня или ещё впереди. */
export function recurringState(dueOn:string):{ text:string; tone:Tone } {
  const days = dayjs(dueOn).startOf('day').diff(dayjs(today()).startOf('day'), 'day')
  if (days < 0) return { text: `просрочено на ${Math.abs(days)} дн.`, tone: 'bad' }
  if (days === 0) return { text: 'сегодня', tone: 'warn' }
  return { text: `скоро · через ${days} дн.`, tone: 'info' }
}

/**
 * Лента уведомлений и блок «Требуют внимания».
 *
 * Пять источников уже есть в базе — заявки, удержания, дырки в графике, регулярные
 * расходы и сроки выплат; собирает их чистая `buildFeed` из entities. Здесь только
 * загрузка и отметки прочтения.
 *
 * Запросы свои, а не через параметры: ключи общие, React Query отдаёт тот же кэш,
 * что уже загрузил экран, — зато колокольчик открывается с любого места.
 */
export function useAlerts() {
  const { month, pointId, pointName } = useOrg()
  const client = useQueryClient()
  const totals = useMonthTotals()
  const salary = useSalarySheets(totals)
  const holes = useHoles(totals)

  const [deductions, recurring, occurrences, requests, reads, payout] = useQueries({
    queries: [
      { queryKey: keys.newDeductions, queryFn: () => listNewDeductions(10) },
      { queryKey: keys.recurring, queryFn: listRecurringExpenses },
      { queryKey: keys.recurringOccurrences(month), queryFn: () => listRecurringOccurrences(month) },
      { queryKey: keys.requests('open'), queryFn: () => listShiftRequests(['SENT']) },
      { queryKey: keys.notificationReads, queryFn: listNotificationReads },
      { queryKey: keys.payoutSettings, queryFn: getPayoutSettings },
    ],
  })

  const nameOf = useCallback(
    (id:string) => totals.staff.find(person => person.id === id)?.fullName ?? 'Сотрудник',
    [totals.staff])

  const items = useMemo(() => {
    const resolved = new Set((occurrences.data ?? [])
      .filter(row => row.status !== 'PENDING')
      .map(row => `${row.recurringExpenseId}|${row.dueOn}`))

    const settings = payout.data
    // Аванс «не выдан» — это начислено, но ещё ни рубля не выплачено за месяц.
    const unpaid = salary.sheets.filter(sheet => sheet.paid === 0 && sheet.accrued > 0).map(sheet => sheet.fullName)

    return buildFeed({
      requests: (requests.data ?? [])
        // Заявка с чужой точки в отфильтрованном виде только мешает: владелец
        // смотрит на один ПВЗ и решает по нему.
        .filter(request => !pointId || !request.pickupPointId || request.pickupPointId === pointId)
        .map(request => ({
          id: request.id,
          employeeName: nameOf(request.employeeId),
          kind: request.kind,
          dateFrom: request.dateFrom,
          dateTo: request.dateTo,
          reason: request.reason,
          createdAt: request.createdAt,
        })),

      holes: groupHoles(holes),

      deductions: (deductions.data ?? [])
        .filter(row => !pointId || row.pickupPointId === pointId)
        .map(deduction => ({
          id: deduction.id,
          title: `Новое удержание WB · ${rubles(deduction.amountKopecks)}`,
          sub: `${deduction.reason} · ${pointName(deduction.pickupPointId)}`,
          date: deduction.createdAt.slice(0, 10),
        })),

      recurring: (recurring.data ?? [])
        .filter(row => row.active && (!pointId || row.pickupPointId === pointId))
        .flatMap(expense => {
          const dueOn = recurringDueDate(month, expense.dayOfMonth)
          if (resolved.has(`${expense.id}|${dueOn}`)) return []
          const state = recurringState(dueOn)
          return [{
            id: expense.id,
            title: `${expense.category} · ${rubles(expense.amountKopecks)}`,
            sub: `${pointName(expense.pickupPointId)} · ${dayLabel(dueOn)} · ${state.text}`,
            tone: state.tone,
            date: dueOn,
          }]
        }),

      payout: settings ? payoutAlert({
        today: today(),
        month,
        advanceDay: settings.advanceDay,
        payday: settings.payday,
        unpaid,
      }) : null,
    })
  }, [holes, deductions.data, recurring.data, occurrences.data, requests.data, payout.data, salary.sheets, month, pointId, pointName, nameOf])

  const unread = useMemo(() => unreadOf(items, reads.data ?? []), [items, reads.data])

  // Отметка ставится один раз за открытие шторки: повторный рендер не должен
  // слать тот же upsert по кругу.
  const marking = useRef(false)
  const markSeen = useCallback(async () => {
    if (marking.current) return
    const pending = unreadOf(items, client.getQueryData<FeedRead[]>(keys.notificationReads) ?? [])
    if (!pending.length) return
    marking.current = true
    try {
      await markNotificationsRead(pending.map(item => ({ kind: item.kind, refId: item.refId })))
      await client.invalidateQueries({ queryKey: keys.notificationReads })
    } finally {
      marking.current = false
    }
  }, [items, client])

  return { items, unread, markSeen }
}
