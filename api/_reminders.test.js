import { describe, expect, it } from 'vitest'
import { addDays, dayCrew, dueKinds, isDue, localNow, mondayIndex, slotsForDay } from './_reminders.js'

/** Настройки с выключенным всем — в тестах включаем ровно то, что проверяем. */
const settings = (overrides = {}) => ({
  duty_today_enabled: false, duty_today_time: '08:30:00',
  duty_tomorrow_enabled: false, duty_tomorrow_time: '20:00:00',
  gaps_enabled: false, gaps_time: '10:00:00',
  gaps_horizon_days: 14, gaps_quiet_when_full: true,
  week_enabled: false, week_time: '18:00:00', week_weekday: 6,
  money_enabled: false, money_time: '21:00:00',
  ...overrides,
})

describe('время напоминаний', () => {
  it('дата и минуты считаются в поясе точки, а не сервера', () => {
    // 21:30 UTC — в Москве это уже следующий день.
    const moment = localNow('Europe/Moscow', new Date('2026-09-20T21:30:00Z'))
    expect(moment.date).toBe('2026-09-21')
    expect(moment.minutes).toBe(30)
  })

  it('полночь в поясе точки — это ноль минут, а не 1440', () => {
    expect(localNow('Europe/Moscow', new Date('2026-09-20T21:00:00Z')).minutes).toBe(0)
  })

  it('окно ловит опоздавший запуск и закрывается после него', () => {
    expect(isDue('08:30:00', 8 * 60 + 30, 60)).toBe(true)
    expect(isDue('08:30:00', 9 * 60 + 29, 60)).toBe(true)
    expect(isDue('08:30:00', 9 * 60 + 30, 60)).toBe(false)
    expect(isDue('08:30:00', 8 * 60 + 29, 60)).toBe(false)
  })

  it('выключенное напоминание не наступает никогда', () => {
    const moment = { date: '2026-09-21', minutes: 8 * 60 + 30 }
    expect(dueKinds(settings(), moment, 60)).toEqual([])
    expect(dueKinds(settings({ duty_today_enabled: true }), moment, 60)).toEqual(['duty_today'])
  })

  it('недельная сводка уходит только в свой день недели', () => {
    const weekly = settings({ week_enabled: true, week_time: '18:00:00', week_weekday: 6 })
    // 2026-09-20 — воскресенье (6 от понедельника), 2026-09-21 — понедельник.
    expect(dueKinds(weekly, { date: '2026-09-20', minutes: 18 * 60 }, 60)).toEqual(['week'])
    expect(dueKinds(weekly, { date: '2026-09-21', minutes: 18 * 60 }, 60)).toEqual([])
  })
})

describe('дни и места', () => {
  it('нумерация дней недели идёт от понедельника, как в slot_config', () => {
    expect(mondayIndex('2026-09-21')).toBe(0)
    expect(mondayIndex('2026-09-20')).toBe(6)
  })

  it('сдвиг даты не зависит от часового пояса машины', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('исключение по дню недели важнее обычного числа мест', () => {
    const config = { def: 1, wd: { 5: 2, 6: 2 } }
    expect(slotsForDay(config, '2026-09-21')).toBe(1)
    expect(slotsForDay(config, '2026-09-20')).toBe(2)
    expect(slotsForDay(null, '2026-09-21')).toBe(1)
  })
})

describe('кто выходит в день', () => {
  const shift = (overrides) => ({
    work_date: '2026-09-21', slot_index: 0, status: 'PLANNED',
    planned_start: '2026-09-21T06:00:00Z', planned_end: '2026-09-21T18:00:00Z',
    employee_id: 'e1', employees: { full_name: 'Ирина' }, ...overrides,
  })

  it('две смены на одно место считаются за одного человека', () => {
    const crew = dayCrew({
      shifts: [shift(), shift({ employee_id: 'e2', employees: { full_name: 'Пётр' } })],
      date: '2026-09-21',
    })
    expect(crew.map(row => row.employee_id)).toEqual(['e1'])
  })

  it('смены других дней в расчёт не идут', () => {
    const crew = dayCrew({ shifts: [shift({ work_date: '2026-09-22' })], date: '2026-09-21' })
    expect(crew).toEqual([])
  })
})
