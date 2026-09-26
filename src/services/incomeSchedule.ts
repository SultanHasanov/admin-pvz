import type { IncomeScheduleSettings } from '../entities/types'
import { client, organizationId } from './org'

export const DEFAULT_INCOME_SCHEDULE:IncomeScheduleSettings = {
  weeklyEnabled: true,
  customEnabled: false,
  customDays: [10, 25],
}

export function normalizeIncomeSchedule(input:IncomeScheduleSettings):IncomeScheduleSettings {
  const days = [...new Set(input.customDays.map(Number).filter(day => Number.isInteger(day) && day >= 1 && day <= 31))].sort((a, b) => a - b)
  if (!input.weeklyEnabled && !input.customEnabled) throw new Error('Оставьте хотя бы один способ ввода дохода')
  if (input.customEnabled && days.length !== 2 && days.length !== 3) throw new Error('Выберите два или три дня выплаты')
  return { weeklyEnabled: input.weeklyEnabled, customEnabled: input.customEnabled, customDays: days }
}

export async function getIncomeSchedule():Promise<IncomeScheduleSettings> {
  const organization_id = await organizationId()
  const { data, error } = await client().from('income_schedule_settings')
    .select('weekly_enabled,custom_enabled,custom_days').eq('organization_id', organization_id).maybeSingle()
  if (error) throw error
  if (!data) return DEFAULT_INCOME_SCHEDULE
  return normalizeIncomeSchedule({
    weeklyEnabled: Boolean(data.weekly_enabled),
    customEnabled: Boolean(data.custom_enabled),
    customDays: Array.isArray(data.custom_days) ? data.custom_days.map(Number) : [10, 25],
  })
}

export async function saveIncomeSchedule(input:IncomeScheduleSettings) {
  const value = normalizeIncomeSchedule(input)
  const organization_id = await organizationId()
  const { error } = await client().from('income_schedule_settings').upsert({
    organization_id,
    weekly_enabled: value.weeklyEnabled,
    custom_enabled: value.customEnabled,
    custom_days: value.customDays,
    updated_at: new Date().toISOString(),
  })
  if (error) throw error
}
