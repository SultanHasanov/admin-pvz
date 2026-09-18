import { expect, test } from '@playwright/test'
import { stubSupabase } from './stub'

/**
 * Кегли — главный признак совпадения с прототипом: разницу между 14.5 и 16 на глаз
 * не поймать, а плотность экрана она меняет целиком. Значения взяты из его разметки.
 * Проверяем через классы кита: они и есть шкала (см. --text-* в kit/kit.css).
 */
const expected:[string, string, number][] = [
  ['заголовок экрана', '.text-\\[21px\\]', 21],
  ['цифра в тёмной карточке', '.text-hero', 38],
  ['плитка метрики', '.text-tile', 18.5],
  ['заголовок раздела', '.text-sec', 15.5],
  ['строка списка', '.text-row', 14.5],
  ['подпись строки', '.text-sub', 12.5],
  ['моно-капс', '.lbl', 10.5],
  ['подпись таба', '.text-axis', 10],
]

test('кегли совпадают с прототипом', async ({ page }) => {
  await page.goto('/kit')
  await page.waitForSelector('[data-screen]')
  await page.evaluate(() => document.fonts.ready)

  for (const [name, selector, size] of expected) {
    const actual = await page.locator(selector).first().evaluate(node => parseFloat(getComputedStyle(node).fontSize))
    expect(actual, name).toBeCloseTo(size, 1)
  }
})

test('шрифты подгрузились', async ({ page }) => {
  await page.goto('/kit')
  await page.waitForSelector('[data-screen]')
  await page.evaluate(() => document.fonts.ready)

  const fonts = await page.evaluate(() => ({
    body: getComputedStyle(document.body).fontFamily,
    mono: getComputedStyle(document.querySelector('.font-mono')!).fontFamily,
    loaded: [...document.fonts].filter(font => font.status === 'loaded').map(font => font.family),
  }))
  expect(fonts.body).toContain('IBM Plex Sans')
  expect(fonts.mono).toContain('IBM Plex Mono')
  expect(fonts.loaded.join(' ')).toContain('IBM Plex Sans')
  expect(fonts.loaded.join(' ')).toContain('IBM Plex Mono')
})

/**
 * Вес проверяется по ширине набранного текста, а не по getComputedStyle: вычисленный
 * font-weight был 600 и тогда, когда браузер рисовал 400 (вариативный файл в WebKit).
 * У Plex полужирный шире обычного, так что одинаковая ширина — верный признак подмены.
 */
async function weightsRender(page:import('@playwright/test').Page, host:string) {
  return page.evaluate(selector => {
    const root = document.querySelector(selector)!
    const probe = (weight:number) => {
      const span = document.createElement('span')
      span.style.fontWeight = String(weight)
      // Вне потока: внутри flex-контейнера span растянулся бы на всю ширину.
      span.style.position = 'absolute'
      span.style.whiteSpace = 'nowrap'
      span.textContent = 'Пункт выдачи заказов'
      root.append(span)
      const width = span.getBoundingClientRect().width
      span.remove()
      return width
    }
    return { family: getComputedStyle(root).fontFamily, regular: probe(400), semibold: probe(600) }
  }, host)
}

test('оболочка набрана Plex, полужирный рисуется', async ({ page }) => {
  await stubSupabase(page)
  await page.goto('/home')
  await page.waitForSelector('[data-screen]')
  await page.evaluate(() => document.fonts.ready)
  const result = await weightsRender(page, '[data-screen]')
  expect(result.family).toMatch(/^"?IBM Plex Sans/)
  expect(result.semibold).toBeGreaterThan(result.regular + 2)
})

test('вход набран Plex, полужирный рисуется', async ({ page }) => {
  await stubSupabase(page, { signedIn: false })
  await page.goto('/login')
  await page.waitForSelector('.kit-root')
  await page.evaluate(() => document.fonts.ready)
  const result = await weightsRender(page, '.kit-root')
  expect(result.family).toMatch(/^"?IBM Plex Sans/)
  expect(result.semibold).toBeGreaterThan(result.regular + 2)
})

test('поля не зумят iOS: кегль не меньше 16px', async ({ page }) => {
  await page.goto('/kit')
  await page.waitForSelector('[data-screen]')

  const sizes = await page.locator('input, textarea, select').evaluateAll(nodes =>
    nodes.map(node => parseFloat(getComputedStyle(node).fontSize)))
  expect(sizes.length).toBeGreaterThan(0)
  for (const size of sizes) expect(size).toBeGreaterThanOrEqual(16)
})
