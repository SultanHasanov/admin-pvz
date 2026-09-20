import { expect, test } from '@playwright/test'
import { stubSupabase } from './stub'

test('в день с двумя местами назначаются два сотрудника за один раз', async ({ page }) => {
  const recorded = await stubSupabase(page)
  await page.goto('/sched')
  await page.waitForFunction(() => '__openSheet' in window)
  await page.evaluate(() => (window as unknown as { __openSheet:(type:string, props:unknown) => void })
    .__openSheet('day', { pointId: 'p1', date: '2026-09-19' }))
  await page.getByRole('button', { name: 'Двое', exact: true }).click()
  await page.getByRole('button', { name: 'Добавить сотрудников' }).click()

  await expect(page.getByText('Выбрано 0 из 2')).toBeVisible()
  await page.getByRole('checkbox', { name: /Ирина Соколова/ }).check()
  await page.getByRole('checkbox', { name: /Дмитрий Орлов/ }).check()
  await expect(page.getByRole('button', { name: 'Назначить 2 сотрудников' })).toBeEnabled()
  await page.screenshot({ path: 'visual/shots/app/day-pair-selected.png' })
  await page.getByRole('button', { name: 'Назначить 2 сотрудников' }).click()

  await expect.poll(() => recorded.filter(call => call.table === 'shifts' && call.method === 'POST').length).toBe(1)
  const shifts = recorded.find(call => call.table === 'shifts' && call.method === 'POST')?.body as Record<string, unknown>[]
  expect(shifts.map(shift => shift.employee_id)).toEqual(['e1', 'e2'])
  expect(shifts.map(shift => shift.slot_index)).toEqual([0, 1])

  const toast = page.locator('[data-sonner-toast]').last()
  await expect(toast).toContainText('Назначено сотрудников: 2')
  const icon = toast.locator('span').first()
  const message = toast.locator('span').nth(1)
  const iconBox = await icon.boundingBox()
  const messageBox = await message.boundingBox()
  expect(iconBox && messageBox && iconBox.x + iconBox.width <= messageBox.x).toBeTruthy()
  await expect(page.getByText('Эта шторка ещё не перенесена из прототипа.')).toHaveCount(0)
  await page.screenshot({ path: 'visual/shots/app/day-pair-toast.png' })
})
