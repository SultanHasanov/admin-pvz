import { useCallback, useEffect, useState } from 'react'

/**
 * Отсчёт до следующей отправки кода. Supabase не даёт слать письма чаще раза в минуту,
 * и без отсчёта кнопка «Отправить повторно» просто вернула бы ошибку.
 * `start()` — после каждой отправки; `left` — сколько секунд ждать, 0 — можно.
 */
export function useCooldown(seconds = 60) {
  const [until, setUntil] = useState(0)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (until <= now) return
    const timer = window.setTimeout(() => setNow(Date.now()), 1000)
    return () => window.clearTimeout(timer)
  }, [until, now])

  const start = useCallback(() => {
    const at = Date.now()
    setNow(at)
    setUntil(at + seconds * 1000)
  }, [seconds])

  return { left: Math.max(0, Math.ceil((until - now) / 1000)), start }
}

/** «0:45» — сколько ждать до повторной отправки. */
export const cooldownLabel = (left:number) => `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`
