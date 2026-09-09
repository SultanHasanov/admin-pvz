import type { ModuleKey, TaxSettings } from '../entities/types'
import { client, organizationId } from './org'

export const moduleTitles:Record<ModuleKey, string> = {
  employees: 'Сотрудники', shifts: 'Смены', salary: 'Зарплаты', income: 'Доходы', expenses: 'Расходы',
  taxes: 'Налоги', penalties: 'Штрафы', wb_deductions: 'Удержания WB', telegram: 'Telegram',
  analytics: 'Аналитика', valuable_items: 'Контроль товаров',
}

export async function listEnabledModules():Promise<ModuleKey[]> {
  const organization_id = await organizationId()
  const { data, error } = await client().from('enabled_modules').select('module,enabled').eq('organization_id', organization_id)
  if (error) throw error
  return (data as { module:ModuleKey; enabled:boolean }[]).filter(row => row.enabled).map(row => row.module)
}

export async function setModuleEnabled(module:ModuleKey, enabled:boolean) {
  const organization_id = await organizationId()
  const { error } = await client().from('enabled_modules').upsert({ organization_id, module, enabled, updated_at: new Date().toISOString() }, { onConflict: 'organization_id,module' })
  if (error) throw error
}

export async function getTaxSettings():Promise<TaxSettings> {
  const organization_id = await organizationId()
  const { data, error } = await client().from('tax_settings').select('rate,enabled').eq('organization_id', organization_id).maybeSingle()
  if (error) throw error
  return { rate: Number(data?.rate ?? 0), enabled: Boolean(data?.enabled) }
}

export async function saveTaxSettings(input:TaxSettings) {
  const organization_id = await organizationId()
  const { error } = await client().from('tax_settings').upsert({ organization_id, rate: input.rate, enabled: input.enabled, updated_at: new Date().toISOString() }, { onConflict: 'organization_id' })
  if (error) throw error
}
