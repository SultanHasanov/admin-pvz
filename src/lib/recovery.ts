/**
 * Пометка «этот вход — восстановление пароля».
 *
 * Код из письма создаёт обычную сессию, неотличимую от входа по паролю: сам по себе
 * переход на `/reset` проигрывает гонку с обновлением сессии в App, и человек попадал
 * внутрь приложения со старым паролем. Пометка переживает этот переход и перезагрузку
 * вкладки, поэтому экран нового пароля нельзя проскочить.
 *
 * Переменная модуля — основной источник: в приватном режиме хранилище бросает исключение.
 */
const KEY = 'pvz.auth.recovery'

let pending = false

export function markRecovery() {
  pending = true
  try { sessionStorage.setItem(KEY, '1') } catch { /* приватный режим */ }
}

export function clearRecovery() {
  pending = false
  try { sessionStorage.removeItem(KEY) } catch { /* приватный режим */ }
}

export function isRecovering() {
  if (pending) return true
  try { return sessionStorage.getItem(KEY) === '1' } catch { return false }
}
