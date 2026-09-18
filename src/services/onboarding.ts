import dayjs from 'dayjs'
import type { WorkingHours } from '../entities/types'
import { generateSlots } from '../entities/schedule'
import { monthEnd, today } from '../shared/dates'
import { client, resetOrganizationCache } from './org'
import { listPickupPoints, updatePickupPoint } from './points'
import { createShiftsBulk } from './shifts'

/**
 * Организация и первый пункт — одним RPC: база не допускает организацию без точки,
 * и владелец не должен застрять между шагами с «полуорганизацией».
 * Часы работы RPC не принимает, поэтому пишем их следом.
 */
export async function createOrganization(input:{ name:string; pointName:string; address:string; hours:WorkingHours }) {
  const { error } = await client().rpc('create_organization_with_owner', {
    p_name: input.name.trim(),
    p_point_name: input.pointName.trim(),
    p_point_address: input.address.trim(),
    p_timezone: 'Europe/Moscow',
  })
  if (error) throw error
  // До этого вызова организации не было — закэшированное «нет организации» устарело.
  resetOrganizationCache()
  const [point] = await listPickupPoints()
  if (!point) throw new Error('Организация создана, но пункт не найден — обновите страницу')
  await updatePickupPoint(point.id, { name: point.name, address: point.address, timezone: point.timezone, hours: input.hours })
  return point.id
}

/**
 * «Основной 2/2» из прототипа: сотрудник выходит две смены через две, с сегодняшнего
 * дня до конца месяца. Возвращает число поставленных смен — его показывает тост.
 */
export async function applyStarterSchedule(input:{ employeeId:string; pointId:string; hours:WorkingHours }) {
  const from = today()
  const to = dayjs(monthEnd(from.slice(0, 7))).subtract(1, 'day').format('YYYY-MM-DD')
  const slots = generateSlots({
    kind: 'cycle', on: 2, off: 2, anchor: from,
    participants: [{ employeeId: input.employeeId, offset: 0 }],
  }, from, to)
  return createShiftsBulk(slots.map(slot => ({
    employeeId: input.employeeId,
    pickupPointId: input.pointId,
    date: slot.date,
    startsAt: input.hours.from,
    endsAt: input.hours.to,
  })))
}
