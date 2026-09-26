import { describe, expect, it } from 'vitest'
import { normalizeIncomeSchedule } from './incomeSchedule'

describe('настройка графика доходов', () => {
  it('сортирует дни и убирает повторы', () => {
    expect(normalizeIncomeSchedule({ weeklyEnabled:true, customEnabled:true, customDays:[25, 10, 25] }).customDays).toEqual([10, 25])
  })
  it('не разрешает выключить оба режима', () => {
    expect(() => normalizeIncomeSchedule({ weeklyEnabled:false, customEnabled:false, customDays:[10, 25] })).toThrow('хотя бы один')
  })
  it('для режима по датам требует два или три дня', () => {
    expect(() => normalizeIncomeSchedule({ weeklyEnabled:false, customEnabled:true, customDays:[10] })).toThrow('два или три')
  })
})
