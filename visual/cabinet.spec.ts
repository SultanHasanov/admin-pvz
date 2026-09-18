import { expect, test, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { stubSupabase } from './stub'

/**
 * Кабинет сотрудника, приглашения и деление удержаний (фаза 6).
 *
 * Права в заглушке не проверяются — она отдаёт все строки. Поэтому здесь проверяется
 * то, что зависит от приложения: куда попадает сотрудник, что он видит про себя
 * и что уходит в базу. Права по ролям — отдельный набор `npm run db:rls` на живой базе.
 */

/** Снимок после загрузки шрифтов: иначе на картинке системные начертания и чужой вес. */
const shot = async (page:Page, name:string) => {
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: `visual/shots/app/${name}.png` })
}

/** Сегодня — 18 сентября: у Ирины (e1) в этот день смена на Ленина, план. */
async function pinToday(page:Page) {
  await page.clock.setFixedTime(new Date('2026-09-18T10:00:00+03:00'))
}

/** Вход сотрудником: участник организации с ролью EMPLOYEE и карточкой e1. */
async function signInAsEmployee(page:Page, employeeId = 'e1') {
  await page.route('**/rest/v1/organization_members**', route => {
    const row = { organization_id: 'org-1', user_id: 'user-1', role: 'EMPLOYEE', employee_id: employeeId }
    const single = route.request().headers()['accept']?.includes('vnd.pgrst.object')
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(single ? row : [row]) })
  })
}

test.describe('кабинет сотрудника', () => {
  test.beforeAll(async () => { await mkdir('visual/shots/app', { recursive: true }) })

  test('сотрудника уводит из экранов владельца в кабинет', async ({ page }) => {
    await pinToday(page)
    await stubSupabase(page)
    await signInAsEmployee(page)
    await page.goto('/home')
    await page.waitForURL('**/me')
    await page.waitForSelector('[data-screen]')

    await expect(page.getByText('Следующая смена')).toBeVisible()
    await expect(page.getByText('18 сент · сегодня')).toBeVisible()
    // Напарника на Ленина в этот день нет — очередь 2/2 ставит одного.
    await expect(page.getByText(/ПВЗ Ленина 12 · 09:00–21:00 · один на смене/)).toBeVisible()
    await shot(page, 'me-home')

    // «Люди» у сотрудника погашены: чужих карточек ему не видно.
    await expect(page.getByRole('button', { name: 'Люди' })).toBeDisabled()
  })

  test('смену начинает RPC, а не прямая правка', async ({ page }) => {
    await pinToday(page)
    const recorded = await stubSupabase(page)
    await signInAsEmployee(page)
    await page.goto('/me')
    await page.waitForSelector('[data-screen]')

    await page.getByRole('button', { name: 'Начать смену' }).click()
    await expect.poll(() => recorded.filter(row => row.table === 'rpc/employee_start_shift').length).toBe(1)
    const call = recorded.find(row => row.table === 'rpc/employee_start_shift')!.body as Record<string, unknown>
    expect(String(call.p_shift_id)).toMatch(/^s\d+$/)
    expect(recorded.filter(row => row.table === 'shifts')).toHaveLength(0)
  })

  test('мой график и мои деньги', async ({ page }) => {
    await pinToday(page)
    await stubSupabase(page)
    await signInAsEmployee(page)

    await page.goto('/me/sched')
    await page.waitForSelector('[data-screen]')
    await expect(page.getByText('Мои смены · сентябрь')).toBeVisible()
    await shot(page, 'me-sched')

    await page.goto('/me/money')
    await page.waitForSelector('[data-screen]')
    // Из разделённого удержания d5 на Ирине только её тысяча, а не все 2 400.
    await expect(page.getByText('Удержание WB · Пересорт при выдаче')).toBeVisible()
    await expect(page.getByText('−1 000 ₽')).toBeVisible()
    await expect(page.getByText('Аванс 15-го, остаток 5-го.', { exact: false })).toBeVisible()
    await shot(page, 'me-money')
  })

  test('«не согласен» уходит событием от имени сотрудника', async ({ page }) => {
    await pinToday(page)
    const recorded = await stubSupabase(page)
    await signInAsEmployee(page)
    await page.goto('/me/money/deductions')
    await page.waitForSelector('[data-screen]')
    await shot(page, 'me-deductions')

    await page.getByText('Пересорт при выдаче').click()
    const sheet = page.getByRole('dialog')
    await expect(sheet.getByText('Пересорт при выдаче · 1 000 ₽', { exact: false })).toBeVisible()
    await sheet.getByRole('textbox').fill('В этот день работал не я')
    await shot(page, 'sheet-disagree')
    await sheet.getByRole('button', { name: 'Отправить владельцу' }).click()

    await expect.poll(() => recorded.filter(row => row.table === 'wb_deduction_events').length).toBe(1)
    expect(recorded.find(row => row.table === 'wb_deduction_events')!.body).toMatchObject({
      deduction_id: 'd5', event_type: 'EMPLOYEE_DISAGREE', author_employee_id: 'e1', note: 'В этот день работал не я',
    })
  })
})

test.describe('приглашения и доли', () => {
  test('владелец видит код и перевыпускает его через RPC', async ({ page }) => {
    const recorded = await stubSupabase(page)
    await page.goto('/people/e2/invite')
    await page.waitForSelector('[data-screen]')

    await expect(page.getByText('KMR-7PX', { exact: true })).toBeVisible()
    await expect(page.getByText('отправлено')).toBeVisible()
    await shot(page, 'invite')

    await page.getByRole('button', { name: 'Выпустить новый код' }).click()
    await expect.poll(() => recorded.filter(row => row.table === 'rpc/create_employee_invitation').length).toBe(1)
    expect(recorded.find(row => row.table === 'rpc/create_employee_invitation')!.body).toEqual({ p_employee_id: 'e2' })
  })

  test('разделённое удержание: доли и остаток-убыток, запись через RPC', async ({ page }) => {
    const recorded = await stubSupabase(page)
    await page.goto('/money/ded/d5')
    await page.waitForSelector('[data-screen]')

    await expect(page.getByText('Кто платит')).toBeVisible()
    await expect(page.getByText('Убыток владельца')).toBeVisible()
    await expect(page.getByText('400 ₽', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Изменить доли сотрудников' }).click()
    const sheet = page.getByRole('dialog')
    // Камила платит 1 400 вместо 1 000 — убытка не остаётся.
    await sheet.getByLabel('Камила Юсупова').fill('1400')
    await shot(page, 'sheet-split')
    await sheet.getByRole('button', { name: 'Сохранить доли' }).click()

    await expect.poll(() => recorded.filter(row => row.table === 'rpc/set_deduction_parts').length).toBe(1)
    const body = recorded.find(row => row.table === 'rpc/set_deduction_parts')!.body as { p_deduction_id:string; p_parts:unknown[] }
    expect(body.p_deduction_id).toBe('d5')
    expect(body.p_parts).toEqual(expect.arrayContaining([
      { employeeId: 'e1', amountKopecks: 100000 },
      { employeeId: 'e7', amountKopecks: 140000 },
    ]))
    expect(body.p_parts).toHaveLength(2)
  })

  test('вход по ссылке: код из адреса, приём через RPC, дальше кабинет', async ({ page }) => {
    const recorded = await stubSupabase(page)
    await page.route('**/rest/v1/rpc/accept_employee_invitation', route => {
      recorded.push({ method: 'POST', table: 'rpc/accept_employee_invitation', body: route.request().postDataJSON() })
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ organizationId: 'org-1', employeeId: 'e2' }) })
    })

    // Код набран как попало — экран приводит его к виду ABC-D3F.
    await page.goto('/join/kmr7px')
    await expect(page.getByLabel('Код приглашения')).toHaveValue('KMR-7PX')
    await shot(page, 'join')

    await page.getByRole('button', { name: 'Присоединиться' }).click()
    await page.waitForURL('**/me')
    expect(recorded.find(row => row.table === 'rpc/accept_employee_invitation')!.body).toEqual({ p_code: 'KMR-7PX' })
  })

  test('неверный код — ответ базы, а не исключение, и он показан человеку', async ({ page }) => {
    await stubSupabase(page)
    await page.route('**/rest/v1/rpc/accept_employee_invitation', route => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ error: 'Код не найден или устарел' }),
    }))

    await page.goto('/join/ABC-D3F')
    await page.getByRole('button', { name: 'Присоединиться' }).click()
    await expect(page.getByText('Код не найден или устарел')).toBeVisible()
    await expect(page).toHaveURL(/\/join\//)
  })
})
