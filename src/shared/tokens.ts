/**
 * Цвета для инлайновых `style` — те же переменные, что раздаёт `@theme` в styles.css.
 * Через обёртку, а не литералами, чтобы TS подсказывал имена и один hex жил в одном месте.
 */
export const color = {
  line: 'var(--color-line)',
  lineSoft: 'var(--color-line-soft)',
  surface: 'var(--color-surface)',
  surfaceMuted: 'var(--color-surface-muted)',
  muted: 'var(--color-muted)',
  sub: 'var(--color-sub)',
  ink: 'var(--color-ink)',
  brand: 'var(--color-brand-500)',
  brandDark: 'var(--color-brand-600)',
  brandSoft: 'var(--color-brand-50)',
  brandTint: 'var(--color-brand-100)',
  danger: 'var(--color-danger-500)',
} as const
