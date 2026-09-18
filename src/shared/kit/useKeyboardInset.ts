import { useEffect } from 'react'

/**
 * Поднимает интерфейс над экранной клавиатурой.
 *
 * Android решается метой `interactive-widget=resizes-content` — там лейаут сжимается сам.
 * iOS так не умеет: `100dvh` остаётся прежним, клавиатура просто накрывает содержимое,
 * а страница ещё и уезжает вверх. Единственный надёжный источник правды — visualViewport:
 * высота его области минус высота окна и есть занятое клавиатурой место.
 *
 * Результат кладём в переменную `--kb` на корне — футеры шторок и плавающие кнопки
 * добавляют её к своему нижнему отступу.
 */
export function useKeyboardInset() {
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return

    const root = document.documentElement
    const apply = () => {
      // offsetTop учитывает сдвиг, который iOS делает при фокусе в нижнем поле.
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      // Клавиатура ниже 80px — это панель подсказок или дрожание при скролле, а не клавиатура.
      root.style.setProperty('--kb', `${inset > 80 ? Math.round(inset) : 0}px`)
    }

    apply()
    viewport.addEventListener('resize', apply)
    viewport.addEventListener('scroll', apply)
    return () => {
      viewport.removeEventListener('resize', apply)
      viewport.removeEventListener('scroll', apply)
      root.style.removeProperty('--kb')
    }
  }, [])
}
