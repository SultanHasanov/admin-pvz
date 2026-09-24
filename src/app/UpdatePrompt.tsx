import { useEffect, useRef } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useAnySheetOpen } from './sheets'

/** Раз в час спрашиваем сервер о новой версии: приложение на телефоне не закрывают неделями. */
const CHECK_EVERY = 60 * 60 * 1000

/**
 * Новая версия приложения включается сама, без кнопки. Сервис-воркер в режиме prompt:
 * он скачивает версию в фоне, а перезагружаем мы в безопасный момент — когда не открыта
 * ни одна шторка (формы живут в шторках). Иначе перезагрузка съела бы заполненную форму.
 * Уход в фон — не повод: человек мог выйти в SMS за кодом посреди формы.
 */
export function UpdatePrompt() {
  const checkTimer = useRef<number | undefined>(undefined)
  const sheetOpen = useAnySheetOpen()
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return
      // Проверяем обновление сразу: приложение могли не открывать неделями.
      void registration.update().catch(error => console.error('[pwa] update check failed', error))
      window.clearInterval(checkTimer.current)
      checkTimer.current = window.setInterval(() => {
        void registration.update().catch(error => console.error('[pwa] update check failed', error))
      }, CHECK_EVERY)
    },
    onRegisterError(error) {
      console.error('[pwa] service worker registration failed', error)
    },
  })

  useEffect(() => () => window.clearInterval(checkTimer.current), [])

  useEffect(() => {
    // Шторка открыта — ждём, пока её закроют: эффект перезапустится по sheetOpen.
    if (needRefresh && !sheetOpen) void updateServiceWorker(true)
  }, [needRefresh, sheetOpen, updateServiceWorker])

  return null
}
