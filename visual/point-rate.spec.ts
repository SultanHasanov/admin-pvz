import { expect, test } from '@playwright/test'
import { stubSupabase } from './stub'

test('ставка всем сотрудникам пункта с даты, календарь листается по месяцам', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-24T10:00:00+03:00'))
  const recorded = await stubSupabase(page)
  await page.goto('/more/points/p1')
  // Ставка видна сразу, над сменами: у троих разные суммы — вилка и разбивка.
  await expect(page.getByText(/^2\s000 – 2\s200\s₽$/)).toBeVisible()
  await page.screenshot({ path: 'visual/shots/app/point-edit-rate.png' })
  await page.getByRole('button', { name: 'Изменить', exact: true }).click()

  await page.getByLabel('Ставка за смену').fill('2500')
  // По умолчанию с 1 октября; листаем на ноябрь и выбираем 15-е.
  await page.getByRole('button', { name: /1 окт/ }).click()
  await page.getByRole('button', { name: 'Следующий месяц' }).click()
  await expect(page.getByText('Ноябрь 2026')).toBeVisible()
  await page.getByRole('button', { name: /^15 ноября/ }).click()
  await expect(page.getByRole('button', { name: /15 нояб/ })).toBeVisible()

  // Камила работает и на втором пункте — предупреждаем, что ставка сменится и там.
  await expect(page.getByText(/работает и на .*ставка сменится и там/)).toBeVisible()
  await page.screenshot({ path: 'visual/shots/app/point-rate.png' })
  await page.getByRole('button', { name: /Сохранить ставку для 3/ }).click()

  await expect.poll(() => recorded.filter(call => call.table === 'salary_rules').length).toBe(3)
  const rows = recorded.filter(call => call.table === 'salary_rules').map(call => call.body as Record<string, unknown>)
  expect(new Set(rows.map(row => row.employee_id))).toEqual(new Set(['e1', 'e2', 'e7']))
  expect(rows.every(row => row.rate_kopecks === 250000 && row.effective_from === '2026-11-15')).toBe(true)
})
