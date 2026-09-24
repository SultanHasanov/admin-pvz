import { describe, expect, it } from 'vitest'
import type { Shift } from '../../entities/types'
import { dayView } from './dayTone'

const shift = (employeeId:string, date:string, status:Shift['status'] = 'PLANNED'):Shift => ({
  id: `${employeeId}-${date}`, employeeId, pickupPointId: 'p1',
  startsAt: `${date}T09:00:00+03:00`, endsAt: `${date}T21:00:00+03:00`,
  payMode: 'FULL', status, slotIndex: 0, workDate: date,
})

const nameOf = (id:string) => ({ e1: 'Ольга Смирнова', e2: 'Иван Петров' })[id] ?? 'Сотрудник'
const today = '2026-09-18'

describe('день в сетке', () => {
  it('запланированный день акцентный', () => {
    expect(dayView([shift('e1', '2026-09-22')], '2026-09-22', today, nameOf).tone).toBe('accent')
  })

  it('пустой будущий день — красный', () => {
    expect(dayView([], '2026-09-22', today, nameOf)).toEqual({ tone: 'bad', lines: ['нет'], strong: true })
  })

  it('пустой прошлый день — нейтральный, без тревоги', () => {
    expect(dayView([], '2026-09-10', today, nameOf)).toEqual({ tone: 'neutral', lines: [] })
  })

  it('двое на смене — инициалы обоих', () => {
    expect(dayView([shift('e1', '2026-09-22'), shift('e2', '2026-09-22')], '2026-09-22', today, nameOf).lines).toEqual(['ОС', 'ИП'])
  })
})
