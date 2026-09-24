import type { WorkingHours } from '../entities/types'
import { client, resetOrganizationCache } from './org'
import { listPickupPoints, updatePickupPoint } from './points'

/**
 * Организация и первый пункт — одним RPC: база не допускает организацию без точки,
 * и владелец не должен застрять между шагами с «полуорганизацией».
 * Часы работы RPC не принимает, поэтому пишем их следом.
 */
export async function createOrganization(input:{ name:string; pointName:string; hours:WorkingHours }) {
  const { error } = await client().rpc('create_organization_with_owner', {
    p_name: input.name.trim(),
    p_point_name: input.pointName.trim(),
    // Адрес у пункта больше не спрашиваем — название и есть адрес («Ленина 12»). RPC
    // по-прежнему требует непустой адрес (миграция 0004) и на пустую строку отвечает
    // «address are required», поэтому передаём название.
    p_point_address: input.pointName.trim(),
    p_timezone: 'Europe/Moscow',
  })
  if (error) throw error
  // До этого вызова организации не было — закэшированное «нет организации» устарело.
  resetOrganizationCache()
  const [point] = await listPickupPoints()
  if (!point) throw new Error('Организация создана, но пункт не найден — обновите страницу')
  await updatePickupPoint(point.id, { name: point.name, timezone: point.timezone, hours: input.hours })
  return point.id
}
