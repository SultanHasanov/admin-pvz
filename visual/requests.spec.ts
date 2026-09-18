import { expect, test, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { stubSupabase } from './stub'

/**
 * Заявки, отпуска и лента уведомлений (фаза 5).
 *
 * Как и write.spec, проверяет не вёрстку, а то, что ушло в базу: решение по заявке —
 * это вызов RPC с правильным статусом, отпуск — строка с правильными датами и типом.
 * Попутно снимает шторки для контактного листа.
 */

/** Снимок после загрузки шрифтов: иначе на картинке системные начертания и чужой вес. */
const shot = async (page:Page, name:string) => {
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: `visual/shots/app/${name}.png` })
}

/** Шторки, у которых ещё нет кнопок (кабинет сотрудника — фаза 6), открываем dev-ручкой из Shell. */
async function openSheet(page:Page, type:string, props:Record<string, unknown> = {}) {
  await page.waitForFunction(() => '__openSheet' in window)
  await page.evaluate(([sheet, args]) => {
    (window as unknown as { __openSheet:(type:string, props:unknown) => void }).__openSheet(sheet as string, args)
  }, [type, props] as const)
}

/** Вход сотрудником: участник организации с привязанной карточкой e6. */
async function signInAsEmployee(page:Page) {
  await page.route('**/rest/v1/organization_members**', route => {
    const row = { organization_id: 'org-1', user_id: 'user-1', role: 'EMPLOYEE', employee_id: 'e6' }
    const single = route.request().headers()['accept']?.includes('vnd.pgrst.object')
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(single ? row : [row]) })
  })
}

test.describe('заявки и отпуска', () => {
  test.beforeAll(async () => { await mkdir('visual/shots/app', { recursive: true }) })

  test('колокольчик показывает заявку и гасит бейдж', async ({ page }) => {
    const recorded = await stubSupabase(page)
    await page.goto('/home')
    await page.waitForSelector('[data-screen]')

    const bell = page.getByRole('button', { name: 'Уведомления' })
    // Всё непрочитано: бейдж есть.
    await expect(bell).not.toHaveText('')

    await bell.click()
    const sheet = page.getByRole('dialog')
    await expect(sheet.getByText('Сергей Белов не сможет выйти 24 сент')).toBeVisible()
    await expect(sheet.getByText('Причина: Болезнь · нужно решение')).toBeVisible()
    await shot(page, 'sheet-notifs')

    // Открытие ленты — одна пачка отметок, и в ней есть заявка.
    await expect.poll(() => recorded.filter(row => row.table === 'notification_reads').length).toBe(1)
    const reads = recorded.find(row => row.table === 'notification_reads')!.body as Record<string, unknown>[]
    expect(reads).toContainEqual(expect.objectContaining({ kind: 'request', ref_id: 'q1', user_id: 'user-1' }))
    // Дырка отмечается синтетическим ключом «точка|день», как записано в миграции 0017.
    expect(reads.some(read => read.kind === 'hole' && /^p\d\|\d{4}-\d{2}-\d{2}$/.test(String(read.ref_id)))).toBe(true)
  })

  test('отказ по заявке — RPC со статусом DECLINED', async ({ page }) => {
    const recorded = await stubSupabase(page)
    await page.goto('/home')
    await page.waitForSelector('[data-screen]')

    await page.getByRole('button', { name: 'Уведомления' }).click()
    await page.getByRole('dialog').getByText('Сергей Белов не сможет выйти 24 сент').click()

    const sheet = page.getByRole('dialog')
    await expect(sheet.getByText('Назначить замену')).toBeVisible()
    // Смена — не отпуск: подтверждать нечего.
    await expect(sheet.getByText('Подтвердить отпуск')).toHaveCount(0)
    // На Садовой одно место на смене: «оставить одного» здесь значило бы закрыть точку.
    await expect(sheet.getByText('Оставить одного, без замены')).toHaveCount(0)
    await shot(page, 'sheet-req')

    await sheet.getByText('Отказать').click()
    await expect.poll(() => recorded.filter(row => row.table === 'rpc/resolve_shift_request').length).toBe(1)
    expect(recorded.find(row => row.table === 'rpc/resolve_shift_request')!.body).toEqual({
      p_request_id: 'q1', p_status: 'DECLINED', p_substitute: null, p_comment: null,
    })
  })

  test('замена по заявке — RPC со статусом SUBSTITUTE_FOUND и выбранным человеком', async ({ page }) => {
    const recorded = await stubSupabase(page)
    await page.goto('/home')
    await page.waitForSelector('[data-screen]')

    await page.getByRole('button', { name: 'Уведомления' }).click()
    await page.getByRole('dialog').getByText('Сергей Белов не сможет выйти 24 сент').click()
    await page.getByRole('dialog').getByText('Назначить замену').click()

    const sheet = page.getByRole('dialog')
    await expect(sheet.getByText('Кто выйдет вместо?')).toBeVisible()
    await shot(page, 'sheet-req-substitute')

    await sheet.getByText('Ольга Панина').click()
    await expect.poll(() => recorded.filter(row => row.table === 'rpc/resolve_shift_request').length).toBe(1)
    expect(recorded.find(row => row.table === 'rpc/resolve_shift_request')!.body).toEqual({
      p_request_id: 'q1', p_status: 'SUBSTITUTE_FOUND', p_substitute: 'e5', p_comment: null,
    })
    // Смены переписывает RPC — сам браузер в shifts ничего не пишет.
    expect(recorded.filter(row => row.table === 'shifts')).toHaveLength(0)
  })

  test('владелец отмечает больничный из карточки сотрудника', async ({ page }) => {
    const recorded = await stubSupabase(page)
    await page.goto('/people/e3')
    await page.waitForSelector('[data-screen]')

    // Отпуск Алины из фикстур виден в карточке ещё до того, как он начался.
    await expect(page.getByText('Отпуск 20 сент – 27 сент')).toBeVisible()
    await page.getByText('Отпуск или больничный').click()

    const sheet = page.getByRole('dialog')
    await sheet.getByRole('button', { name: 'Больничный', exact: true }).click()
    await shot(page, 'sheet-vacation')
    await sheet.getByRole('button', { name: 'Сохранить' }).click()

    await expect.poll(() => recorded.filter(row => row.table === 'vacations').length).toBe(1)
    const vacation = recorded.find(row => row.table === 'vacations')!.body as Record<string, unknown>
    expect(vacation).toMatchObject({ employee_id: 'e3', kind: 'SICK', organization_id: 'org-1' })
    expect(String(vacation.date_to) >= String(vacation.date_from)).toBe(true)
  })

  test('отпуск в сетке месяца — синий день «отп»', async ({ page }) => {
    await stubSupabase(page)
    // Сетка месяца строится только на одной точке; Алина в отпуске на p2.
    await page.addInitScript(() => localStorage.setItem('pvz.point', 'p2'))
    await page.goto('/sched')
    await page.waitForSelector('[data-screen]')

    // С 20 по 27 сентября по очереди 2/2 Алина стоит 21, 22, 25 и 26-го.
    await expect(page.getByText('отп', { exact: true })).toHaveCount(4)
    await shot(page, 'sched-vacation')
  })

  test('сотрудник сообщает, что не выйдет', async ({ page }) => {
    const recorded = await stubSupabase(page)
    await signInAsEmployee(page)
    await page.goto('/home')
    await page.waitForSelector('[data-screen]')

    await openSheet(page, 'cantWork', { date: '2026-09-24', pointId: 'p3' })
    const sheet = page.getByRole('dialog')
    await expect(sheet.getByText('Смена: 24 сент · ПВЗ Садовая 30')).toBeVisible()
    await shot(page, 'sheet-cant-work')

    await sheet.getByRole('button', { name: 'Учёба' }).click()
    await sheet.getByRole('button', { name: 'Сообщить владельцу' }).click()

    await expect.poll(() => recorded.filter(row => row.table === 'shift_requests').length).toBe(1)
    expect(recorded.find(row => row.table === 'shift_requests')!.body).toMatchObject({
      employee_id: 'e6', pickup_point_id: 'p3', kind: 'SHIFT',
      date_from: '2026-09-24', date_to: '2026-09-24', reason: 'Учёба', status: 'SENT',
    })
  })

  test('сотрудник просит больничный', async ({ page }) => {
    const recorded = await stubSupabase(page)
    await signInAsEmployee(page)
    await page.goto('/home')
    await page.waitForSelector('[data-screen]')

    await openSheet(page, 'reqVac')
    const sheet = page.getByRole('dialog')
    await sheet.getByRole('button', { name: 'Больничный' }).click()
    await shot(page, 'sheet-req-vac')
    await sheet.getByRole('button', { name: 'Отправить запрос' }).click()

    await expect.poll(() => recorded.filter(row => row.table === 'shift_requests').length).toBe(1)
    const request = recorded.find(row => row.table === 'shift_requests')!.body as Record<string, unknown>
    expect(request).toMatchObject({ employee_id: 'e6', kind: 'SICK', reason: 'Больничный', status: 'SENT' })
    // Отпуск по умолчанию — неделя с 20-го следующего месяца.
    expect(String(request.date_from).slice(8)).toBe('20')
  })
})
