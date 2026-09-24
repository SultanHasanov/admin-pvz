import { describe, expect, it } from 'vitest'
import type { RecurringExpense, Transaction } from './types'
import { activeInMonth, fixedCostsFor, isCurrent, planDelete, planEdit, withoutPaidRecurring } from './fixedCosts'

const cost = (patch:Partial<RecurringExpense> = {}):RecurringExpense => ({
  id: 'c', pickupPointId: 'a', categoryId: 'k', category: 'Камеры', amountKopecks: 150000, dayOfMonth: 1,
  description: null, active: true, startMonth: null, endMonth: null, ...patch,
})

describe('постоянные расходы', () => {
  it('без начала считается во всех месяцах, в прошлых тоже', () => {
    expect(activeInMonth(cost(), '2020-01')).toBe(true)
    expect(activeInMonth(cost(), '2026-09')).toBe(true)
  })

  it('срок действия ограничивает месяцы', () => {
    const closed = cost({ endMonth: '2026-08' })
    expect(activeInMonth(closed, '2026-08')).toBe(true)
    expect(activeInMonth(closed, '2026-09')).toBe(false)
    const fresh = cost({ startMonth: '2026-09' })
    expect(activeInMonth(fresh, '2026-08')).toBe(false)
    expect(activeInMonth(fresh, '2026-09')).toBe(true)
  })

  it('общий расход — только в итоге по всем ПВЗ', () => {
    const costs = [cost({ id: 'own' }), cost({ id: 'shared', pickupPointId: null }), cost({ id: 'other', pickupPointId: 'b' })]
    expect(fixedCostsFor(costs, '2026-09', '').map(row => row.id)).toEqual(['own', 'shared', 'other'])
    expect(fixedCostsFor(costs, '2026-09', 'a').map(row => row.id)).toEqual(['own'])
  })

  it('правка старого расхода закрывает его прошлым месяцем и заводит новый с текущего', () => {
    const change = { category: 'Камеры', pickupPointId: 'a', amountKopecks: 200000 }
    expect(planEdit(cost(), change, '2026-09')).toEqual({ kind: 'closeAndCreate', endMonth: '2026-08', startMonth: '2026-09' })
    expect(planEdit(cost({ startMonth: '2026-09' }), change, '2026-09')).toEqual({ kind: 'update' })
    expect(planEdit(cost(), { category: 'Камеры', pickupPointId: 'a', amountKopecks: 150000 }, '2026-09')).toBeNull()
  })

  it('удаление: с текущего месяца, а заведённый в этом месяце — совсем', () => {
    expect(planDelete(cost(), '2026-09')).toEqual({ kind: 'close', endMonth: '2026-08' })
    expect(planDelete(cost({ startMonth: '2026-09' }), '2026-09')).toEqual({ kind: 'delete' })
    expect(isCurrent(cost({ endMonth: '2026-08' }), '2026-09')).toBe(false)
  })

  it('прежние «Оплачено» не считаются второй раз', () => {
    const entries:Transaction[] = [
      { id: 'paid', kind: 'EXPENSE', date: '2026-09-05', pickupPointId: 'a', category: 'Камеры', amountKopecks: 150000 },
      { id: 'kettle', kind: 'EXPENSE', date: '2026-09-10', pickupPointId: 'a', category: 'Чайник', amountKopecks: 200000 },
    ]
    expect(withoutPaidRecurring(entries, ['paid', null]).map(row => row.id)).toEqual(['kettle'])
  })
})
