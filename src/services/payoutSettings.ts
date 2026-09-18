import type { PayoutSettings } from '../entities/types'
import { client, organizationId } from './org'

/**
 * Дни выплат организации (миграция 0016). Строки может не быть — организацию заводили
 * до этой таблицы, а экран настройки появится в фазе 7. Тогда напоминание о выплате
 * просто не показывается: лучше промолчать, чем выдумать срок.
 */
export async function getPayoutSettings():Promise<PayoutSettings | null> {
  const organization_id = await organizationId()
  const { data, error } = await client().from('payout_settings')
    .select('advance_day,payday,advance_mode,advance_sum_kopecks')
    .eq('organization_id', organization_id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = data as { advance_day:number | null; payday:number | null; advance_mode:PayoutSettings['advanceMode']; advance_sum_kopecks:number | null }
  return {
    advanceDay: row.advance_day,
    payday: row.payday,
    advanceMode: row.advance_mode ?? 'CALC',
    advanceSumKopecks: row.advance_sum_kopecks ?? 0,
  }
}

/**
 * Дни аванса и остатка. Upsert по организации: строки могло не быть — организацию
 * заводили до этой таблицы. Режим и сумма аванса не трогаются.
 */
export async function savePayoutDays(advanceDay:number, payday:number) {
  const organization_id = await organizationId()
  const { error } = await client().from('payout_settings').upsert(
    { organization_id, advance_day: advanceDay, payday },
    { onConflict: 'organization_id' },
  )
  if (error) throw error
}
