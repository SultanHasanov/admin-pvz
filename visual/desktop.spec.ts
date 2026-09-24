import { expect, test, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { stubSupabase } from './stub'

/**
 * Десктопная раскладка (фаза 8): сайдбар вместо таб-бара, топбар, master–detail,
 * таблицы вместо строк и диалог вместо шторки. Экраны те же — проверяем, что кит
 * раскладывает их по-другому, а не что появилась вторая вёрстка.
 */
test.use({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false })

const shot = async (page:Page, name:string) => {
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: `visual/shots/app/${name}.png` })
}

const pinToday = (page:Page) => page.clock.setFixedTime(new Date('2026-09-18T10:00:00+03:00'))

test.beforeAll(async () => { await mkdir('visual/shots/app', { recursive: true }) })

test('сайдбар и топбар: главное действие в топбаре, таб-бара нет', async ({ page }) => {
  await pinToday(page)
  await stubSupabase(page)
  await page.goto('/home')
  await page.waitForSelector('[data-screen]')

  const sidebar = page.getByRole('navigation', { name: 'Разделы' })
  await expect(sidebar).toBeVisible()
  await expect(sidebar.getByRole('button', { name: 'Главная' })).toHaveAttribute('aria-current', 'page')
  // Таб-бар телефона не рендерится вовсе, а не прячется.
  await expect(page.locator('nav')).toHaveCount(1)
  await expect(page.getByText('Чистая прибыль · Сентябрь')).toBeVisible()
  await shot(page, 'desktop-home')

  // FAB стал кнопкой топбара и открывает меню диалогом по центру, а не шторкой снизу.
  await page.getByRole('button', { name: 'Добавить', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const box = (await dialog.boundingBox())!
  expect(Math.round(box.x + box.width / 2)).toBe(640)
  expect(box.width).toBeLessThanOrEqual(560)
})

test('подпункты раздела: «Деньги → Зарплаты» открывает вкладку, операции — таблицей', async ({ page }) => {
  await pinToday(page)
  await stubSupabase(page)
  await page.goto('/money')
  await page.waitForSelector('[data-screen]')

  const sidebar = page.getByRole('navigation', { name: 'Разделы' })
  await expect(sidebar.getByRole('button', { name: 'Операции', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('columnheader', { name: 'Сумма' })).toBeVisible()

  await sidebar.getByRole('button', { name: 'Зарплаты' }).click()
  await page.waitForURL('**/money?tab=pay')
  await expect(sidebar.getByRole('button', { name: 'Зарплаты' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('columnheader', { name: 'Остаток' })).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: 'Ирина Соколова' })).toBeVisible()
  await shot(page, 'desktop-payroll')
})

test('master–detail «Люди»: список не перемонтируется при выборе сотрудника', async ({ page }) => {
  await pinToday(page)
  await stubSupabase(page)
  await page.goto('/people')
  await page.waitForSelector('[data-screen]')
  await expect(page.getByText('Выберите сотрудника в списке слева')).toBeVisible()

  // Метка на DOM-узле списка: после перемонтирования её бы не было.
  const list = page.locator('[data-screen]').first()
  await list.evaluate(node => { node.setAttribute('data-probe', 'kept') })

  await page.getByRole('button', { name: /Ирина Соколова/ }).click()
  await page.waitForURL('**/people/e1')
  await expect(page.getByRole('button', { name: /Ирина Соколова/ })).toHaveAttribute('aria-current', 'true')
  await expect(page.getByText('Изменить данные')).toBeVisible()

  await page.getByRole('button', { name: /Дмитрий Орлов/ }).click()
  await page.waitForURL('**/people/e2')
  await expect(page.getByRole('button', { name: /Дмитрий Орлов/ })).toHaveAttribute('aria-current', 'true')
  await expect(page.locator('[data-probe="kept"]')).toHaveCount(1)
  await shot(page, 'desktop-people')
})

test('график: имена в клетках и день справа от календаря', async ({ page }) => {
  await pinToday(page)
  await stubSupabase(page, { point: 'p1' })
  await page.goto('/sched')
  await page.waitForSelector('[data-screen]')

  await expect(page.getByText('Выберите день', { exact: true })).toBeVisible()
  // На телефоне в клетке «Ирина» обрезалась до пяти букв; здесь — имя и инициал фамилии.
  await expect(page.getByRole('button', { name: /^17 сентября: .*Ирина С\./ })).toBeVisible()

  const calendar = (await page.getByRole('button', { name: /^17 сентября/ }).boundingBox())!
  await page.getByRole('button', { name: /^17 сентября/ }).click()
  const title = page.getByText(/^17 сент · /)
  await expect(title).toBeVisible()
  await expect(page.getByText('Выберите день', { exact: true })).toHaveCount(0)
  // Панель дня стоит справа от календаря, а не под ним.
  expect((await title.boundingBox())!.x).toBeGreaterThan(calendar.x + calendar.width)
  await shot(page, 'desktop-sched')
})

test('график: день правится прямо в колонке — «Вышел» без шторки дня', async ({ page }) => {
  await pinToday(page)
  const recorded = await stubSupabase(page, { point: 'p1' })
  await page.goto('/sched')
  await page.waitForSelector('[data-screen]')

  await page.getByRole('button', { name: /^18 сентября/ }).click()
  // Шторки дня нет: смены дня и выбор числа мест — в правой колонке.
  await expect(page.getByText('Сколько человек нужно именно в этот день?')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.getByText('Запланирована').first().click()
  await page.getByRole('dialog').getByText('Вышел', { exact: true }).click()
  await expect.poll(() => recorded.filter(row => row.table === 'rpc/confirm_shift_as_planned').length).toBe(1)
})

test('узкое окно 900px: сайдбар из одних иконок', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 })
  await stubSupabase(page)
  await page.goto('/home')
  await page.waitForSelector('[data-screen]')

  const sidebar = page.getByRole('navigation', { name: 'Разделы' })
  expect((await sidebar.boundingBox())!.width).toBe(72)
  await expect(sidebar.getByRole('button', { name: 'Деньги' })).toBeVisible()
  await expect(sidebar.getByText('Деньги')).toHaveCount(0)
})
