import { useCallback, useMemo, useRef } from 'react'
import { useQueries, useQueryClient } from '@tanstack/react-query'
import { buildEmployeeFeed, unreadOf, type FeedRead } from '../../entities/notifications'
import { rubles } from '../../shared/money'
import { monthLabel, today } from '../../shared/dates'
import { requestStatusText } from '../../shared/requests'
import { keys } from '../../services/queries'
import { listShiftRequests } from '../../services/requests'
import { listNotificationReads, markNotificationsRead } from '../../services/notifications'
import { useOrg } from '../../app/OrgContext'
import { useMe } from './useMe'
import { useMyMonth } from './useMyMonth'

/**
 * Колокольчик сотрудника: что решили по его заявкам, куда его поставили на замену,
 * что выплатили и что удержали. Прочитанность — та же `notification_reads`, что у владельца.
 */
export function useMyFeed() {
  const client = useQueryClient()
  const { pointName } = useOrg()
  const { employeeId, nameOf } = useMe()
  const month = today().slice(0, 7)
  const my = useMyMonth(month)

  const [requests, reads] = useQueries({
    queries: [
      // Все статусы: сотруднику важен исход, а не только ожидание.
      { queryKey: keys.requests('all'), queryFn: () => listShiftRequests() },
      { queryKey: keys.notificationReads, queryFn: listNotificationReads },
    ],
  })

  const items = useMemo(() => {
    const rows = requests.data ?? []
    return buildEmployeeFeed({
      requests: rows
        .filter(request => request.employeeId === employeeId)
        .map(request => ({
          id: request.id,
          kind: request.kind,
          dateFrom: request.dateFrom,
          dateTo: request.dateTo,
          status: request.status,
          statusText: requestStatusText(request, nameOf),
          createdAt: request.createdAt,
        })),
      // Чужая заявка видна сотруднику только если замена — он (политика requests_read).
      substitutions: rows
        .filter(request => request.substituteEmployeeId === employeeId && request.status === 'SUBSTITUTE_FOUND'
          && request.dateTo >= today())
        .map(request => ({
          id: request.id,
          date: request.dateFrom,
          pointName: pointName(request.pickupPointId),
          resolvedAt: request.resolvedAt,
        })),
      payments: my.payments.map(payment => ({
        id: payment.id,
        advance: payment.kind === 'ADVANCE',
        amount: rubles(payment.amountKopecks),
        monthName: monthLabel((payment.accrualMonth ?? payment.date).slice(0, 7)).split(' ')[0],
        date: payment.date,
      })),
      deductions: my.deductions.map(({ deduction, share }) => ({
        id: deduction.id,
        reason: deduction.reason,
        amount: rubles(share),
        date: (deduction.eventAt ?? deduction.createdAt).slice(0, 10),
      })),
    })
  }, [requests.data, employeeId, nameOf, pointName, my.payments, my.deductions])

  const unread = useMemo(() => unreadOf(items, reads.data ?? []), [items, reads.data])

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
