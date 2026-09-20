import { expect, test } from '@playwright/test'
import { stubSupabase } from './stub'

test('две команды, правка дня и повторение недели с подтверждением', async ({ page }) => {
  const recorded = await stubSupabase(page)
  await page.goto('/sched/build')
  await expect(page.getByText('Шаг 1 из 3')).toBeVisible()
  await page.getByRole('button', { name: 'Двое', exact: true }).click()
  const teamA = page.getByRole('group', { name: 'Команда А' })
  const teamB = page.getByRole('group', { name: 'Команда Б' })
  await teamA.getByRole('checkbox', { name: 'Ирина Соколова' }).check()
  await teamA.getByRole('checkbox', { name: 'Дмитрий Орлов' }).check()
  await teamB.getByRole('checkbox', { name: 'Камила Юсупова' }).check()
  await expect(teamA).toContainText('выбрано 2 из 2')
  await expect(teamB).toContainText('выбрано 1 из 2')
  await expect(teamA.getByRole('checkbox', { name: 'Камила Юсупова' })).toBeDisabled()
  await expect(teamB.getByRole('checkbox', { name: 'Ирина Соколова' })).toBeDisabled()
  await page.getByRole('button', { name: 'Каждому ½ смены' }).click()
  await page.locator('input[type="date"]').fill('2026-09-21')
  await page.getByRole('button', { name: 'Показать неделю' }).click()

  await expect(page.getByText('Шаг 2 из 3')).toBeVisible()
  await page.screenshot({ path: 'visual/shots/app/guide-week.png' })
  await page.getByRole('button', { name: /пн 21/ }).click()
  await page.getByRole('button', { name: 'Один', exact: true }).click()
  await expect(page.getByText('Исправлено дней: 1')).toBeVisible()
  await page.getByRole('button', { name: 'Выбрать недели' }).click()

  await expect(page.getByText('Шаг 3 из 3')).toBeVisible()
  await page.getByRole('button', { name: /До конца/ }).click()
  await expect(page.getByText('Выбрано недель: 1')).toBeVisible()
  await expect(page.getByRole('button', { name: '1 сентября: Ирина', exact: true })).toBeVisible()
  await page.screenshot({ path: 'visual/shots/app/guide-repeat.png' })
  await page.getByRole('button', { name: /Сохранить \d+ смен/ }).click()
  await expect(page.getByText(/Новых смен:/)).toBeVisible()
  await page.getByRole('button', { name: 'Сохранить график' }).click()

  await expect.poll(() => recorded.some(call => call.table === 'pickup_points' && call.method === 'PATCH')).toBe(true)
  const config = recorded.find(call => call.table === 'pickup_points' && call.method === 'PATCH')?.body as { slot_config?:{ def:number; dates:Record<string, number> } }
  expect(config.slot_config?.def).toBe(2)
  expect(config.slot_config?.dates['2026-09-21']).toBe(1)
  expect(config.slot_config?.dates['2026-09-28']).toBe(1)
})
