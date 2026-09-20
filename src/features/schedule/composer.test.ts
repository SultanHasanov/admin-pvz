import { describe, expect, it } from 'vitest'
import type { Shift } from '../../entities/types'
import { composeCells, weeksTouchingMonth, type ComposerRule } from './composer'

const rule:ComposerRule = {
  method: 'cycle', pointId: 'p', from: '2026-09-29', to: '2026-10-06',
  firstId: 'a', secondId: 'b', firstDays: [1, 2, 3], secondDays: [4, 5, 6, 0],
  firstRun: 3, secondRun: 4, rest: 3, together: false, payMode: 'FULL',
  sourceWeek: '2026-09-28', sourceMonth: '2026-09', targetWeeks: [],
}
const shift = (date:string, employeeId:string, slotIndex = 0, payMode:Shift['payMode'] = 'FULL'):Shift => ({
  id: `${date}-${employeeId}`, pickupPointId: 'p', employeeId, slotIndex, workDate: date,
  startsAt: `${date}T09:00:00+03:00`, endsAt: `${date}T21:00:00+03:00`, payMode, status: 'PLANNED',
})

describe('визуальное заполнение графика', () => {
  it('чередует 3/4 непрерывно через границу месяца', () => {
    expect(composeCells(rule, []).map(cell => cell.employeeId)).toEqual(['a', 'a', 'a', 'b', 'b', 'b', 'b', 'a'])
  })

  it('позволяет двум сотрудникам выйти в один день с половиной оплаты', () => {
    const cells = composeCells({ ...rule, method: 'weekdays', from: '2026-09-28', to: '2026-09-28', firstDays: [1], secondDays: [1], payMode: 'HALF' }, [])
    expect(cells.map(cell => [cell.employeeId, cell.slotIndex, cell.payMode])).toEqual([['a', 0, 'HALF'], ['b', 1, 'HALF']])
  })

  it('копирует неполную неделю вместе с временем, местом и оплатой', () => {
    const cells = composeCells({ ...rule, method: 'copyWeek', targetWeeks: ['2026-10-05'] }, [shift('2026-09-28', 'a'), shift('2026-09-30', 'b', 1, 'HALF')])
    expect(cells.map(cell => [cell.date, cell.employeeId, cell.slotIndex, cell.payMode])).toEqual([
      ['2026-10-05', 'a', 0, 'FULL'], ['2026-10-07', 'b', 1, 'HALF'],
    ])
    expect(cells[1].startsAt).toBe('09:00')
  })

  it('переносит недели месяца по порядку и обрезает дни вне целевого месяца', () => {
    expect(weeksTouchingMonth('2026-10')).toHaveLength(5)
    const cells = composeCells({ ...rule, method: 'copyMonth', to: '2026-10-31' }, [shift('2026-09-07', 'a')])
    expect(cells.map(cell => cell.date)).toEqual(['2026-10-05'])
    expect(cells.every(cell => cell.date.startsWith('2026-10'))).toBe(true)
  })

  it('повторяет первую неделю, если в следующем месяце недель больше', () => {
    const cells = composeCells({ ...rule, method: 'copyMonth', sourceMonth: '2027-02', to: '2027-03-31' }, [shift('2027-02-01', 'a')])
    expect(cells.map(cell => cell.date)).toEqual(['2027-03-01', '2027-03-29'])
  })
})
