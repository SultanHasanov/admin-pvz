import { describe, expect, it } from 'vitest'
import type { Transaction } from './types'
import { matchPeriods, PAYOUT_CATEGORY, payoutReminder, periodById, periodState, periodsOfMonth, splitMonth } from './payouts'

const income = (id:string, pointId:string, date:string, category = PAYOUT_CATEGORY.WB):Transaction =>
  ({ id, kind: 'INCOME', pickupPointId: pointId, date, category, amountKopecks: 100000 })

describe('периоды выплат', () => {
  it('WB — понедельники месяца, за прошлую неделю', () => {
    const periods = periodsOfMonth('WB', '2026-09')
    expect(periods.map(period => period.date)).toEqual(['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'])
    expect(periods[2]).toMatchObject({ title: 'Выплата 21 сент', sub: 'за 14–20 сент', description: 'Выплата WB за 14–20 сент' })
  })

  it('неделя на стыке месяцев — в месяце своего понедельника', () => {
    expect(periodsOfMonth('WB', '2026-10')[0].date).toBe('2026-10-05')
    expect(periodsOfMonth('WB', '2026-10')[0].sub).toBe('за 28 сент – 4 окт')
  })

  it('Ozon — два окна в месяц', () => {
    expect(periodsOfMonth('OZON', '2026-09').map(period => [period.date, period.title]))
      .toEqual([['2026-09-10', 'Выплата 10–15 сент'], ['2026-09-20', 'Выплата 20–25 сент']])
  })

  it('период находится по id', () => {
    expect(periodById('WB-2026-09-21')?.date).toBe('2026-09-21')
    expect(periodById('OZON-2026-09-20')?.title).toBe('Выплата 20–25 сент')
  })

  it('записи раскладываются по периодам, сумма «за месяц» — вне периодов', () => {
    const entries = [income('week', 'a', '2026-09-21'), income('month', 'a', '2026-09-24'), income('storage', 'a', '2026-09-10', 'Платное хранение')]
    const { matched, stray } = matchPeriods(periodsOfMonth('WB', '2026-09'), entries, 'a', 'WB')
    expect(matched.map(row => row.entry?.id ?? null)).toEqual([null, null, 'week', null])
    expect(stray.map(row => row.id)).toEqual(['month'])
    expect(periodState(matched[2], '2026-09-24')).toBe('done')
    expect(periodState(matched[1], '2026-09-24')).toBe('due')
    expect(periodState(matched[3], '2026-09-24')).toBe('future')
  })

  it('второй раз вписанный период — вне периодов', () => {
    const { stray } = matchPeriods(periodsOfMonth('WB', '2026-09'), [income('x', 'a', '2026-09-21'), income('y', 'a', '2026-09-21')], 'a', 'WB')
    expect(stray.map(row => row.id)).toEqual(['y'])
  })
})

describe('напоминание о выплате', () => {
  const points = [{ id: 'a', name: 'Кооперативная 93', marketplace: 'WB' as const }, { id: 'b', name: 'Ленина 12', marketplace: 'OZON' as const }]

  it('WB — с понедельника, Ozon — с начала окна', () => {
    const reminder = payoutReminder({ today: '2026-09-21', points, entries: [] })
    expect(reminder).toMatchObject({ pointId: 'a', periodId: 'WB-2026-09-21' })
    expect(reminder?.sub).toBe('Кооперативная 93 — WB за 14–20 сент · Ленина 12 — Ozon 20–25 сент')
  })

  it('вписанные периоды снимают напоминание', () => {
    const entries = [income('w', 'a', '2026-09-21'), income('o', 'b', '2026-09-20', PAYOUT_CATEGORY.OZON)]
    expect(payoutReminder({ today: '2026-09-24', points, entries })).toBeNull()
  })

  it('в начале месяца смотрит на понедельник прошлого месяца', () => {
    const reminder = payoutReminder({ today: '2026-10-02', points: [points[0]], entries: [] })
    expect(reminder?.periodId).toBe('WB-2026-09-28')
  })
})

describe('весь месяц одной суммой', () => {
  const periods = periodsOfMonth('WB', '2026-09')

  it('делит остаток поровну на пустые периоды, не прибавляя к вписанным', () => {
    const { matched } = matchPeriods(periods, [income('w', 'a', '2026-09-07')], 'a', 'WB')
    const split = splitMonth(matched, 1000000)
    expect(Array.isArray(split) && split.map(row => [row.period.date, row.amountKopecks])).toEqual([
      ['2026-09-14', 300000], ['2026-09-21', 300000], ['2026-09-28', 300000],
    ])
  })

  it('остаток от деления — последнему периоду', () => {
    const { matched } = matchPeriods(periods, [], 'a', 'WB')
    const split = splitMonth(matched, 1000000)
    expect(Array.isArray(split) && split.map(row => row.amountKopecks)).toEqual([250000, 250000, 250000, 250000])
    const odd = splitMonth(matchPeriods(periods, [], 'a', 'WB').matched, 1000001)
    expect(Array.isArray(odd) && odd.reduce((sum, row) => sum + row.amountKopecks, 0)).toBe(1000001)
  })

  it('сумма не больше вписанного — ошибка', () => {
    const { matched } = matchPeriods(periods, [income('w', 'a', '2026-09-07')], 'a', 'WB')
    expect(splitMonth(matched, 100000)).toEqual({ error: 'Сумма за месяц должна быть больше уже вписанного' })
  })
})
