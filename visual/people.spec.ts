import { expect, test } from '@playwright/test'
import { stubSupabase } from './stub'

/**
 * Переключатель в списке людей: отключает уволившегося, не открывая карточку.
 * Проверяем то, что ушло в базу, и что карточка при этом не открылась.
 */
test('переключатель в строке отключает сотрудника', async ({ page }) => {
  const recorded = await stubSupabase(page)
  await page.goto('/people')
  await page.waitForSelector('[data-screen]')

  const toggle = page.getByRole('switch', { name: 'Отключить Ирина Соколова' })
  await expect(toggle).toBeChecked()
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: 'visual/shots/app/people.png' })

  await toggle.click()

  await expect.poll(() => recorded.filter(row => row.table === 'employees').length).toBe(1)
  const write = recorded.find(row => row.table === 'employees')!
  expect(write.method).toBe('PATCH')
  expect(write.body).toMatchObject({ status: 'ARCHIVED' })
  // Карточка не открылась: переключатель не должен срабатывать как нажатие на строку.
  await expect(page).toHaveURL(/\/people$/)
  await expect(page.getByText('Отключили: Ирина')).toBeVisible()
})
