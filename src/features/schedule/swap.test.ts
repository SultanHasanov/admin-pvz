import { describe, expect, it } from 'vitest'
import type { Shift } from '../../entities/types'
import { rankSubstitutes } from './swap'

let seq = 0
const shift = (employeeId:string, date:string, pickupPointId = 'p1'):Shift => ({
  id: `s${seq += 1}`, employeeId, pickupPointId, workDate: date,
  startsAt: `${date}T09:00:00+03:00`, endsAt: `${date}T21:00:00+03:00`, payMode: 'FULL', status: 'PLANNED',
})

// 2 через 2 с 28 сентября: Иван 28–29, Миша 30–1, Иван 2–3, Миша 4–5…
const rotation = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05']
  .map((date, index) => shift(Math.floor(index / 2) % 2 === 0 ? 'ivan' : 'misha', date))

describe('быстрая замена', () => {
  it('первым предлагает напарника, отдохнувшего накануне, занятых — последними', () => {
    const ranked = rankSubstitutes({
      date: '2026-10-02', absentId: 'ivan', staffIds: ['ivan', 'misha', 'new', 'busy'],
      pointShifts: rotation, dayShifts: [shift('busy', '2026-10-02', 'p2')],
    })
    expect(ranked.map(row => row.employeeId)).toEqual(['misha', 'new', 'busy'])
    expect(ranked[0]).toMatchObject({ workedBefore: true, workedAfter: false, regular: 4 })
    expect(ranked[2].busyAt).toBe('p2')
  })

  it('обмен: ближайшая смена напарника, в которую отсутствующий свободен', () => {
    const [misha] = rankSubstitutes({ date: '2026-09-28', absentId: 'ivan', staffIds: ['ivan', 'misha'], pointShifts: rotation, dayShifts: [] })
    expect(misha.swapShift?.workDate).toBe('2026-09-30')
  })

})
