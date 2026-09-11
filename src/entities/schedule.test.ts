import { describe, expect, it } from 'vitest'
import { dayIndex, defaultOffsets, deriveWeekPattern, generateSlots, planApply, withTimes, type CyclePattern, type PlannedSlot } from './schedule'
import type { Shift, ShiftStatus } from './types'

const cycle = (on:number, off:number, employees:string[], anchor = '2026-09-07', even = false):CyclePattern => ({
  kind: 'cycle', on, off, anchor,
  participants: employees.map((employeeId, index) => ({ employeeId, offset: defaultOffsets(employees.length, on, off, even)[index] })),
})

const datesOf = (slots:PlannedSlot[], employeeId:string) => slots.filter(s => s.employeeId === employeeId).map(s => s.date)
const overlaps = (slots:PlannedSlot[]) => {
  const seen = new Set<string>(), both = new Set<string>()
  for (const slot of slots) { if (seen.has(slot.date)) both.add(slot.date); seen.add(slot.date) }
  return [...both].sort()
}

const shift = (id:string, employeeId:string, date:string, status:ShiftStatus = 'PLANNED'):Shift => ({
  id, employeeId, pickupPointId: 'p',
  startsAt: `${date}T09:00:00+03:00`, endsAt: `${date}T21:00:00+03:00`,
  payMode: 'FULL', status,
})

describe('цикл N через M', () => {
  it('2/2 на двоих чередует смены без единого пересечения', () => {
    const slots = generateSlots(cycle(2, 2, ['a', 'b']), '2026-09-07', '2026-10-04')
    expect(datesOf(slots, 'a')).toHaveLength(14)
    expect(datesOf(slots, 'b')).toHaveLength(14)
    expect(overlaps(slots)).toEqual([])
  })

  it('первый выходит в якорный день, второй — через два дня', () => {
    const slots = generateSlots(cycle(2, 2, ['a', 'b']), '2026-09-07', '2026-09-10')
    expect(datesOf(slots, 'a')).toEqual(['2026-09-07', '2026-09-08'])
    expect(datesOf(slots, 'b')).toEqual(['2026-09-09', '2026-09-10'])
  })

  it('3/3 на двоих тоже чередует полностью', () => {
    const slots = generateSlots(cycle(3, 3, ['a', 'b']), '2026-09-07', '2026-09-18')
    expect(overlaps(slots)).toEqual([])
    expect(datesOf(slots, 'a')).toHaveLength(6)
  })

  // 5/2 на двоих обязано пересекаться: цикл длиной 7 не делится на две смены по пять дней.
  it('5/2 на двоих оставляет общие дни — это нормально, а не баг', () => {
    const slots = generateSlots(cycle(5, 2, ['a', 'b']), '2026-09-07', '2026-09-13')
    expect(datesOf(slots, 'a')).toEqual(['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11'])
    expect(datesOf(slots, 'b')).toEqual(['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-12', '2026-09-13'])
    expect(overlaps(slots)).toEqual(['2026-09-07', '2026-09-08', '2026-09-09'])
  })

  it('2/2 на четверых даёт две бригады по двое', () => {
    expect(defaultOffsets(4, 2, 2)).toEqual([0, 2, 0, 2])
    const slots = generateSlots(cycle(2, 2, ['a', 'b', 'c', 'd']), '2026-09-07', '2026-09-08')
    expect(slots.map(s => s.employeeId).sort()).toEqual(['a', 'a', 'c', 'c'])
  })

  it('«разнести равномерно» ставит четверых в разные фазы', () => {
    expect(defaultOffsets(4, 2, 2, true)).toEqual([0, 1, 2, 3])
  })

  it('ручной сдвиг двигает только своего участника', () => {
    const pattern = cycle(2, 2, ['a', 'b'])
    pattern.participants[1].offset = 1
    const slots = generateSlots(pattern, '2026-09-07', '2026-09-10')
    expect(datesOf(slots, 'a')).toEqual(['2026-09-07', '2026-09-08'])
    expect(datesOf(slots, 'b')).toEqual(['2026-09-08', '2026-09-09'])
  })

  it('работает, когда период начинается раньше якоря', () => {
    const slots = generateSlots(cycle(2, 2, ['a']), '2026-09-01', '2026-09-06')
    expect(datesOf(slots, 'a')).toEqual(['2026-09-03', '2026-09-04'])
  })

  it('не зацикливается на бессмысленных числах', () => {
    expect(generateSlots(cycle(0, 2, ['a']), '2026-09-01', '2026-09-30')).toEqual([])
  })
})

describe('dayIndex', () => {
  it('считает целые сутки через границу месяца', () => expect(dayIndex('2026-10-01', '2026-09-28')).toBe(3))
  it('не сбивается на переводе часов', () => expect(dayIndex('2026-03-30', '2026-03-28')).toBe(2))
  it('отрицателен до якоря', () => expect(dayIndex('2026-09-05', '2026-09-07')).toBe(-2))
})

describe('график по дням недели', () => {
  it('раскрывает разные наборы дней для разных сотрудников', () => {
    const slots = generateSlots({ kind: 'weekdays', byEmployee: { a: [1, 3, 5], b: [2, 4, 6, 0] } }, '2026-09-07', '2026-09-13')
    expect(datesOf(slots, 'a')).toEqual(['2026-09-07', '2026-09-09', '2026-09-11'])
    expect(datesOf(slots, 'b')).toEqual(['2026-09-08', '2026-09-10', '2026-09-12', '2026-09-13'])
  })

  it('пустой набор дней означает «не участвует»', () => {
    expect(generateSlots({ kind: 'weekdays', byEmployee: { a: [] } }, '2026-09-07', '2026-09-13')).toEqual([])
  })
})

describe('planApply', () => {
  const slot = (employeeId:string, date:string):PlannedSlot => ({ employeeId, date })

  it('схлопывает повторы во входе — замена отсутствующему ограничению в БД', () => {
    const plan = planApply([slot('a', '2026-09-07'), slot('a', '2026-09-07')], [])
    expect(plan.toAdd).toHaveLength(1)
  })

  it('запланированную смену считает конфликтом, а не дублем', () => {
    const plan = planApply([slot('a', '2026-09-07')], [shift('s', 'a', '2026-09-07')])
    expect(plan.toAdd).toHaveLength(0)
    expect(plan.conflicts).toHaveLength(1)
    expect(plan.conflicts[0].shift.id).toBe('s')
  })

  const untouchable:ShiftStatus[] = ['ON_DUTY', 'COMPLETED', 'REPLACED', 'NO_SHOW']
  for (const status of untouchable) {
    it(`смену в статусе ${status} не трогает и не дублирует`, () => {
      const plan = planApply([slot('a', '2026-09-07')], [shift('s', 'a', '2026-09-07', status)])
      expect(plan.toAdd).toHaveLength(0)
      expect(plan.conflicts).toHaveLength(0)
      expect(plan.locked).toHaveLength(1)
    })
  }

  it('чужая смена в тот же день не мешает', () => {
    const plan = planApply([slot('a', '2026-09-07')], [shift('s', 'b', '2026-09-07')])
    expect(plan.toAdd).toHaveLength(1)
  })
})

describe('копирование недели', () => {
  const week = [
    shift('s1', 'a', '2026-09-07'),
    shift('s2', 'a', '2026-09-09'),
    { ...shift('s3', 'b', '2026-09-08'), startsAt: '2026-09-08T12:00:00+03:00', endsAt: '2026-09-09T00:00:00+03:00', payMode: 'HALF' as const },
    shift('s4', 'a', '2026-09-20'), // другая неделя — в образец попасть не должна
  ]

  it('снимает дни недели и личное время каждого сотрудника', () => {
    const { pattern, times } = deriveWeekPattern('2026-09-07', week)
    expect(pattern.byEmployee).toEqual({ a: [1, 3], b: [2] })
    expect(times.a).toEqual({ startsAt: '09:00', endsAt: '21:00', payMode: 'FULL' })
    expect(times.b).toEqual({ startsAt: '12:00', endsAt: '00:00', payMode: 'HALF' })
  })

  it('повторяет себя же без изменений, сохраняя время', () => {
    const { pattern, times } = deriveWeekPattern('2026-09-07', week)
    const copied = withTimes(generateSlots(pattern, '2026-09-14', '2026-09-20'), times)
    expect(datesOf(copied, 'a')).toEqual(['2026-09-14', '2026-09-16'])
    expect(copied.find(s => s.employeeId === 'b')).toMatchObject({ date: '2026-09-15', startsAt: '12:00', payMode: 'HALF' })
  })

  it('берёт форму и с завершённых смен — понедельник остаётся рабочим днём', () => {
    const { pattern } = deriveWeekPattern('2026-09-07', [shift('s', 'a', '2026-09-07', 'COMPLETED')])
    expect(pattern.byEmployee.a).toEqual([1])
  })
})
