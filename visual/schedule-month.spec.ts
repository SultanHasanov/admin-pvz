import { expect, test } from '@playwright/test'
import { stubSupabase } from './stub'

// Ленина 12: Ирина и Дмитрий «2 через 2», смены поставлены до 30 сентября.
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-20T10:00:00+03:00'))
  await stubSupabase(page, { point: 'p1' })
})

test('календарь графика листается по месяцам вместе с шапкой', async ({ page }) => {
  await page.goto('/sched')
  await expect(page.getByText('Сентябрь 2026', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Следующий месяц' }).click()
  await expect(page.getByText('Октябрь 2026', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Октябрь ▾' })).toBeVisible()
  await page.getByRole('button', { name: 'Предыдущий месяц' }).click()
  await expect(page.getByText('Сентябрь 2026', { exact: true })).toBeVisible()
})

test('«Продолжить график» открывает мастер с прежней очередью', async ({ page }) => {
  await page.goto('/sched')
  await page.getByRole('button', { name: 'Продолжить график с 1 окт' }).click()
  await expect(page).toHaveURL(/\/sched\/build\?point=p1&from=2026-10-01/)
  await expect(page.getByText('Продолжаем прежний график: Дмитрий и Ирина, 2 через 2')).toBeVisible()
  const strip = page.getByLabel('Кто работает на неделе')
  await expect(strip.getByRole('button', { name: 'чт 1: Дмитрий' })).toBeVisible()
  await expect(strip.getByRole('button', { name: 'сб 3: Ирина' })).toBeVisible()
  await page.screenshot({ path: 'visual/shots/app/guide-continue.png' })
})

test('«Новый график с этого дня» — мастер с выбранной даты и подхваченной очередью', async ({ page }) => {
  await page.goto('/sched')
  await page.getByRole('button', { name: /^25 сентября/ }).click()
  await page.getByRole('button', { name: 'Новый график с 25 сент' }).click()
  await expect(page).toHaveURL(/from=2026-09-25/)
  await expect(page.getByText(/Продолжаем прежний график/)).toBeVisible()
  await expect(page.getByLabel('Кто работает на неделе').getByRole('button', { name: 'пт 25: Ирина' })).toHaveAttribute('aria-pressed', 'true')
})
