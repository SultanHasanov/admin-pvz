import { useState } from 'react'

/**
 * Цвет акцента — настройка устройства, а не организации: хранится в localStorage
 * и ставится атрибутом data-accent на <html>; сами цвета — в kit/kit.css.
 */
export type Accent = 'plum' | 'ozon'

export const ACCENTS:{ value:Accent; label:string; swatch:string }[] = [
  { value: 'plum', label: 'Сливовый', swatch: '#8f3a6b' },
  { value: 'ozon', label: 'Ozon', swatch: '#005bff' },
]

const KEY = 'pvz.accent'

export const readAccent = ():Accent => {
  try { return localStorage.getItem(KEY) === 'ozon' ? 'ozon' : 'plum' } catch { return 'plum' }
}

export const applyAccent = (accent:Accent) => {
  if (accent === 'plum') document.documentElement.removeAttribute('data-accent')
  else document.documentElement.setAttribute('data-accent', accent)
}

export function useAccent() {
  const [accent, setAccent] = useState(readAccent)
  const change = (next:Accent) => {
    try { localStorage.setItem(KEY, next) } catch { /* приватный режим браузера */ }
    applyAccent(next)
    setAccent(next)
  }
  return [accent, change] as const
}
