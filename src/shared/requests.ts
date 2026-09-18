import type { ShiftRequest, ShiftRequestKind, ShiftRequestStatus } from '../entities/types'
import type { Tone } from './kit/tokens'

/** Причины, которые сотрудник выбирает в «Не смогу выйти». Свободного ввода в прототипе нет. */
export const SHIFT_REASONS = ['Болезнь', 'Семейные обстоятельства', 'Учёба', 'Другое'] as const

/** Причины отпуска. «Личные дела» — тот же неоплачиваемый отпуск, отличается только формулировкой. */
export const VACATION_REASONS:{ label:string; kind:ShiftRequestKind }[] = [
  { label: 'Отпуск', kind: 'VACATION' },
  { label: 'Больничный', kind: 'SICK' },
  { label: 'Личные дела', kind: 'VACATION' },
]

export const requestKindTitles:Record<ShiftRequestKind, string> = {
  SHIFT: 'Не смогу выйти',
  VACATION: 'Отпуск',
  SICK: 'Больничный',
}

export const requestStatusTones:Record<ShiftRequestStatus, Tone> = {
  SENT: 'warn',
  SUBSTITUTE_FOUND: 'ok',
  ALONE: 'ok',
  APPROVED: 'ok',
  DECLINED: 'bad',
}

/**
 * Что видит сотрудник по своей заявке. Формулировки важны: «выйдет один» и «замена
 * назначена» — разные исходы, и в обоих случаях человек должен понять, что делать завтра.
 */
export function requestStatusText(request:ShiftRequest, nameOf:(id:string) => string) {
  switch (request.status) {
    case 'SENT': return 'Отправлено · ждём решения владельца'
    case 'SUBSTITUTE_FOUND': return `Замена назначена: ${request.substituteEmployeeId ? nameOf(request.substituteEmployeeId) : 'сотрудник'}`
    case 'ALONE': return 'Выйдет один напарник'
    case 'APPROVED': return 'Подтверждено владельцем'
    default: return 'Владелец отказал'
  }
}
