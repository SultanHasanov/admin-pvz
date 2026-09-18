import { expect, test, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { stubSupabase } from './stub'

/**
 * Расчёт зарплаты сотрудника и подтверждение выхода: без «Вышел» смена не попадает
 * в расчёт (в зарплату идут только COMPLETED), а старая панель, где это делали, уходит.
 */

const shot = async (page:Page, name:string) => {
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: `visual/shots/app/${name}.png`, fullPage: true })
}

/** Сегодня — 18 сентября: смены до 17-го подтверждены, с 18-го — план. */
const pinToday = (page:Page) => page.clock.setFixedTime(new Date('2026-09-18T10:00:00+03:00'))

test.beforeAll(async () => { await mkdir('visual/shots/app', { recursive: true }) })

test('расчёт зарплаты: цепочка, смены, вычеты, выплаты', async ({ page }) => {
  await pinToday(page)
  await stubSupabase(page)
  await page.goto('/people/e1')
  await page.waitForSelector('[data-screen]')
  await page.getByText('Остаток к выплате').click()
  await page.waitForURL('**/people/e1/payroll')

  await expect(page.getByText('К выплате', { exact: true })).toBeVisible()
  await expect(page.getByText(/смен(а|ы)? × ставка/)).toBeVisible()
  await expect(page.getByText('Удержание WB · Недостача при инвентаризации')).toBeVisible()
  // Текущий месяц не закрыт: остаток ещё нельзя, кнопка показывает прогноз.
  await expect(page.getByRole('button', { name: /^Прогноз/ })).toBeVisible()
  await shot(page, 'payroll')
})

test('перенесено из старой панели: правка и отключение сотрудника', async ({ page }) => {
  const recorded = await stubSupabase(page)
  await page.goto('/people/e1')
  await page.waitForSelector('[data-screen]')

  await page.getByText('Изменить данные').click()
  await page.waitForURL('**/people/e1/edit')
  await page.getByLabel('ФИО').fill('Ирина Соколова-Петрова')
  await page.getByRole('checkbox', { name: /ПВЗ Мира 5/ }).click()
  await shot(page, 'employee-edit')
  await page.getByRole('button', { name: 'Сохранить' }).click()
  await expect.poll(() => recorded.filter(row => row.table.startsWith('employees') && row.method === 'PATCH').length).toBe(1)
  expect(recorded.find(row => row.table.startsWith('employees') && row.method === 'PATCH')!.body).toMatchObject({ full_name: 'Ирина Соколова-Петрова' })
  const links = () => recorded.filter(row => row.table.startsWith('employee_pickup_points') && row.method === 'POST').flatMap(row => row.body as unknown[])
  await expect.poll(links).toEqual([{ employee_id: 'e1', pickup_point_id: 'p1' }, { employee_id: 'e1', pickup_point_id: 'p2' }])

  await page.waitForURL('**/people/e1')
  await page.getByText('Отключить сотрудника').click()
  await page.getByRole('dialog').getByRole('button', { name: 'Отключить' }).click()
  await expect.poll(() => recorded.filter(row => row.table.startsWith('employees') && row.method === 'PATCH').length).toBe(2)
  expect(recorded.filter(row => row.table.startsWith('employees') && row.method === 'PATCH')[1].body).toMatchObject({ status: 'ARCHIVED' })
})

test('перенесено из старой панели: закрытие месяца и удаление удержания', async ({ page }) => {
  await pinToday(page)
  const recorded = await stubSupabase(page)
  await page.goto('/money?tab=pay')
  await page.waitForSelector('[data-screen]')
  await page.getByRole('button', { name: /Закрыть месяц/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Закрыть месяц' }).click()
  await expect.poll(() => recorded.filter(row => row.table.startsWith('salary_accruals')).length).toBe(1)
  expect(recorded.find(row => row.table.startsWith('salary_periods'))!.body).toMatchObject({ status: 'CLOSED', starts_on: '2026-09-01' })

  await page.goto('/money/ded/d3')
  await page.waitForSelector('[data-screen]')
  await page.getByRole('button', { name: 'Удалить удержание' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Удалить' }).click()
  await expect.poll(() => recorded.filter(row => row.table.startsWith('wb_deductions') && row.method === 'DELETE').length).toBe(1)
})

test('шторка дня: «Вышел» подтверждает смену через RPC', async ({ page }) => {
  await pinToday(page)
  const recorded = await stubSupabase(page)
  await page.goto('/sched')
  await page.waitForSelector('[data-screen]')
  await page.waitForFunction(() => '__openSheet' in window)
  await page.evaluate(() => (window as unknown as { __openSheet:(type:string, props:unknown) => void })
    .__openSheet('day', { pointId: 'p1', date: '2026-09-18' }))

  const sheet = page.getByRole('dialog')
  await sheet.getByText('Запланирована').first().click()
  await page.getByRole('dialog').getByText('Вышел', { exact: true }).click()
  await expect.poll(() => recorded.filter(row => row.table === 'rpc/confirm_shift_as_planned').length).toBe(1)
})
