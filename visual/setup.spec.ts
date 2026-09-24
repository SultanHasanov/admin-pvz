import { expect, test, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { stubSupabase } from './stub'

/**
 * Задания «Настройка пункта» для нового владельца: полоска на главной, экран заданий,
 * переходы к заданиям и «убрать с главной».
 */

const shot = async (page:Page, name:string) => {
  await page.evaluate(() => document.fonts.ready)
  // Пружинный переход между экранами: снимаем, когда он доиграл.
  await page.waitForTimeout(600)
  await page.screenshot({ path: `visual/shots/app/${name}.png` })
}

const fresh = { points: true, employees: false, default_rate: false, shifts: false, income: false, expense: false, hidden: false }
const all = { points: true, employees: true, default_rate: true, shifts: true, income: true, expense: true, hidden: false }

test.describe('настройка пункта', () => {
  test.beforeAll(async () => { await mkdir('visual/shots/app', { recursive: true }) })

  test('новый владелец видит полоску на главной и следующий шаг', async ({ page }) => {
    await stubSupabase(page, { rpc: { setup_progress: { ...fresh, employees: true } } })
    await page.goto('/home')
    await page.waitForSelector('[data-screen]')

    await expect(page.getByText('Настройка пункта')).toBeVisible()
    await expect(page.getByText('2 из 6')).toBeVisible()
    await expect(page.getByText('задать ставку по умолчанию')).toBeVisible()
    await shot(page, 'setup-strip')

    await page.getByText('Настройка пункта').click()
    await expect(page).toHaveURL(/\/home\/setup$/)
    await expect(page.getByText('Следующий шаг')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Задать ставку', exact: true })).toBeVisible()
    await shot(page, 'setup')
  })

  test('график закрыт без сотрудников, задание ведёт на свой экран', async ({ page }) => {
    await stubSupabase(page, { rpc: { setup_progress: fresh } })
    await page.goto('/home/setup')
    await page.waitForSelector('[data-screen]')

    await expect(page.getByText('Сначала добавьте сотрудников')).toBeVisible()
    await page.getByRole('button', { name: 'Добавить сотрудника' }).click()
    await expect(page).toHaveURL(/\/people\/new$/)
  })

  test('«Убрать с главной» пишет флаг в базу', async ({ page }) => {
    const recorded = await stubSupabase(page, { rpc: { setup_progress: fresh } })
    await page.goto('/home/setup')
    await page.waitForSelector('[data-screen]')

    await page.getByRole('button', { name: 'Убрать с главной' }).click()
    await page.getByRole('button', { name: 'Убрать', exact: true }).click()
    await expect.poll(() => recorded.filter(row => row.table === 'rpc/set_setup_hidden').length).toBe(1)
    expect(recorded.find(row => row.table === 'rpc/set_setup_hidden')!.body).toEqual({ p_hidden: true })
  })

  test('всё сделано — карточка «Пункт настроен»', async ({ page }) => {
    await stubSupabase(page, { rpc: { setup_progress: all } })
    await page.goto('/home/setup')
    await page.waitForSelector('[data-screen]')
    await expect(page.getByText('Пункт настроен')).toBeVisible()
    await shot(page, 'setup-done')
  })

  test('скрытая настройка не показывается на главной, но есть в «Ещё»', async ({ page }) => {
    await stubSupabase(page, { rpc: { setup_progress: { ...fresh, hidden: true } } })
    await page.goto('/home')
    await page.waitForSelector('[data-screen]')
    await expect(page.getByText('Чистая прибыль', { exact: false })).toBeVisible()
    await expect(page.getByText('Настройка пункта')).toHaveCount(0)

    await page.goto('/more')
    await page.waitForSelector('[data-screen]')
    await expect(page.getByText('Настройка пункта')).toBeVisible()
    await expect(page.getByText('1 из 6')).toBeVisible()
  })
})
