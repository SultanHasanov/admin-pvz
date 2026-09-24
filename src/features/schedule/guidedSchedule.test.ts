import { describe, expect, it } from 'vitest'
import dayjs from 'dayjs'
import type { Shift } from '../../entities/types'
import { anchorFrom, inferRule, makeSampleWeek, positionOf, repeatSampleWeek, type TeamRule, weeksOfMonth } from './guidedSchedule'

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

  it('правка дня повторяется в тот же день недели, включая норму один вместо двух', () => {
    const rule:TeamRule = { ...base, seats: 2, firstRun: 7, secondRun: 7, teams: [['a', 'b'], ['c', 'd']] }
    const edits = { '2026-09-22': { required: 1 as const, employeeIds: ['d'], payMode: 'FULL' as const } }
    const copied = repeatSampleWeek(rule, edits, ['2026-09-28'])
    expect(copied.days['2026-09-29']).toEqual(edits['2026-09-22'])
    expect(copied.cells.filter(cell => cell.date === '2026-09-29').map(cell => cell.employeeId)).toEqual(['d'])
    expect(copied.days['2026-09-30'].employeeIds).toEqual(['c', 'd'])
  })

  it('2 через 2 продолжает очередь на следующей неделе без сбоя', () => {
    const copied = repeatSampleWeek(base, {}, ['2026-09-28'])
    const names = Object.keys(copied.days).sort().map(date => copied.days[date].employeeIds[0])
    expect(names).toEqual(['a', 'a', 'b', 'b', 'a', 'a', 'b', 'b', 'a', 'a', 'b', 'b', 'a', 'a'])
  })

  it('можно заполнить неделю до образца, прошедшие дни пропускаются', () => {
    const copied = repeatSampleWeek({ ...base, anchor: '2026-09-28' }, {}, ['2026-09-21'], undefined, '2026-09-24')
    expect(copied.days['2026-09-23']).toBeUndefined()
    expect(copied.days['2026-09-24']).toBeDefined()
    expect(copied.days['2026-09-27'].employeeIds).toEqual(['b'])
  })

  it('весь месяц: все недели кроме образца и прошедших, с обрезкой по месяцу', () => {
    const weeks = weeksOfMonth('2026-09-28', '2026-09', '2026-09-24')
    expect(weeks).toEqual(['2026-09-21'])
    const october = weeksOfMonth('2026-09-21', '2026-10')
    expect(october[0]).toBe('2026-09-28')
    expect(october).toHaveLength(5)
    const copied = repeatSampleWeek(base, {}, october, '2026-10')
    expect(copied.days['2026-10-31']).toBeDefined()
    expect(copied.days['2026-09-30']).toBeUndefined()
  })

  it('перенос из тетради: в чт 24.09 у Ивана 2-й день подряд — дальше Миша пт–сб', () => {
    const anchor = anchorFrom('2026-09-24', 0, 2, 2)
    expect(anchor).toBe('2026-09-23')
    const rule:TeamRule = { ...base, anchor, start: '2026-09-24', teams: [['ivan'], ['misha']] }
    const copied = repeatSampleWeek(rule, {}, ['2026-09-28'])
    const who = (date:string) => copied.days[date]?.employeeIds[0]
    expect(copied.days['2026-09-23']).toBeUndefined()
    expect([who('2026-09-24'), who('2026-09-25'), who('2026-09-26'), who('2026-09-27'), who('2026-09-28'), who('2026-09-29')])
      .toEqual(['ivan', 'misha', 'misha', 'ivan', 'ivan', 'misha'])
  })

  it('в этот день работает второй: очередь сдвигается на блок первого', () => {
    // «3 через 2»: сегодня у второго 1-й день — значит, первый отработал три дня до этого.
    expect(anchorFrom('2026-09-24', 1, 1, 3)).toBe('2026-09-21')
  })

  it('positionOf и anchorFrom — взаимно обратные', () => {
    for (const [group, day] of [[0, 1], [0, 3], [1, 1], [1, 2]] as const) {
      const anchor = anchorFrom('2026-10-07', group, day, 3)
      expect(positionOf({ anchor, firstRun: 3, secondRun: 2 }, '2026-10-07')).toEqual({ group, day })
    }
  })

  describe('продолжить прежний график', () => {
    /** Смены по списку составов: один элемент — один день, начиная с `from`. */
    const history = (from:string, days:string[][]):Shift[] => days.flatMap((ids, offset) => ids.map((employeeId, slot) => {
      const date = dayjs(from).add(offset, 'day').format('YYYY-MM-DD')
      return { id: `${date}-${slot}`, employeeId, pickupPointId: 'p', workDate: date, startsAt: `${date}T09:00:00+03:00`, endsAt: `${date}T21:00:00+03:00`, payMode: 'FULL' as const, status: 'PLANNED' as const, slotIndex: slot }
    }))
    const I = ['ivan'], M = ['misha']

    it('2/2 с середины блока: у Миши завтра второй день', () => {
      const shifts = history('2026-09-01', [I, I, M, M, I, I, M])
      expect(inferRule(shifts, '2026-09-08')).toEqual({ seats: 1, teams: [['ivan'], ['misha']], firstRun: 2, secondRun: 2, startGroup: 1, startDay: 2, irregular: false })
    })

    it('2/2 с начала нового блока: после двух дней Миши выходит Иван', () => {
      const shifts = history('2026-09-01', [I, I, M, M, I, I, M, M])
      expect(inferRule(shifts, '2026-09-09')).toMatchObject({ teams: [['ivan'], ['misha']], startGroup: 0, startDay: 1 })
    })

    it('«3 через 2»: длины блоков берутся по полным блокам', () => {
      const shifts = history('2026-09-01', [I, I, M, M, M, I, I, M, M, M, I])
      expect(inferRule(shifts, '2026-09-12')).toMatchObject({ teams: [['misha'], ['ivan']], firstRun: 3, secondRun: 2, startGroup: 1, startDay: 2 })
    })

    it('пустой день обрезает историю: у обрезанного блока длина как у напарника', () => {
      // Дыра 19-го: видно М(1) · И(2) · М(1) — Миша тоже «2 через 2», завтра его второй день.
      const shifts = history('2026-09-20', [M, I, I, M])
      expect(inferRule(shifts, '2026-09-24')).toMatchObject({ firstRun: 2, secondRun: 2, startGroup: 1, startDay: 2 })
    })

    it('пары по двое', () => {
      const shifts = history('2026-09-01', [['a', 'b'], ['a', 'b'], ['c', 'd'], ['c', 'd'], ['a', 'b']])
      expect(inferRule(shifts, '2026-09-06')).toMatchObject({ seats: 2, teams: [['c', 'd'], ['a', 'b']], startGroup: 1, startDay: 2 })
    })

    it('третий сотрудник раньше в истории не мешает: продолжаем текущее чередование', () => {
      const shifts = history('2026-09-01', [['serg'], ['serg'], I, I, M, M, I, I, M])
      expect(inferRule(shifts, '2026-09-10')).toMatchObject({ teams: [['ivan'], ['misha']], firstRun: 2, secondRun: 2, startGroup: 1, startDay: 2 })
    })

    it('день, где работали оба, раньше чередования — тоже прежний график', () => {
      const shifts = history('2026-09-01', [['ivan', 'misha'], I, I, M, M, I, I, M])
      expect(inferRule(shifts, '2026-09-09')).toMatchObject({ seats: 1, teams: [['ivan'], ['misha']], firstRun: 2, secondRun: 2, startGroup: 1, startDay: 2 })
    })

    it('неровный график: длина блока — самая частая, отмечаем неровность', () => {
      // Как в тетради: 1-2-2-2-1-3-2-3-1-1 (Хеда/Хава), перед ним — Серьгей.
      const H = ['heda'], X = ['hava']
      const days = [['serg'], H, X, X, H, H, X, X, H, X, X, X, H, H, X, X, X, H, X]
      expect(inferRule(history('2026-09-30', days), '2026-10-19')).toEqual({
        seats: 1, teams: [['heda'], ['hava']], firstRun: 2, secondRun: 3, startGroup: 1, startDay: 2, irregular: true,
      })
    })

    it('хаотичный график и пустое вчера — не угадываем', () => {
      expect(inferRule(history('2026-09-01', [I, M, ['serg'], I]), '2026-09-05')).toBeNull()
      expect(inferRule(history('2026-09-01', [I, I, M, M]), '2026-09-10')).toBeNull()
    })
  })
})
