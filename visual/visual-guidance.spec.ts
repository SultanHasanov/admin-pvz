import { test, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { stubSupabase } from './stub'

const shot = async (page:Page, name:string) => {
  await page.waitForSelector('[data-screen]')
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(400)
  await page.screenshot({ path: `visual/shots/app/${name}.png` })
}

const emptyTable = (page:Page, table:string) =>
  page.route(`**/rest/v1/${table}**`, route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))

test.describe('визуальные подсказки пустых состояний', () => {
  test.beforeAll(async () => { await mkdir('visual/shots/app', { recursive: true }) })

  test('нет пунктов', async ({ page }) => {
    await stubSupabase(page)
    await emptyTable(page, 'pickup_points')
    await page.goto('/more/points')
    await shot(page, 'empty-points')
  })

  test('нет сотрудников', async ({ page }) => {
    await stubSupabase(page)
    await emptyTable(page, 'employees')
    await page.goto('/people')
    await shot(page, 'empty-people')
  })

  test('нет смен в выбранный день', async ({ page }) => {
    await stubSupabase(page, { point: 'p1' })
    await emptyTable(page, 'shifts')
    await page.goto('/sched?d=2026-09-18&pvz=p1')
    await page.getByText('В этот день никто не выходит').scrollIntoViewIfNeeded()
    await shot(page, 'empty-schedule')
  })

  test('нет финансовых операций', async ({ page }) => {
    await stubSupabase(page)
    await emptyTable(page, 'income_entries')
    await emptyTable(page, 'expense_entries')
    await page.goto('/money?tab=fin')
    await shot(page, 'empty-finance')
  })
})
