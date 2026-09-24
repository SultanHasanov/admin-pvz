import dayjs from 'dayjs'
import type { Marketplace, Transaction } from './types'
import { SHORT_MONTHS, weekLabel } from '../shared/dates'

/**
 * Выплаты маркетплейса. У каждого пункта свой график:
 *   WB   — каждый понедельник, за прошлую неделю (пн–вс);
 *   Ozon — два раза в месяц, в окна 10–15 и 20–25 числа.
 *
 * Месяц делится на периоды выплат, и на каждый период вписывается одна сумма. Сумму «за
 * месяц целиком» не принимаем: она ложилась поверх недельных и доход считался дважды.
 *
 * Отдельной таблицы нет: выплата — обычный доход с категорией маркетплейса и датой периода
 * (понедельник у WB, 10-е или 20-е у Ozon). По этой паре запись и узнаётся.
 */
export const PAYOUT_CATEGORY:Record<Marketplace, string> = { WB: 'Выручка WB', OZON: 'Выручка Ozon' }
const CATEGORIES = Object.values(PAYOUT_CATEGORY)

export const scheduleLabel = (marketplace:Marketplace) =>
  marketplace === 'OZON' ? 'Ozon — выплата 10–15 и 20–25 числа' : 'WB — выплата каждый понедельник за прошлую неделю'

export interface PayoutPeriod {
  id:string
  marketplace:Marketplace
  /** Дата записи и день, с которого выплату ждём. */
  date:string
  title:string
  sub:string
  /** Описание записи — пишется само. */
  description:string
}

const short = (date:dayjs.Dayjs) => `${date.date()} ${SHORT_MONTHS[date.month()]}`

function wbPeriod(monday:string):PayoutPeriod {
  const covered = weekLabel(dayjs(monday).subtract(7, 'day').format('YYYY-MM-DD'))
  return {
    id: `WB-${monday}`, marketplace: 'WB', date: monday,
    title: `Выплата ${short(dayjs(monday))}`, sub: `за ${covered}`,
    description: `Выплата WB за ${covered}`,
  }
}

function ozonPeriod(month:string, from:number):PayoutPeriod {
  const start = dayjs(`${month}-${String(from).padStart(2, '0')}`)
  const window = `${from}–${from + 5} ${SHORT_MONTHS[start.month()]}`
  return {
    id: `OZON-${start.format('YYYY-MM-DD')}`, marketplace: 'OZON', date: start.format('YYYY-MM-DD'),
    title: `Выплата ${window}`, sub: 'Ozon, два раза в месяц',
    description: `Выплата Ozon ${window}`,
  }
}

/** Периоды выплат месяца. У WB — понедельники месяца: неделя на стыке идёт в месяц своего понедельника. */
export function periodsOfMonth(marketplace:Marketplace, month:string):PayoutPeriod[] {
  if (marketplace === 'OZON') return [ozonPeriod(month, 10), ozonPeriod(month, 20)]
  const first = dayjs(`${month}-01`)
  const periods:PayoutPeriod[] = []
  for (let day = first.add((8 - first.day()) % 7, 'day'); day.format('YYYY-MM') === month; day = day.add(7, 'day')) {
    periods.push(wbPeriod(day.format('YYYY-MM-DD')))
  }
  return periods
}

export const isPayoutEntry = (entry:Transaction) => entry.kind === 'INCOME' && CATEGORIES.includes(entry.category)

export interface MatchedPeriod { period:PayoutPeriod; entry?:Transaction }

/**
 * Раскладывает выплаты пункта по периодам. Всё, что не легло ни в один период, — `stray`:
 * прежняя сумма «за месяц», запись не того маркетплейса, второй раз вписанный период.
 */
export function matchPeriods(periods:PayoutPeriod[], entries:Transaction[], pointId:string, marketplace:Marketplace) {
  const own = entries.filter(entry => isPayoutEntry(entry) && entry.pickupPointId === pointId)
  const used = new Set<string>()
  const matched:MatchedPeriod[] = periods.map(period => {
    const entry = own.find(row => !used.has(row.id) && row.category === PAYOUT_CATEGORY[marketplace] && row.date === period.date)
    if (entry) used.add(entry.id)
    return { period, entry }
  })
  return { matched, stray: own.filter(entry => !used.has(entry.id)) }
}

export type PeriodState = 'done' | 'due' | 'future'
export const periodState = ({ period, entry }:MatchedPeriod, today:string):PeriodState =>
  entry ? 'done' : period.date <= today ? 'due' : 'future'

/** Период по его id — для шторки ввода суммы. */
export function periodById(id:string):PayoutPeriod | null {
  const [marketplace, date] = [id.split('-')[0] as Marketplace, id.slice(id.indexOf('-') + 1)]
  return periodsOfMonth(marketplace, date.slice(0, 7)).find(period => period.id === id) ?? null
}

export interface PayoutReminder {
  refId:string
  title:string
  sub:string
  /** Первый невписанный период — нажатие ведёт в его ввод. */
  pointId:string
  periodId:string
  date:string
}

/**
 * Напоминание вписать выплату: у каждого пункта берём последний наступивший период
 * (этого или прошлого месяца — понедельник 1–6 числа бывает в прошлом). Не вписан —
 * пункт попадает в напоминание. Все пункты — одной строкой.
 */
export function payoutReminder({ today, points, entries }:{
  today:string
  points:{ id:string; name:string; marketplace?:Marketplace }[]
  /** Доходы за этот и прошлый месяц. */
  entries:Transaction[]
}):PayoutReminder | null {
  const months = [dayjs(today).subtract(1, 'month').format('YYYY-MM'), today.slice(0, 7)]
  const missing = points.flatMap(point => {
    const marketplace = point.marketplace ?? 'WB'
    const periods = months.flatMap(month => periodsOfMonth(marketplace, month)).filter(period => period.date <= today)
    const latest = periods.at(-1)
    if (!latest) return []
    const { matched } = matchPeriods([latest], entries, point.id, marketplace)
    return matched[0].entry ? [] : [{ point, period: latest }]
  })
  if (!missing.length) return null

  const label = ({ point, period }:typeof missing[number]) =>
    `${point.name} — ${period.marketplace === 'WB' ? `WB ${period.sub}` : `Ozon ${period.title.replace('Выплата ', '')}`}`
  const shown = missing.slice(0, 2).map(label).join(' · ')
  return {
    refId: missing.map(item => item.period.id).sort().join('|'),
    title: 'Впишите выплаты маркетплейса',
    sub: missing.length > 2 ? `${shown} и ещё ${missing.length - 2}` : shown,
    pointId: missing[0].point.id,
    periodId: missing[0].period.id,
    date: missing.map(item => item.period.date).sort().at(-1)!,
  }
}

/**
 * Весь месяц одной суммой. Сумма не ложится поверх недель: из неё вычитается уже
 * вписанное, а остаток делится поровну на пустые периоды месяца (до рубля, остаток
 * копеек — последнему). Так в каждом периоде по-прежнему одна запись и ничего не дублируется.
 */
export function splitMonth(matched:MatchedPeriod[], totalKopecks:number):{ period:PayoutPeriod; amountKopecks:number }[] | { error:string } {
  const entered = matched.reduce((sum, row) => sum + (row.entry?.amountKopecks ?? 0), 0)
  const empty = matched.filter(row => !row.entry)
  if (!empty.length) return { error: 'Все периоды месяца уже вписаны' }
  const rest = totalKopecks - entered
  if (rest <= 0) return { error: `Сумма за месяц должна быть больше уже вписанного` }
  const share = Math.floor(rest / empty.length / 100) * 100
  if (share <= 0) return { error: 'Сумма слишком мала, чтобы разделить по периодам' }
  return empty.map((row, index) => ({
    period: row.period,
    amountKopecks: index === empty.length - 1 ? rest - share * (empty.length - 1) : share,
  }))
}
