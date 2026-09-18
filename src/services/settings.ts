import type { TaxSettings } from '../entities/types'
import { client, organizationId } from './org'

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
