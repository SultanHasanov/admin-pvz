import { describe, expect, it } from 'vitest'
import type { Shift } from './types'
import { defaultOffsets, type CyclePattern, type SchedulePattern } from './schedule'
import {
  findHoles, generateCells, isAbsent, mondayIndex, planCells, slotsForDay,
  type SlotPlan,
} from './slots'

const cycle = (employees:string[], on = 2, off = 2, anchor = '2026-09-01'):CyclePattern => ({
  kind: 'cycle', on, off, anchor,
  participants: employees.map((employeeId, index) => ({ employeeId, offset: defaultOffsets(employees.length, on, off)[index] })),
})

const weekdays = (byEmployee:Record<string, number[]>):SchedulePattern => ({ kind: 'weekdays', byEmployee })

const shift = (id:string, employeeId:string, date:string, slotIndex = 0, status:Shift['status'] = 'PLANNED'):Shift => ({
  id, employeeId, pickupPointId: 'p1',
  startsAt: `${date}T09:00:00+03:00`, endsAt: `${date}T21:00:00+03:00`,
  payMode: 'FULL', status, slotIndex, workDate: date,
})

describe('число мест на смене', () => {
  it('по умолчанию столько, сколько задано у точки', () => {
    expect(slotsForDay({ def: 2 }, '2026-09-01')).toBe(2)
    expect(slotsForDay(null, '2026-09-01')).toBe(1)
  })

  it('исключения по дням недели считаются от понедельника', () => {
    const config = { def: 1, wd: { 4: 2, 5: 2, 6: 2 } }
    // 18 сентября 2026 — пятница, 20-е — воскресенье, 21-е — понедельник.
    expect(slotsForDay(config, '2026-09-18')).toBe(2)
    expect(slotsForDay(config, '2026-09-19')).toBe(2)
    expect(slotsForDay(config, '2026-09-20')).toBe(2)
    expect(slotsForDay(config, '2026-09-21')).toBe(1)
  })

  it('воскресенье — это 6, а не 0', () => {
    expect(mondayIndex('2026-09-20')).toBe(6)
    expect(mondayIndex('2026-09-21')).toBe(0)
    expect(slotsForDay({ def: 1, wd: { 6: 3 } }, '2026-09-20')).toBe(3)
    expect(slotsForDay({ def: 1, wd: { 0: 3 } }, '2026-09-20')).toBe(1)
  })

  it('меньше одного человека на смене не бывает', () => {
    expect(slotsForDay({ def: 0 }, '2026-09-01')).toBe(1)
  })
})

describe('раскрытие правил по местам', () => {
  const plans = (patterns:SchedulePattern[]):SlotPlan[] =>
    patterns.map((pattern, slotIndex) => ({ slotIndex, pattern }))

  it('у каждого места своя очередь', () => {
    const cells = generateCells({
      plans: plans([cycle(['e1', 'e2']), cycle(['e7', 'e9'])]),
      pointId: 'p1', from: '2026-09-01', to: '2026-09-04', config: { def: 2 },
    })
    const first = cells.filter(cell => cell.slotIndex === 0).map(cell => cell.employeeId)
    const second = cells.filter(cell => cell.slotIndex === 1).map(cell => cell.employeeId)
    expect(first).toEqual(['e1', 'e1', 'e2', 'e2'])
    expect(second).toEqual(['e7', 'e7', 'e9', 'e9'])
  })

  it('второе место не заполняется в дни, когда его нет', () => {
    const cells = generateCells({
      plans: plans([cycle(['e1', 'e2']), cycle(['e7', 'e9'])]),
      pointId: 'p1', from: '2026-09-21', to: '2026-09-27',
      // Второе место только в пятницу, субботу и воскресенье.
      config: { def: 1, wd: { 4: 2, 5: 2, 6: 2 } },
    })
    const secondDates = cells.filter(cell => cell.slotIndex === 1).map(cell => cell.date)
    expect(secondDates).toEqual(['2026-09-25', '2026-09-26', '2026-09-27'])
  })

  it('в отпуске человека не ставим — место остаётся пустым', () => {
    const cells = generateCells({
      plans: plans([cycle(['e1', 'e2'])]),
      pointId: 'p1', from: '2026-09-01', to: '2026-09-04', config: { def: 1 },
      absences: [{ employeeId: 'e1', from: '2026-09-01', to: '2026-09-02' }],
    })
    expect(cells.map(cell => cell.date)).toEqual(['2026-09-03', '2026-09-04'])
  })

  it('один человек не встанет дважды в день, даже попав в две очереди', () => {
    const cells = generateCells({
      plans: plans([weekdays({ e1: [2] }), weekdays({ e1: [2] })]),
      pointId: 'p1', from: '2026-09-01', to: '2026-09-01', config: { def: 2 },
    })
    expect(cells).toHaveLength(1)
    expect(cells[0].slotIndex).toBe(0)
  })

  it('точка проставляется во все ячейки', () => {
    const cells = generateCells({
      plans: plans([cycle(['e1'])]), pointId: 'p3', from: '2026-09-01', to: '2026-09-02',
    })
    expect(cells.every(cell => cell.pointId === 'p3')).toBe(true)
  })

  it('пустое правило не падает', () => {
    expect(generateCells({ plans: [], pointId: 'p1', from: '2026-09-01', to: '2026-09-30' })).toEqual([])
  })
})

describe('раскладка по ячейкам', () => {
  const cell = (date:string, slotIndex:number, employeeId = 'e1') =>
    ({ pointId: 'p1', date, slotIndex, employeeId })

  it('свободное место — добавить', () => {
    const plan = planCells([cell('2026-09-01', 0)], [])
    expect(plan.toAdd).toHaveLength(1)
  })

  it('занятое запланированной сменой — переписать', () => {
    const plan = planCells([cell('2026-09-01', 0, 'e2')], [shift('s1', 'e1', '2026-09-01', 0)])
    expect(plan.conflicts).toHaveLength(1)
    expect(plan.toAdd).toHaveLength(0)
  })

  it('соседнее место в том же дне свободно', () => {
    const plan = planCells([cell('2026-09-01', 1, 'e7')], [shift('s1', 'e1', '2026-09-01', 0)])
    expect(plan.toAdd).toHaveLength(1)
  })

  it('идущую, завершённую и сорванную смену не трогаем', () => {
    for (const status of ['ON_DUTY', 'COMPLETED', 'REPLACED', 'NO_SHOW'] as const) {
      const plan = planCells([cell('2026-09-01', 0, 'e2')], [shift('s1', 'e1', '2026-09-01', 0, status)])
      expect(plan.locked, status).toHaveLength(1)
    }
  })

  it('повторное применение того же графика ничего не добавляет', () => {
    const cells = generateCells({
      plans: [{ slotIndex: 0, pattern: cycle(['e1', 'e2']) }],
      pointId: 'p1', from: '2026-09-01', to: '2026-09-04', config: { def: 1 },
    })
    const existing = cells.map((item, index) => shift(`s${index}`, item.employeeId, item.date, item.slotIndex))
    const plan = planCells(cells, existing)
    expect(plan.toAdd).toHaveLength(0)
    expect(plan.conflicts).toHaveLength(4)
  })

  it('день смены берётся из work_date, а не из времени начала', () => {
    // Ночная смена с 21:00 по московскому времени в UTC уехала бы на предыдущий день.
    const night:Shift = { ...shift('s1', 'e1', '2026-09-01', 0), startsAt: '2026-09-01T21:00:00+03:00', workDate: '2026-09-01' }
    const plan = planCells([cell('2026-09-01', 0, 'e2')], [night])
    expect(plan.conflicts).toHaveLength(1)
  })
})

describe('дырки в графике', () => {
  it('пустой день — дырка', () => {
    const holes = findHoles({ pointId: 'p1', shifts: [], from: '2026-09-01', to: '2026-09-02' })
    expect(holes).toHaveLength(2)
    expect(holes[0]).toMatchObject({ date: '2026-09-01', slotIndex: 0, reason: 'empty', need: 1, occupied: 0 })
  })

  it('занятый день дыркой не считается', () => {
    const holes = findHoles({ pointId: 'p1', shifts: [shift('s1', 'e1', '2026-09-01')], from: '2026-09-01', to: '2026-09-01' })
    expect(holes).toEqual([])
  })

  it('на двух местах занято одно — дырка на втором', () => {
    const holes = findHoles({
      pointId: 'p1', config: { def: 2 },
      shifts: [shift('s1', 'e1', '2026-09-01', 0)],
      from: '2026-09-01', to: '2026-09-01',
    })
    expect(holes).toHaveLength(1)
    expect(holes[0]).toMatchObject({ slotIndex: 1, occupied: 1, need: 2 })
  })

  it('отпуск поставленного сотрудника — дырка с причиной «отпуск»', () => {
    const holes = findHoles({
      pointId: 'p1',
      shifts: [shift('s1', 'e1', '2026-09-01')],
      from: '2026-09-01', to: '2026-09-01',
      absences: [{ employeeId: 'e1', from: '2026-09-01', to: '2026-09-05' }],
    })
    expect(holes).toHaveLength(1)
    expect(holes[0].reason).toBe('absence')
  })

  it('не вышел и замена место не занимают', () => {
    const holes = findHoles({
      pointId: 'p1',
      shifts: [shift('s1', 'e1', '2026-09-01', 0, 'NO_SHOW'), shift('s2', 'e2', '2026-09-01', 0, 'REPLACED')],
      from: '2026-09-01', to: '2026-09-01',
    })
    expect(holes).toHaveLength(1)
  })

  it('смены другой точки не закрывают дырку', () => {
    const other = { ...shift('s1', 'e1', '2026-09-01'), pickupPointId: 'p2' }
    const holes = findHoles({ pointId: 'p1', shifts: [other], from: '2026-09-01', to: '2026-09-01' })
    expect(holes).toHaveLength(1)
  })
})

describe('отсутствия', () => {
  const absences = [{ employeeId: 'e1', from: '2026-09-20', to: '2026-09-27' }]

  it('границы отрезка включаются', () => {
    expect(isAbsent(absences, 'e1', '2026-09-20')).toBe(true)
    expect(isAbsent(absences, 'e1', '2026-09-27')).toBe(true)
    expect(isAbsent(absences, 'e1', '2026-09-19')).toBe(false)
    expect(isAbsent(absences, 'e1', '2026-09-28')).toBe(false)
  })

  it('чужой отпуск не мешает', () => {
    expect(isAbsent(absences, 'e2', '2026-09-21')).toBe(false)
  })
})

describe('отпуска в дырках графика', () => {
  it('пересекающиеся отпуска одного человека дают одну дырку в день, а не две', () => {
    const holes = findHoles({
      pointId: 'p1', config: { def: 1 },
      shifts: [shift('s1', 'e1', '2026-09-22')],
      from: '2026-09-22', to: '2026-09-22',
      absences: [
        { employeeId: 'e1', from: '2026-09-20', to: '2026-09-23' },
        { employeeId: 'e1', from: '2026-09-22', to: '2026-09-25' },
      ],
    })
    expect(holes).toHaveLength(1)
    expect(holes[0]).toMatchObject({ reason: 'absence', occupied: 0 })
  })

  it('отпуск, начавшийся в прошлом месяце, освобождает место в этом', () => {
    const holes = findHoles({
      pointId: 'p1', config: { def: 1 },
      shifts: [shift('s1', 'e1', '2026-09-01'), shift('s2', 'e1', '2026-09-03')],
      from: '2026-09-01', to: '2026-09-03',
      absences: [{ employeeId: 'e1', from: '2026-08-28', to: '2026-09-02' }],
    })
    // 1-е — отпуск, 2-е — пусто, 3-е — человек уже вернулся.
    expect(holes.map(hole => [hole.date, hole.reason])).toEqual([
      ['2026-09-01', 'absence'],
      ['2026-09-02', 'empty'],
    ])
  })

  it('на двух местах один ушёл в отпуск — день не пустой, не хватает одного', () => {
    const holes = findHoles({
      pointId: 'p1', config: { def: 2 },
      shifts: [shift('s1', 'e1', '2026-09-22', 0), shift('s2', 'e2', '2026-09-22', 1)],
      from: '2026-09-22', to: '2026-09-22',
      absences: [{ employeeId: 'e2', from: '2026-09-22', to: '2026-09-22' }],
    })
    expect(holes).toHaveLength(1)
    expect(holes[0]).toMatchObject({ slotIndex: 1, reason: 'absence', occupied: 1, need: 2 })
  })
})
