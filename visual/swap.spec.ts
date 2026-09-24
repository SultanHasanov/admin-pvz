import { expect, test, type Page } from '@playwright/test'
import { stubSupabase } from './stub'

// Ленина 12, 2 через 2: 25–26 сентября Ирина, 23–24 и 27–28 — Дмитрий.
async function openSwap(page:Page) {
  await page.clock.setFixedTime(new Date('2026-09-20T10:00:00+03:00'))
  const recorded = await stubSupabase(page)
  await page.goto('/sched')
  await page.waitForFunction(() => '__openSheet' in window)
  await page.evaluate(() => (window as unknown as { __openSheet:(type:string, props:unknown) => void })
    .__openSheet('day', { pointId: 'p1', date: '2026-09-25' }))
  await page.getByRole('button', { name: 'Заменить: Ирина' }).click()
  await expect(page.getByText(/Ирина не может выйти/)).toBeVisible()
  return recorded
}
const rpc = (recorded:Awaited<ReturnType<typeof stubSupabase>>) =>
  recorded.filter(call => call.table === 'rpc/replace_shift').map(call => call.body as Record<string, string>)

test('быстрая замена: напарник первым, ставится одним нажатием', async ({ page }) => {
  const recorded = await openSwap(page)
  const first = page.getByRole('button', { name: /Дмитрий Орлов/ }).first()
  await expect(first).toContainText('Напарник')
  await expect(first).toContainText('после смены')
  await page.screenshot({ path: 'visual/shots/app/swap.png', fullPage: true })
  await first.click()
  await expect.poll(() => rpc(recorded).length).toBe(1)
  expect(rpc(recorded)[0].p_employee_id).toBe('e2')
})

test('обмен сменами: напарник выходит сегодня, отсутствующий — в его ближайший день', async ({ page }) => {
  const recorded = await openSwap(page)
  await page.getByRole('button', { name: /Дмитрий выйдет 25 сент, Ирина — 27 сент/ }).click()
  await expect.poll(() => rpc(recorded).length).toBe(2)
  expect(rpc(recorded).map(call => call.p_employee_id)).toEqual(['e2', 'e1'])
})

test('никто не может: снять смену — место остаётся свободным', async ({ page }) => {
  const recorded = await openSwap(page)
  await page.getByRole('button', { name: 'Оставить место свободным' }).click()
  await expect.poll(() => recorded.some(call => call.method === 'DELETE' && call.table === 'shifts')).toBe(true)
})
