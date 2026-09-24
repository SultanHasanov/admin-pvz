import { expect, test } from '@playwright/test'
import { stubSupabase } from './stub'

/**
 * Выбор ПВЗ (решение владельца проекта, 24.09.2026): по умолчанию «Все ПВЗ»,
 * выбранный пункт запоминается и открывается при следующем входе.
 */
test('по умолчанию «Все ПВЗ», выбранный пункт переживает перезагрузку', async ({ page }) => {
  await stubSupabase(page)
  await page.goto('/home')
  await page.waitForSelector('[data-screen]')
  await expect(page.getByRole('button', { name: 'Все ПВЗ ▾' })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.getByRole('button', { name: 'Все ПВЗ ▾' }).click()
  await page.getByRole('dialog').getByText('ПВЗ Мира 5').click()
  await expect(page.getByRole('button', { name: 'ПВЗ Мира 5 ▾' })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('pvz.point'))).toBe('p2')

  // Заглушка ставит ПВЗ только при первом заходе, так что после перезагрузки — выбор приложения.
  await page.reload()
  await page.waitForSelector('[data-screen]')
  await expect(page.getByRole('button', { name: 'ПВЗ Мира 5 ▾' })).toBeVisible()
})
