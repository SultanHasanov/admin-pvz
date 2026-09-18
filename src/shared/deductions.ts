import type { DeductionEvent, DeductionStatus } from '../entities/types'
import type { Tone } from './kit/tokens'

/** Тон пилюли статуса: «из зарплаты» — акцент, убыток и подтверждение WB — тревога. */
export const deductionTones:Record<DeductionStatus, Tone> = {
  NEW: 'warn', INVESTIGATING: 'warn', DISPUTED: 'info', PENDING: 'warn',
  CANCELLED_BY_WB: 'ok', CONFIRMED_BY_WB: 'bad', EMPLOYEE_LIABILITY: 'accent', OWNER_LOSS: 'bad',
}

export const deductionTitles:Record<DeductionStatus, string> = {
  NEW: 'новое', INVESTIGATING: 'разбираемся', DISPUTED: 'оспаривается', PENDING: 'ожидает решения',
  CANCELLED_BY_WB: 'отменено WB', CONFIRMED_BY_WB: 'подтверждено WB',
  EMPLOYEE_LIABILITY: 'из зарплаты', OWNER_LOSS: 'убыток владельца',
}

/**
 * Строка истории удержания. Реплику сотрудника показываем с именем — владелец должен
 * видеть, кто возразил, а не безличное «EMPLOYEE_DISAGREE».
 */
export function eventText(event:DeductionEvent, nameOf:(id:string) => string) {
  if (event.eventType === 'EMPLOYEE_DISAGREE') {
    const who = event.authorEmployeeId ? nameOf(event.authorEmployeeId) : 'Сотрудник'
    return `${who} не согласен: ${event.note ?? 'без комментария'}`
  }
  return event.note || event.eventType
}
