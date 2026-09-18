/**
 * Тактильный отклик. На Android работает `navigator.vibrate`, в iOS Safari его нет —
 * там вызовы молча проходят мимо (и это нормально: в вебе альтернативы не существует).
 * Когда появится обёртка Capacitor, здесь же подключится `Haptics.impact`.
 */

const vibrate = (pattern:number | number[]) => {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return
  try { navigator.vibrate(pattern) } catch { /* iOS Safari и заблокированный доступ */ }
}

export const haptics = {
  /** Нажатие кнопки, выбор в списке. */
  tap: () => vibrate(8),
  /** Успешное действие: операция создана, смена назначена. */
  success: () => vibrate([10, 40, 14]),
  /** Предупреждение: конфликт в графике, незакрытый месяц. */
  warn: () => vibrate([16, 60, 16]),
  /** Ошибка: не прошла валидация или запрос. */
  error: () => vibrate([24, 50, 24, 50, 24]),
}
