import type { SetupProgress } from '../entities/setup'
import { client } from './org'

/** Что из настройки уже сделано — один RPC вместо шести запросов (миграция 0026). */
export async function getSetupProgress():Promise<SetupProgress | null> {
  const { data, error } = await client().rpc('setup_progress')
  if (error) throw error
  if (!data) return null
  const row = data as Record<string, boolean>
  return {
    points: Boolean(row.points),
    employees: Boolean(row.employees),
    defaultRate: Boolean(row.default_rate),
    shifts: Boolean(row.shifts),
    income: Boolean(row.income),
    expense: Boolean(row.expense),
    hidden: Boolean(row.hidden),
  }
}

export async function setSetupHidden(hidden:boolean) {
  const { error } = await client().rpc('set_setup_hidden', { p_hidden: hidden })
  if (error) throw error
}
