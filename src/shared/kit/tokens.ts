/**
 * Токены дизайн-системы для случаев, где класс Tailwind не подходит:
 * инлайновые `style`, цвета в SVG, вычисляемые из данных тона (статусы, плитки метрик).
 * Единственный источник hex — kit/kit.css; здесь только имена.
 */
export const c = {
  bg: 'var(--color-bg)',
  surface: 'var(--color-surface)',
  surfaceSoft: 'var(--color-surface-soft)',
  ink: 'var(--color-ink)',
  inkSoft: 'var(--color-ink-soft)',

  accent: 'var(--color-accent)',
  accentTint: 'var(--color-accent-tint)',
  accentSoft: 'var(--color-accent-soft)',
  accentFaint: 'var(--color-accent-faint)',

  ok: 'var(--color-ok)',
  okTint: 'var(--color-ok-tint)',
  okTint2: 'var(--color-ok-tint-2)',
  bad: 'var(--color-bad)',
  badStrong: 'var(--color-bad-strong)',
  badTint: 'var(--color-bad-tint)',
  badTint2: 'var(--color-bad-tint-2)',
  badTint3: 'var(--color-bad-tint-3)',
  warn: 'var(--color-warn)',
  warnTint: 'var(--color-warn-tint)',
  warnInk: 'var(--color-warn-ink)',
  gold: 'var(--color-gold)',
  info: 'var(--color-info)',
  infoTint: 'var(--color-info-tint)',
  infoTint2: 'var(--color-info-tint-2)',

  line: 'var(--color-line)',
  lineSoft: 'var(--color-line-soft)',
  lineStrong: 'var(--color-line-strong)',
  lineHard: 'var(--color-line-hard)',
  muted: 'var(--color-muted)',
  mutedStrong: 'var(--color-muted-strong)',
  mutedSoft: 'var(--color-muted-soft)',
  mutedFaint: 'var(--color-muted-faint)',

  chartBar: 'var(--color-chart-bar)',
  chartEmpty: 'var(--color-chart-empty)',
  tileIncome: 'var(--color-tile-income)',
  tileExpense: 'var(--color-tile-expense)',
  tileSalary: 'var(--color-tile-salary)',
  tileTax: 'var(--color-tile-tax)',
} as const

export type ColorToken = keyof typeof c

/**
 * Смысловые тона: у каждого тона фон, текст и линия. Прототип раскрашивает
 * статусы, пилюли и быстрые действия ровно этими четырьмя наборами.
 */
export const tone = {
  neutral: { fg: c.mutedStrong, bg: c.lineSoft, line: c.line },
  accent: { fg: c.accent, bg: c.accentTint, line: c.accentSoft },
  ok: { fg: c.ok, bg: c.okTint, line: c.okTint2 },
  warn: { fg: c.warn, bg: c.warnTint, line: c.warnTint },
  bad: { fg: c.bad, bg: c.badTint, line: c.badTint2 },
  info: { fg: c.info, bg: c.infoTint, line: c.infoTint2 },
} as const

export type Tone = keyof typeof tone
