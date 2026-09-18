import { useEffect } from 'react'
import { toast } from 'sonner'
import { useRegisterSW } from 'virtual:pwa-register/react'

/** Раз в час спрашиваем сервер о новой версии: приложение на телефоне не закрывают неделями. */
const CHECK_EVERY = 60 * 60 * 1000

/**
 * Новая версия приложения. Сервис-воркер в режиме prompt: он скачивает версию в фоне,
 * но включает её только по кнопке — иначе перезагрузка съела бы заполненную форму.
 *
 * Тост, а не шторка: шторка одна за раз (инвариант 5), и обновление закрыло бы открытую
 * форму. Тост висит, пока человек не нажмёт «Обновить» или не смахнёт его.
 */
export function UpdatePrompt() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return
      setInterval(() => { void registration.update() }, CHECK_EVERY)
    },
  })

  useEffect(() => {
    if (!needRefresh) return
    const id = toast('Вышла новая версия приложения', {
      duration: Infinity,
      action: { label: 'Обновить', onClick: () => void updateServiceWorker(true) },
    })
    return () => { toast.dismiss(id) }
  }, [needRefresh, updateServiceWorker])

  return null
}
