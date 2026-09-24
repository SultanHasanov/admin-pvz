import dayjs from 'dayjs'
import type { ShiftRequestKind } from './types'
import type { Tone } from '../shared/kit/tokens'

/**
 * Лента уведомлений собирается здесь и нигде не хранится.
 *
 * Все пять источников уже лежат в базе: открытые заявки, новые удержания WB, дырки
 * в графике, неподтверждённые регулярные расходы и сроки выплат. Материализовать ленту
 * значило бы завести пять триггеров и потом ловить рассинхрон — вместо этого считаем
 * её на клиенте, а в базе (`notification_reads`) держим только то, чего из данных
 * не вывести: что пользователь это уже видел.
 *
 * Функции чистые: хук `features/home/useAlerts` отвечает за загрузку, этот файл — за сборку.
 */

/** `substitute` и `payment` — только в ленте сотрудника. */
export type FeedKind = 'request' | 'deduction' | 'hole' | 'recurring' | 'payout' | 'substitute' | 'payment'

/** Отметка прочтения: пара, по которой строка ленты сходится со строкой в базе. */
export interface FeedRead { kind:FeedKind; refId:string }

export interface FeedItem {
  kind:FeedKind
  /**
   * Ссылка на источник. Для строки таблицы — её id, для дырки — синтетический
   * ключ `pointId|date`: дырка не строка в базе, но должна перечитываться заново,
   * если закрылась и возникла на другой дате.
   */
  refId:string
  /** `kind-refId`: ключ строки в React и в то же время адрес отметки прочтения. */
  id:string
  title:string
  sub:string
  tone:Tone
  /** Дата события — по ней «новые сверху» внутри одного тона. */
  date:string
  target:
    | { kind:'request'; id:string }
    | { kind:'deduction'; id:string }
    | { kind:'recurring' }
    | { kind:'day'; pointId:string; date:string }
    | { kind:'payout'; advance:boolean }
    // Кабинет сотрудника: ведут в его разделы, а не в экраны владельца.
    | { kind:'mySched' }
    | { kind:'myMoney' }
    | { kind:'myDeductions' }
}

export interface FeedRequest {
  id:string
  employeeName:string
  kind:ShiftRequestKind
  dateFrom:string
  dateTo:string
  reason:string | null
  createdAt:string
}

/** Дырки, уже сгруппированные по точке (`features/schedule/useHoles`). */
export interface FeedHole {
  pointId:string
  pointName:string
  firstDate:string
  count:number
  label:string
  onlyPartial:boolean
}

export interface FeedDeduction { id:string; title:string; sub:string; date:string }
export interface FeedRecurring { id:string; title:string; sub:string; tone:Tone; date:string }

/** Напоминание о выплате: либо просроченный аванс, либо срок остатка. */
export interface FeedPayout {
  /** `advance-<месяц>` или `rest-<месяц>`: своё напоминание на каждый месяц. */
  refId:string
  title:string
  sub:string
  tone:Tone
  date:string
  advance:boolean
}

export interface FeedInput {
  requests:FeedRequest[]
  holes:FeedHole[]
  deductions:FeedDeduction[]
  recurring:FeedRecurring[]
  payout:FeedPayout | null
}

/** «19 сент» — тот же короткий вид, что и в остальном приложении. */
const day = (date:string) => dayjs(date).format('D MMM').replace('.', '')

/** «Иван не сможет выйти 25 сент». */
export function requestTitle(request:FeedRequest) {
  return `${request.employeeName} не сможет выйти ${day(request.dateFrom)}`
}

export function buildFeed(input:FeedInput):FeedItem[] {
  const list:FeedItem[] = []
  const push = (item:Omit<FeedItem, 'id'>) => list.push({ ...item, id: `${item.kind}-${item.refId}` })

  // Заявки — первыми: это единственный источник, где ничего не произойдёт,
  // пока владелец не примет решение.
  for (const request of input.requests) {
    push({
      kind: 'request',
      refId: request.id,
      title: requestTitle(request),
      sub: `Причина: ${request.reason || 'не указана'} · нужно решение`,
      tone: 'bad',
      date: request.createdAt.slice(0, 10),
      target: { kind: 'request', id: request.id },
    })
  }

  for (const hole of input.holes) {
    push({
      kind: 'hole',
      refId: `${hole.pointId}|${hole.firstDate}`,
      title: `${hole.pointName}: ${hole.onlyPartial ? 'не хватает человека' : 'нет сотрудника'} ${hole.label}`,
      sub: hole.onlyPartial ? 'Место на смене не занято' : `Пустых дней: ${hole.count}`,
      tone: hole.onlyPartial ? 'warn' : 'bad',
      date: hole.firstDate,
      target: { kind: 'day', pointId: hole.pointId, date: hole.firstDate },
    })
  }

  for (const deduction of input.deductions) {
    push({
      kind: 'deduction',
      refId: deduction.id,
      title: deduction.title,
      sub: deduction.sub,
      tone: 'warn',
      date: deduction.date,
      target: { kind: 'deduction', id: deduction.id },
    })
  }

  for (const expense of input.recurring) {
    push({
      kind: 'recurring',
      refId: expense.id,
      title: expense.title,
      sub: expense.sub,
      tone: expense.tone,
      date: expense.date,
      target: { kind: 'recurring' },
    })
  }

  if (input.payout) {
    push({
      kind: 'payout',
      refId: input.payout.refId,
      title: input.payout.title,
      sub: input.payout.sub,
      tone: input.payout.tone,
      date: input.payout.date,
      target: { kind: 'payout', advance: input.payout.advance },
    })
  }

  // Сначала то, что горит; внутри одного тона заявки выше всего — без решения
  // владельца по ним ничего не сдвинется. Дальше — свежее сверху.
  const weight:Record<Tone, number> = { bad: 0, warn: 1, info: 2, accent: 3, ok: 4, neutral: 5 }
  const first = (item:FeedItem) => item.kind === 'request' ? 0 : 1
  return list.sort((a, b) =>
    weight[a.tone] - weight[b.tone] || first(a) - first(b) || b.date.localeCompare(a.date))
}

/** Строки, которых пользователь ещё не видел. По ним считается бейдж колокольчика. */
export function unreadOf(items:FeedItem[], reads:FeedRead[]):FeedItem[] {
  const seen = new Set(reads.map(read => `${read.kind}-${read.refId}`))
  return items.filter(item => !seen.has(item.id))
}

/** «9+» на бейдже: две цифры в кружке 16px не помещаются. */
export const badgeOf = (count:number) => count > 9 ? '9+' : count > 0 ? String(count) : null

const plural = (count:number, one:string, few:string, many:string) => {
  const mod100 = count % 100
  if (mod100 >= 11 && mod100 <= 14) return many
  const mod10 = count % 10
  if (mod10 === 1) return one
  if (mod10 >= 2 && mod10 <= 4) return few
  return many
}

/**
 * Напоминание о выплате. Пока срок аванса не прошёл, показываем спокойный отсчёт
 * до остатка; как только прошёл и кому-то не выдано — тревожную строку с именами.
 *
 * Дни выплат берутся из `payout_settings`; без настройки напоминания нет вовсе.
 */
export function payoutAlert({ today, month, advanceDay, payday, unpaid }:{
  today:string
  month:string
  advanceDay:number | null
  payday:number | null
  /** Кому ещё ничего не выдано за месяц, хотя начислено. */
  unpaid:string[]
}):FeedPayout | null {
  const date = Number(today.slice(8, 10))

  if (advanceDay && date > advanceDay && unpaid.length) {
    return {
      refId: `advance-${month}`,
      title: `Аванс не выдан ${unpaid.length} ${plural(unpaid.length, 'сотруднику', 'сотрудникам', 'сотрудникам')}`,
      sub: `Срок был ${dayjs(`${month}-01`).date(advanceDay).format('D MMMM')} · ${unpaid.map(name => name.split(' ')[0]).join(', ')}`,
      tone: 'bad',
      date: today,
      advance: true,
    }
  }

  if (!payday) return null

  // Остаток за месяц выдают в следующем: считаем до дня выплаты через границу месяца.
  const lastDay = dayjs(`${month}-01`).daysInMonth()
  const due = dayjs(`${month}-01`).add(1, 'month').date(payday)
  const left = lastDay - date + payday
  return {
    refId: `rest-${month}`,
    title: `Остаток за ${dayjs(`${month}-01`).format('MMMM').toLowerCase()} — ${due.format('D MMMM')}, через ${left} дн.`,
    sub: `Выплата остатка станет доступна после ${dayjs(`${month}-01`).date(lastDay).format('D MMMM')}`,
    tone: 'info',
    date: today,
    advance: false,
  }
}

// ---------- Лента сотрудника ----------

export interface EmployeeFeedInput {
  /** Свои заявки со статусом — сотрудник ждёт решения и должен его увидеть. */
  requests:{ id:string; kind:ShiftRequestKind; dateFrom:string; dateTo:string; statusText:string; status:string; createdAt:string }[]
  /** Заявки коллег, по которым меня поставили на замену. */
  substitutions:{ id:string; date:string; pointName:string; resolvedAt:string | null }[]
  payments:{ id:string; advance:boolean; amount:string; monthName:string; date:string }[]
  deductions:{ id:string; reason:string; amount:string; date:string }[]
}

/**
 * Колокольчик сотрудника. В отличие от владельческой ленты здесь не «что горит»,
 * а «что со мной произошло», поэтому порядок — просто свежее сверху, как в прототипе.
 */
export function buildEmployeeFeed(input:EmployeeFeedInput):FeedItem[] {
  const list:FeedItem[] = []
  const push = (item:Omit<FeedItem, 'id'>) => list.push({ ...item, id: `${item.kind}-${item.refId}` })

  for (const request of input.requests) {
    push({
      kind: 'request',
      // Статус в ссылке: решение по уже виденной заявке — новое событие, бейдж должен загореться.
      refId: `${request.id}|${request.status}`,
      title: `Запрос на ${day(request.dateFrom)}`,
      sub: request.statusText,
      tone: request.status === 'SENT' ? 'warn' : request.status === 'DECLINED' ? 'bad' : 'ok',
      date: request.createdAt.slice(0, 10),
      target: { kind: 'mySched' },
    })
  }

  for (const substitution of input.substitutions) {
    push({
      kind: 'substitute',
      refId: substitution.id,
      title: 'Вас поставили на замену',
      sub: `${day(substitution.date)} · ${substitution.pointName}`,
      tone: 'warn',
      date: (substitution.resolvedAt ?? substitution.date).slice(0, 10),
      target: { kind: 'mySched' },
    })
  }

  for (const payment of input.payments) {
    push({
      kind: 'payment',
      refId: payment.id,
      title: `${payment.advance ? 'Аванс' : 'Выплата остатка'} ${payment.amount}`,
      sub: `За ${payment.monthName.toLowerCase()} · ${day(payment.date)}`,
      tone: 'ok',
      date: payment.date,
      target: { kind: 'myMoney' },
    })
  }

  for (const deduction of input.deductions) {
    push({
      kind: 'deduction',
      refId: deduction.id,
      title: `Удержание WB · ${deduction.reason}`,
      sub: `${deduction.amount} · ${day(deduction.date)}`,
      tone: 'accent',
      date: deduction.date,
      target: { kind: 'myDeductions' },
    })
  }

  return list.sort((first, second) => second.date.localeCompare(first.date))
}
