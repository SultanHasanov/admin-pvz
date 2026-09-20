import { describe, expect, it } from 'vitest'
import { makeSampleWeek, remainingWeeksOfMonth, repeatSampleWeek, type TeamRule } from './guidedSchedule'

const base:TeamRule = {
  pointId: 'p', anchor: '2026-09-21', seats: 1, firstRun: 2, secondRun: 2,
  teams: [['a'], ['b']], payMode: 'FULL',
}

describe('понятный график по неделе образцу', () => {
  it('показывает 1/1, 2/2 и 3/3 для одного сотрудника в смене', () => {
    for (const run of [1, 2, 3]) {
      const week = makeSampleWeek({ ...base, firstRun: run, secondRun: run })
      const names = Object.values(week).map(day => day.employeeIds[0])
      expect(names.slice(0, run)).toEqual(Array(run).fill('a'))
      expect(names.slice(run, run * 2)).toEqual(Array(run).fill('b'))
    }
  })

  it('две пары получают по два места и половину собственной смены', () => {
    const week = makeSampleWeek({ ...base, seats: 2, teams: [['a', 'b'], ['c', 'd']], payMode: 'HALF' })
    expect(week['2026-09-21']).toEqual({ required: 2, employeeIds: ['a', 'b'], payMode: 'HALF' })
    expect(week['2026-09-23']).toEqual({ required: 2, employeeIds: ['c', 'd'], payMode: 'HALF' })
  })

  it('повторяет исправленный день и разовую норму один вместо двух', () => {
    const rule:TeamRule = { ...base, seats: 2, teams: [['a', 'b'], ['c', 'd']] }
    const sample = makeSampleWeek(rule)
    sample['2026-09-22'] = { required: 1, employeeIds: ['d'], payMode: 'FULL' }
    const copied = repeatSampleWeek(rule, sample, ['2026-09-28'])
    expect(copied.days['2026-09-29']).toEqual(sample['2026-09-22'])
    expect(copied.cells.filter(cell => cell.date === '2026-09-29').map(cell => cell.employeeId)).toEqual(['d'])
  })

  it('до конца месяца обрезает только целевые недели, образец остаётся целым', () => {
    const sample = makeSampleWeek({ ...base, anchor: '2026-09-21' })
    const copied = repeatSampleWeek(base, sample, remainingWeeksOfMonth('2026-09-21', '2026-09'), '2026-09')
    expect(Object.keys(copied.days).filter(date => date.startsWith('2026-10'))).toEqual([])
    expect(Object.keys(copied.days)).toHaveLength(10)
  })

  it('при выборе следующего месяца переносит недели только в него, включая пограничную', () => {
    const weeks = remainingWeeksOfMonth('2026-09-21', '2026-10')
    expect(weeks[0]).toBe('2026-09-28')
    expect(weeks).toHaveLength(5)
    const copied = repeatSampleWeek(base, makeSampleWeek(base), weeks, '2026-10')
    expect(copied.days['2026-10-01']).toEqual(copied.days['2026-09-24'])
    expect(copied.days['2026-10-31']).toBeDefined()
    expect(copied.days['2026-09-30']).toBeUndefined()
  })
})
