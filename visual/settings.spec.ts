import { expect, test, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { stubSupabase, type Recorded } from './stub'

/**
 * Настройки, интеграции, вход и онбординг (фаза 7): снимки и то, что уходит в базу.
 */

/** Снимок после загрузки шрифтов: иначе на картинке системные начертания и чужой вес. */
const shot = async (page:Page, name:string) => {
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: `visual/shots/app/${name}.png` })
}

/** Функция WB живёт в /api (Vercel), в dev-сервере её нет — отвечаем за неё здесь. */
async function stubWb(page:Page, recorded:Recorded[], status:'CONNECTED' | 'NOT_CONNECTED') {
  await page.route('**/api/wb/integration**', route => {
    const request = route.request()
    if (request.method() === 'GET') return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ status, phoneHint: status === 'CONNECTED' ? '+7 ••• •••-45-90' : null, lastSyncAt: '2026-09-17T06:41:00Z', lastError: null }),
    })
    const body = request.postDataJSON() as Record<string, unknown>
    recorded.push({ method: request.method(), table: `api/wb/${body?.action ?? 'delete'}`, body })
    const reply = body?.action === 'sync'
      ? { ok: true, points: 3, employees: 7, deductions: 5, lastSyncAt: '2026-09-18T07:00:00Z' }
      : body?.action === 'request_code' ? { ok: true, codeLength: 4 } : { ok: true }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reply) })
  })
}

test.describe('настройки', () => {
  test.beforeAll(async () => { await mkdir('visual/shots/app', { recursive: true }) })

  test('экран настроек показывает текущие значения', async ({ page }) => {
    const recorded = await stubSupabase(page)
    await stubWb(page, recorded, 'CONNECTED')
    await page.goto('/more/settings')
    await page.waitForSelector('[data-screen]')

    await expect(page.getByText('ИП Ковалёв А. С.')).toBeVisible()
    await expect(page.getByText('6 %')).toBeVisible()
    await expect(page.getByText('аванс 15, остаток 5')).toBeVisible()
    await expect(page.getByText('подключено: 1')).toBeVisible()
    await shot(page, 'settings')
  })

  test('дни выплат пишутся upsert-ом по организации', async ({ page }) => {
    const recorded = await stubSupabase(page)
    await stubWb(page, recorded, 'CONNECTED')
    await page.goto('/more/settings')
    await page.waitForSelector('[data-screen]')

    await page.getByText('Дни выплат').click()
    const sheet = page.getByRole('dialog')
    await sheet.getByLabel('День аванса').fill('10')
    await sheet.getByLabel('День остатка').fill('25')
    await sheet.getByRole('button', { name: 'Сохранить' }).click()

    await expect.poll(() => recorded.filter(row => row.table === 'payout_settings').length).toBe(1)
    expect(recorded.find(row => row.table === 'payout_settings')!.body).toMatchObject({
      organization_id: 'org-1', advance_day: 10, payday: 25,
    })
  })

  test('пункт выдачи: часы работы и места по дням недели', async ({ page }) => {
    const recorded = await stubSupabase(page)
    await page.goto('/more/points')
    await page.waitForSelector('[data-screen]')
    await shot(page, 'points')

    await page.getByText('ПВЗ Ленина 12').click()
    await page.waitForSelector('text=Сотрудников на смене')
    await page.getByLabel('Открытие').fill('10:00')
    // Суббота — шестая строка (индекс 5 от понедельника): там нужен второй человек.
    await page.getByRole('button', { name: 'Увеличить' }).nth(6).click()
    await shot(page, 'point-edit')
    await page.getByRole('button', { name: 'Сохранить' }).click()

    await expect.poll(() => recorded.filter(row => row.table === 'pickup_points').length).toBe(2)
    const [details, slots] = recorded.filter(row => row.table === 'pickup_points').map(row => row.body as Record<string, unknown>)
    expect(details.working_hours).toEqual({ from: '10:00', to: '21:00' })
    expect(slots.slot_config).toEqual({ def: 1, wd: { 5: 2 } })
  })

  test('регулярные расходы: «Оплачено» — RPC подтверждения', async ({ page }) => {
    const recorded = await stubSupabase(page)
    await page.goto('/money/recurring')
    await page.waitForSelector('[data-screen]')
    await shot(page, 'recurring')

    await page.getByRole('button', { name: 'Оплачено' }).first().click()
    await expect.poll(() => recorded.filter(row => row.table === 'rpc/confirm_recurring_expense').length).toBe(1)
  })

  test('журнал операций открывает шторку правки', async ({ page }) => {
    const recorded = await stubSupabase(page)
    await page.goto('/money/ops')
    await page.waitForSelector('[data-screen]')
    await shot(page, 'operations')

    await page.getByText('Замена ролика', { exact: false }).click()
    const sheet = page.getByRole('dialog')
    await expect(sheet.getByText('Изменить операцию')).toBeVisible()
    await sheet.getByRole('button', { name: 'Сохранить' }).click()
    await expect.poll(() => recorded.filter(row => row.table === 'expense_entries' && row.method === 'PATCH').length).toBe(1)
  })

  test('кабинет WB: телефон, код, подключение', async ({ page }) => {
    const recorded = await stubSupabase(page)
    await stubWb(page, recorded, 'NOT_CONNECTED')
    await page.goto('/more/wb')
    await page.waitForSelector('[data-screen]')

    await page.getByLabel('Телефон кабинета WB').fill('89061184590')
    await expect(page.getByLabel('Телефон кабинета WB')).toHaveValue('+7 (906) 118-45-90')
    await page.getByRole('button', { name: 'Получить код' }).click()
    await page.getByLabel('Код из SMS').fill('1234')
    await shot(page, 'wb-cabinet')
    await page.getByRole('button', { name: 'Подтвердить код' }).click()

    await expect.poll(() => recorded.filter(row => row.table === 'api/wb/confirm_code').length).toBe(1)
    expect(recorded.find(row => row.table === 'api/wb/request_code')!.body).toMatchObject({ phone: '+7 (906) 118-45-90' })
    expect(recorded.find(row => row.table === 'api/wb/confirm_code')!.body).toMatchObject({ code: '1234' })
  })

  test('сверка с WB показывает итог загрузки', async ({ page }) => {
    const recorded = await stubSupabase(page)
    await stubWb(page, recorded, 'CONNECTED')
    await page.goto('/money/ded/sync')
    await page.waitForSelector('[data-screen]')

    await page.getByRole('button', { name: 'Обновить данные WB' }).click()
    await expect(page.getByText('ПВЗ — 3, сотрудников — 7, удержаний — 5')).toBeVisible()
    await shot(page, 'wb-sync')
  })

  test('telegram: бот на точке и форма токена на остальных', async ({ page }) => {
    await stubSupabase(page)
    await page.goto('/more/telegram')
    await page.waitForSelector('[data-screen]')
    await expect(page.getByText('@pvz_lenina_bot')).toBeVisible()
    await expect(page.getByLabel('Токен от BotFather')).toHaveCount(2)
    await shot(page, 'telegram')
  })

  test('новый сотрудник: три шага, ставка из справочника, точки', async ({ page }) => {
    const recorded = await stubSupabase(page)
    await page.goto('/people')
    await page.waitForSelector('[data-screen]')
    await page.getByRole('button', { name: 'Сотрудник' }).click()
    await page.waitForSelector('text=ФИО и телефон')

    await page.getByLabel('ФИО').fill('Ольга Петрова')
    await page.getByLabel('Телефон').fill('89120000001')
    await shot(page, 'employee-new-1')
    await page.getByRole('button', { name: 'Далее' }).click()

    await page.getByRole('checkbox', { name: /ПВЗ Ленина 12/ }).click()
    await shot(page, 'employee-new-2')
    await page.getByRole('button', { name: 'Далее' }).click()

    // Ставка подставлена из salary_rates (is_default): 2 000 ₽.
    await expect(page.locator('input[inputmode="numeric"]')).toHaveValue(/^2\s?000$/)
    await shot(page, 'employee-new-3')
    await page.getByRole('button', { name: 'Добавить сотрудника' }).click()
    await expect(page.getByText('Ольга добавлен', { exact: true })).toBeVisible()
    await shot(page, 'employee-new-done')

    const employee = recorded.find(row => row.table === 'employees' && row.method === 'POST')!.body
    expect(employee).toMatchObject({ organization_id: 'org-1', full_name: 'Ольга Петрова', payment_type: 'SHIFT' })
    const rule = recorded.find(row => row.table === 'salary_rules')!.body
    expect(rule).toMatchObject({ employee_id: 'new-0', rate_kopecks: 200000, salary_rate_id: 'rate1' })
    const links = recorded.filter(row => row.table === 'employee_pickup_points' && row.method === 'POST').flatMap(row => row.body as unknown[])
    expect(links).toEqual([{ employee_id: 'new-0', pickup_point_id: 'p1' }])

    await page.getByRole('button', { name: 'Пригласить в приложение' }).click()
    await page.waitForURL('**/people/new-0/invite')
  })

  test('новая ставка — строка в истории с даты', async ({ page }) => {
    const recorded = await stubSupabase(page)
    await page.goto('/people/e1/rates')
    await page.waitForSelector('[data-screen]')
    await shot(page, 'rate-history')

    await page.getByRole('button', { name: 'Изменить ставку' }).click()
    const sheet = page.getByRole('dialog')
    await sheet.locator('input[inputmode="numeric"]').fill('2400')
    await sheet.getByRole('button', { name: 'Сохранить ставку' }).click()

    await expect.poll(() => recorded.filter(row => row.table === 'salary_rules').length).toBe(1)
    const rule = recorded.find(row => row.table === 'salary_rules')!.body as Record<string, unknown>
    expect(rule).toMatchObject({ employee_id: 'e1', rate_kopecks: 240000 })
    expect(String(rule.effective_from)).toMatch(/^\d{4}-\d{2}-01$/)
  })
})

test.describe('вход и регистрация', () => {
  test('без входа — экран входа на ките', async ({ page }) => {
    await stubSupabase(page, { signedIn: false })
    await page.goto('/home')
    await page.waitForURL('**/login')
    await expect(page.getByRole('button', { name: 'Зарегистрировать организацию' })).toBeVisible()
    await shot(page, 'login')

    await page.getByRole('button', { name: 'Забыли пароль?' }).click()
    await expect(page.getByText('Восстановление доступа')).toBeVisible()
  })

  test('после входа — новая оболочка; адреса старой панели ведут в новые разделы', async ({ page }) => {
    await stubSupabase(page, { signedIn: false })
    // Маршрут, заведённый позже, перехватывает раньше общего **/auth/v1/**.
    await page.route('**/auth/v1/token**', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'stub-access-token', refresh_token: 'stub-refresh-token', token_type: 'bearer',
        expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: 'user-1', aud: 'authenticated', role: 'authenticated', email: 'owner@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
      }),
    }))
    await page.goto('/login')
    await page.getByLabel('Почта').fill('owner@example.test')
    // Рядом с полем кнопка «Показать пароль» с тем же словом в подписи.
    await page.getByRole('textbox', { name: 'Пароль' }).fill('secret123')
    await page.getByRole('button', { name: 'Войти' }).click()
    await page.waitForURL('**/home')
    await expect(page.locator('[data-screen]')).toBeVisible()

    // Старая antd-панель удалена в фазе 9: закладки на её разделы открывают новые.
    await page.goto('/salary')
    await page.waitForURL('**/money?tab=pay')
    await page.goto('/shifts')
    await page.waitForURL('**/sched')
  })

  test('онбординг: организация и пункт одним RPC, затем сотрудник', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-09-18T10:00:00+03:00'))
    const recorded = await stubSupabase(page)
    // Пока организации нет, участия нет; после RPC — появляется, как в базе.
    let created = false
    await page.route('**/rest/v1/organization_members**', route => {
      const row = { organization_id: 'org-1', user_id: 'user-1', role: 'OWNER', employee_id: null }
      const single = route.request().headers()['accept']?.includes('vnd.pgrst.object')
      const body = created ? (single ? row : [row]) : (single ? null : [])
      return route.fulfill({ status: created || !single ? 200 : 406, contentType: 'application/json', body: JSON.stringify(body) })
    })
    await page.route('**/rest/v1/rpc/create_organization_with_owner', route => {
      created = true
      recorded.push({ method: 'POST', table: 'rpc/create_organization_with_owner', body: route.request().postDataJSON() })
      return route.fulfill({ status: 200, contentType: 'application/json', body: '"org-1"' })
    })

    await page.goto('/')
    await page.waitForURL('**/register')
    await expect(page.getByText('Шаг 1 из 3')).toBeVisible()
    await page.getByLabel('Название').fill('ИП Ковалёв А. С.')
    await shot(page, 'onboarding-1')
    await page.getByRole('button', { name: 'Далее' }).click()

    await page.getByLabel('Название пункта').fill('ПВЗ Ленина 12')
    await page.getByRole('button', { name: 'Далее' }).click()

    await page.getByLabel('ФИО').fill('Ирина Соколова')
    await shot(page, 'onboarding-3')
    await page.getByRole('button', { name: 'Готово' }).click()

    // Шага с шаблоном графика больше нет: после сотрудника — сразу в приложение, смен не ставим.
    await expect.poll(() => recorded.filter(row => row.table === 'employees').length).toBeGreaterThan(0)
    expect(recorded.find(row => row.table === 'rpc/create_organization_with_owner')!.body).toMatchObject({
      p_name: 'ИП Ковалёв А. С.', p_point_name: 'ПВЗ Ленина 12', p_point_address: 'ПВЗ Ленина 12',
    })
    expect(recorded.filter(row => row.table === 'shifts')).toHaveLength(0)
  })
})
