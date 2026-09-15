import { useEffect } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/**
 * Возврат «назад» должен открывать список там, где его оставили.
 *
 * `<ScrollRestoration/>` требует data-роутера (`createBrowserRouter`), а продукт живёт на
 * `<BrowserRouter>` + `<Routes>`. Скроллится при этом `window` — у `Layout.Content` своего
 * скролла нет, поэтому хватает карты «ключ истории → смещение».
 */
const offsets = new Map<string, number>()

export function useScrollRestore() {
  const { key } = useLocation()
  const type = useNavigationType()

  useEffect(() => {
    const saved = offsets.get(key)
    window.scrollTo({ top: type === 'POP' && saved ? saved : 0 })

    const remember = () => { offsets.set(key, window.scrollY) }
    window.addEventListener('scroll', remember, { passive: true })
    return () => window.removeEventListener('scroll', remember)
  }, [key, type])
}
