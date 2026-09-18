import { useSyncExternalStore } from 'react'

/**
 * Установка на телефон («На экран Домой»).
 *
 * Chrome на Android присылает `beforeinstallprompt` один раз и рано — до того, как человек
 * дойдёт до «Ещё». Поэтому событие ловим при загрузке модуля и держим до вызова.
 * Safari на iOS такого события не знает вовсе: там можно только подсказать путь через «Поделиться».
 */
interface InstallEvent extends Event { prompt():Promise<void>; userChoice:Promise<{ outcome:'accepted' | 'dismissed' }> }

let deferred:InstallEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach(listener => listener())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault()
    deferred = event as InstallEvent
    notify()
  })
  window.addEventListener('appinstalled', () => { deferred = null; notify() })
}

const standalone = () => typeof window !== 'undefined' && (
  matchMedia('(display-mode: standalone)').matches
  || (navigator as Navigator & { standalone?:boolean }).standalone === true
)
const ios = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)

export function useInstall() {
  const canPrompt = useSyncExternalStore(
    listener => { listeners.add(listener); return () => { listeners.delete(listener) } },
    () => deferred !== null,
    () => false,
  )
  const installed = standalone()
  return {
    installed,
    canPrompt,
    /** iOS: кнопки установки нет, только подсказка. */
    iosHint: !installed && !canPrompt && ios(),
    async prompt() {
      if (!deferred) return false
      const event = deferred
      deferred = null
      notify()
      await event.prompt()
      return (await event.userChoice).outcome === 'accepted'
    },
  }
}
