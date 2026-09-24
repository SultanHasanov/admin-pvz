import dayjs from 'dayjs'
import type { RecurringExpense } from './types'

/**
 * Постоянные расходы: аренда, камеры, уборка. Задаются один раз и сами входят в расходы
 * каждого месяца — и прошлых тоже, пока у строки нет `startMonth`.
 *
 * Правка и удаление действуют с текущего месяца: старая строка закрывается прошлым
 * месяцем, прошлые месяцы не пересчитываются. Разовые покупки — обычные операции.
 */
export const SUGGESTED_FIXED_COSTS = ['Аренда', 'Коммуналка', 'Камеры', 'Уборка', 'Интернет', 'Вывоз мусора']

const previous = (month:string) => dayjs(`${month}-01`).subtract(1, 'month').format('YYYY-MM')

export const activeInMonth = (cost:RecurringExpense, month:string) => cost.active
  && (!cost.startMonth || cost.startMonth <= month)
  && (!cost.endMonth || cost.endMonth >= month)

/**
 * Что входит в месяц. С фильтром по ПВЗ — только расходы этого пункта: общий расход
 * на пункт не делится и виден в итоге по всем ПВЗ.
 */
export const fixedCostsFor = (costs:RecurringExpense[], month:string, pointId:string) =>
  costs.filter(cost => activeInMonth(cost, month) && (!pointId || cost.pickupPointId === pointId))

/** Действует ли сейчас: то, что показываем в списке и что можно менять. */
export const isCurrent = (cost:RecurringExpense, currentMonth:string) =>
  cost.active && (!cost.endMonth || cost.endMonth >= currentMonth)

export interface FixedCostChange { category:string; pickupPointId:string | null; amountKopecks:number }

export type FixedCostPlan =
  | { kind:'update' }
  | { kind:'closeAndCreate'; endMonth:string; startMonth:string }
  | { kind:'close'; endMonth:string }
  | { kind:'delete' }

/** Не действовал ни в одном месяце до текущего — прошлого нет, беречь нечего. */
const startsNow = (cost:RecurringExpense, currentMonth:string) => Boolean(cost.startMonth && cost.startMonth >= currentMonth)

/** Правка: заведённый в этом месяце — правим как есть; иначе старое закрываем, новое — с текущего месяца. */
export function planEdit(cost:RecurringExpense, change:FixedCostChange, currentMonth:string):FixedCostPlan | null {
  const same = cost.category === change.category && cost.pickupPointId === change.pickupPointId && cost.amountKopecks === change.amountKopecks
  if (same) return null
  if (startsNow(cost, currentMonth)) return { kind: 'update' }
  return { kind: 'closeAndCreate', endMonth: previous(currentMonth), startMonth: currentMonth }
}

/** Удаление: перестаёт считаться с текущего месяца, в прошлых остаётся. */
export function planDelete(cost:RecurringExpense, currentMonth:string):FixedCostPlan {
  return startsNow(cost, currentMonth) ? { kind: 'delete' } : { kind: 'close', endMonth: previous(currentMonth) }
}

/**
 * Прежняя кнопка «Оплачено» записывала постоянный расход операцией. Теперь он считается
 * сам, поэтому такие операции из разовых убираем — иначе месяц посчитал бы его дважды.
 */
export const withoutPaidRecurring = <T extends { id:string; kind:string }>(entries:T[], paidEntryIds:(string | null)[]) => {
  const paid = new Set(paidEntryIds.filter(Boolean))
  return entries.filter(entry => entry.kind !== 'EXPENSE' || !paid.has(entry.id))
}
