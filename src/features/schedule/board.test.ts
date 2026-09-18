import { describe, expect, it } from 'vitest'
import dayjs from 'dayjs'
import type { Shift } from '../../entities/types'
import type { PlannedSlot } from '../../entities/schedule'
import {
  buildBoard, buildEntries, cellKey, countByEmployee, emptyDays,
  isLocked, overlapDays, previewEntries, weekCoverage,
} from './board'
import { weekOptions } from './useCopyWeek'

const shift = (id:string, employeeId:string, date:string, status:Shift['status'] = 'PLANNED'):Shift => ({
  id, employeeId, pickupPointId: 'p1',
  startsAt: `${date}T09:00:00.000Z`, endsAt: `${date}T21:00:00.000Z`,
  payMode: 'FULL', status,
})

const slot = (employeeId:string, date:string):PlannedSlot => ({ employeeId, date })

describe('раскладки графика', () => {
  it('складывает смены по ячейкам «сотрудник × день»', () => {
    const board = buildBoard([shift('s1', 'e1', '2026-09-01'), shift('s2', 'e2', '2026-09-01'), shift('s3', 'e1', '2026-09-02')])
    expect(board.get(cellKey('e1', '2026-09-01'))).toHaveLength(1)
    expect(board.get(cellKey('e2', '2026-09-01'))).toHaveLength(1)
    expect(board.get(cellKey('e1', '2026-09-03'))).toBeUndefined()
  })

  it('две смены одного человека в один день не теряются', () => {
    const board = buildBoard([shift('s1', 'e1', '2026-09-01'), shift('s2', 'e1', '2026-09-01')])
    expect(board.get(cellKey('e1', '2026-09-01'))).toHaveLength(2)
  })

  it('складывает смены по дням для месячной сетки', () => {
    const entries = buildEntries([shift('s1', 'e1', '2026-09-01'), shift('s2', 'e2', '2026-09-01')])
    expect(entries.get('2026-09-01')?.map(entry => entry.employeeId)).toEqual(['e1', 'e2'])
  })
})

describe('замок на смене', () => {
  it('запланированную смену правят прямо в сетке', () => {
    expect(isLocked(shift('s1', 'e1', '2026-09-01'))).toBe(false)
    expect(isLocked(undefined)).toBe(false)
  })

  it('идущую, завершённую и сорванную — нет', () => {
    for (const status of ['ON_DUTY', 'COMPLETED', 'REPLACED', 'NO_SHOW'] as const) {
      expect(isLocked(shift('s1', 'e1', '2026-09-01', status)), status).toBe(true)
    }
  })
})

describe('предпросмотр графика', () => {
  it('помечает будущие выходы полой отметкой', () => {
    const entries = previewEntries([], [slot('e1', '2026-09-01')])
    expect(entries.get('2026-09-01')).toEqual([{ employeeId: 'e1', preview: true }])
  })

  it('не дублирует день, где сотрудник уже выходит', () => {
    const entries = previewEntries([shift('s1', 'e1', '2026-09-01')], [slot('e1', '2026-09-01')])
    const day = entries.get('2026-09-01')!
    expect(day).toHaveLength(1)
    expect(day[0].preview).toBeUndefined()
  })

  it('второго сотрудника в тот же день показывает отдельно', () => {
    const entries = previewEntries([shift('s1', 'e1', '2026-09-01')], [slot('e2', '2026-09-01')])
    expect(entries.get('2026-09-01')).toHaveLength(2)
  })

  it('считает смены по сотрудникам', () => {
    const counts = countByEmployee([slot('e1', '2026-09-01'), slot('e1', '2026-09-02'), slot('e2', '2026-09-01')])
    expect(counts.get('e1')).toBe(2)
    expect(counts.get('e2')).toBe(1)
  })

  it('считает дни, где выходят двое и больше', () => {
    expect(overlapDays([slot('e1', '2026-09-01'), slot('e2', '2026-09-01'), slot('e1', '2026-09-02')])).toBe(1)
    expect(overlapDays([slot('e1', '2026-09-01'), slot('e2', '2026-09-02')])).toBe(0)
  })
})

describe('покрытие периода', () => {
  const staff = [{ id: 'e1' }, { id: 'e2' }] as { id:string }[]
  const week = Array.from({ length: 7 }, (_, index) => dayjs('2026-09-07').add(index, 'day'))

  it('считает смены за неделю и пустые дни', () => {
    const board = buildBoard([
      shift('s1', 'e1', '2026-09-07'),
      shift('s2', 'e2', '2026-09-07'),
      shift('s3', 'e1', '2026-09-09'),
    ])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const coverage = weekCoverage(week, staff as any, board)
    expect(coverage.shifts).toBe(3)
    expect(coverage.empty).toBe(5)
  })

  it('дни месяца без смен', () => {
    const entries = buildEntries([shift('s1', 'e1', '2026-09-01')])
    // В сентябре 30 дней, закрыт один.
    expect(emptyDays('2026-09', entries)).toBe(29)
  })

  it('февраль високосного года считается по своей длине', () => {
    expect(emptyDays('2024-02', new Map())).toBe(29)
  })
})

describe('недели для копирования', () => {
  it('предлагает недели текущего и следующего месяца без исходной', () => {
    const options = weekOptions('2026-09', '2026-09-07')
    expect(options).not.toContain('2026-09-07')
    expect(options.some(week => week.startsWith('2026-09'))).toBe(true)
    expect(options.some(week => week.startsWith('2026-10'))).toBe(true)
  })

  it('не повторяет неделю, попавшую в оба месяца', () => {
    const options = weekOptions('2026-09', '2026-09-07')
    expect(new Set(options).size).toBe(options.length)
  })
})
