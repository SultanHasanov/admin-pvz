import { useCallback, useMemo, useRef } from 'react'
import { useQueries, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { payoutReminder } from '../../entities/payouts'
import { buildFeed, payoutAlert, unreadOf, type FeedItem, type FeedRead } from '../../entities/notifications'
import { rubles } from '../../shared/money'
import { today } from '../../shared/dates'
import { keys } from '../../services/queries'
import { listNewDeductions } from '../../services/deductions'
import { listTransactions } from '../../services/finance'
import { listShiftRequests } from '../../services/requests'
import { listNotificationReads, markNotificationsRead } from '../../services/notifications'
import { getPayoutSettings } from '../../services/payoutSettings'
import { useMonthTotals } from '../money/useMonthTotals'
import { useSalarySheets } from '../money/useSalarySheets'
import { groupHoles, useHoles } from '../schedule/useHoles'
import { useOrg } from '../../app/OrgContext'

/** Совместимость с прежним именем: экраны ждут `Alert`, а это строка ленты. */
export type Alert = FeedItem

/**
 * Лента уведомлений и блок «Требуют внимания».
 *
 * Источники уже есть в базе — заявки, удержания, дырки в графике, сроки выплат и
 * невписанная выплата WB; собирает их чистая `buildFeed` из entities. Здесь только
 * загрузка и отметки прочтения. Постоянные расходы считаются сами — подтверждать их нечего.
 *
 * Запросы свои, а не через параметры: ключи общие, React Query отдаёт тот же кэш,
 * что уже загрузил экран, — зато колокольчик открывается с любого места.
 */
export function useAlerts() {
  const { month, pointId, pointName, points } = useOrg()
  const client = useQueryClient()
  const totals = useMonthTotals()
  const salary = useSalarySheets(totals)
  const holes = useHoles(totals)

  // Выплата WB считается от настоящего сегодня, а не от месяца, открытого в шапке.
  const thisMonth = today().slice(0, 7)
  const lastMonth = dayjs(today()).subtract(1, 'month').format('YYYY-MM')
  const [deductions, requests, reads, payout, incomeNow, incomeBefore] = useQueries({
    queries: [
      { queryKey: keys.newDeductions, queryFn: () => listNewDeductions(10) },
      { queryKey: keys.requests('open'), queryFn: () => listShiftRequests(['SENT']) },
      { queryKey: keys.notificationReads, queryFn: listNotificationReads },
      { queryKey: keys.payoutSettings, queryFn: getPayoutSettings },
      { queryKey: keys.transactions(thisMonth, ''), queryFn: () => listTransactions(thisMonth) },
      { queryKey: keys.transactions(lastMonth, ''), queryFn: () => listTransactions(lastMonth) },
    ],
  })

  const nameOf = useCallback(
    (id:string) => totals.staff.find(person => person.id === id)?.fullName ?? 'Сотрудник',
    [totals.staff])

  const items = useMemo(() => {
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

      recurring: [],

      payout: settings ? payoutAlert({
        today: today(),
        month,
        advanceDay: settings.advanceDay,
        payday: settings.payday,
        unpaid,
      }) : null,

      wbPayout: incomeNow.data && incomeBefore.data ? payoutReminder({
        today: today(),
        points: points.filter(point => !point.archivedAt && (!pointId || point.id === pointId)),
        entries: [...incomeNow.data, ...incomeBefore.data],
      }) : null,
    })
  }, [holes, deductions.data, requests.data, payout.data, salary.sheets, month, pointId, pointName, nameOf, points, incomeNow.data, incomeBefore.data])

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
