import { useSyncExternalStore } from 'react'

/**
 * Единственная граница «телефон / не телефон» в продукте.
 *
 * Только по ширине судить нельзя: iPhone 14 боком — 844px, и по ширине он получил бы
 * десктопный сайдер и таблицу на девять колонок. `pointer: coarse` ловит телефон в
 * ландшафте и маленькие планшеты, `max-width: 767px` — узкое окно браузера и DevTools.
 */
export const MOBILE_QUERY = '(max-width: 767px), (pointer: coarse) and (max-width: 1023px)'
export const WIDE_QUERY = '(min-width: 1024px)'

/**
 * Читаем медиавыражение синхронно.
 *
 * Антдшный `Grid.useBreakpoint()` на первом рендере отдаёт `{}` и заполняется из эффекта,
 * поэтому `!screens.md` там истинно на первую краску — десктоп мигал мобильной вёрсткой.
 */
function useMediaQuery(query:string) {
  return useSyncExternalStore(
    notify => {
      const list = matchMedia(query)
      list.addEventListener('change', notify)
      return () => list.removeEventListener('change', notify)
    },
    () => matchMedia(query).matches,
    () => false,
  )
}

export const useIsMobile = () => useMediaQuery(MOBILE_QUERY)

// Оба хука вызываем безусловно: `&&` сократил бы второй вызов и сломал порядок хуков.
export function useIsDesktop() {
  const wide = useMediaQuery(WIDE_QUERY)
  const mobile = useMediaQuery(MOBILE_QUERY)
  return wide && !mobile
}
