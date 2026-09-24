import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { stubSupabase } from './stub'

/**
 * Проверка записи: заполняем форму в шторке и смотрим, что ушло в базу.
 *
 * Снимок показал бы только вёрстку, а здесь важно другое — что суммы в копейках,
 * категория обрезана, дата та, что выбрана, и что «выплатить всем» пишет по строке
 * на каждого сотрудника, а не одну общую.
 */
test.describe('запись из шторок', () => {
  test.beforeAll(async () => { await mkdir('visual/shots/app', { recursive: true }) })

  test('расход уходит в копейках и с категорией', async ({ page }) => {
    const recorded = await stubSupabase(page)
    await page.goto('/money?tab=fin')
    await page.waitForSelector('[data-screen]')

    await page.getByRole('button', { name: 'Добавить' }).click()
    await page.getByText('Добавить расход').click()

    await page.getByRole('button', { name: 'Аренда', exact: true }).click()
    await page.locator('input[inputmode="numeric"]').fill('45000')
    await page.screenshot({ path: 'visual/shots/app/sheet-op.png' })

    await page.getByRole('button', { name: 'Добавить расход' }).click()
    await expect.poll(() => recorded.filter(row => row.table === 'expense_entries').length).toBe(1)

    const entry = recorded.find(row => row.table === 'expense_entries')!.body as Record<string, unknown>
    expect(entry.amount_kopecks).toBe(4_500_000)
    expect(entry.pickup_point_id).toBeTruthy()
    // Категория расхода приходит ссылкой на справочник, а не текстом.
    expect(entry.category_id).toBeTruthy()
  })

  test('аванс всем пишет по строке на сотрудника', async ({ page }) => {
    const recorded = await stubSupabase(page)
    await page.goto('/money?tab=pay')
    await page.waitForSelector('[data-screen]')

    await page.getByRole('button', { name: 'Аванс', exact: true }).click()
    await page.waitForSelector('text=Итого')
    await page.screenshot({ path: 'visual/shots/app/sheet-pay-all.png' })

    // Одного пропускаем: список в шторке — это выбор, а не приговор.
    // Ищем внутри шторки: то же имя есть в ведомости на экране под ней.
    const sheet = page.getByRole('dialog')
    await sheet.getByText('Сергей Белов').click()
    await sheet.getByRole('button', { name: /Выдать аванс/ }).click()

    // Шесть сотрудников, но платим четырём: Ирине аванс уже выдан (10 000 больше половины
    // начисленного), Сергея пропустили руками. Это и есть проверка расчёта аванса.
    await expect.poll(() => recorded.filter(row => row.table === 'salary_payments').length).toBe(4)

    const payments = recorded.filter(row => row.table === 'salary_payments').map(row => row.body as Record<string, unknown>)
    for (const payment of payments) {
      expect(payment.kind).toBe('ADVANCE')
      expect(payment.accrual_month).toBe('2026-09-01')
      expect(Number(payment.amount_kopecks)).toBeGreaterThan(0)
    }
    // Ольге доплачиваем только разницу: 20 700 / 2 − 8 000 уже выданных.
    expect(payments.map(payment => payment.amount_kopecks)).toContain(235_000)
  })

  test('мастер графика ставит по два человека в день и пишет места', async ({ page }) => {
    // В сентябре первое место на Ленина 12 уже занято сменами фикстур, и мастер его
    // не перезаписывает. «4 недели» от 18-го захватывают пустой октябрь.
    await page.clock.setFixedTime(new Date('2026-09-18T10:00:00+03:00'))
    const recorded = await stubSupabase(page)
    await page.goto('/sched/wizard')
    await page.waitForSelector('[data-screen]')

    // Два места на смене — значит два независимых правила с собственными очередями.
    await page.getByRole('button', { name: 'Увеличить' }).first().click()
    await page.getByRole('button', { name: 'Место 1' }).click()
    await page.getByText('Ирина Соколова').click()
    await page.getByText('Дмитрий Орлов').click()

    await page.getByRole('button', { name: 'Место 2' }).click()
    await page.getByText('Камила Юсупова').click()

    await page.getByRole('button', { name: '4 недели' }).click()
    await page.screenshot({ path: 'visual/shots/app/wizard-filled.png' })

    await page.getByRole('button', { name: /Поставить \d+ смен/ }).click()
    await expect.poll(() => recorded.filter(row => row.table === 'shifts').length).toBeGreaterThan(0)

    const inserted = recorded
      .filter(row => row.table === 'shifts')
      .flatMap(row => Array.isArray(row.body) ? row.body : [row.body]) as Record<string, unknown>[]

    // Первое место занимает очередь из двоих, второе — третий сотрудник.
    expect(new Set(inserted.map(shift => shift.slot_index))).toEqual(new Set([0, 1]))
    const second = inserted.filter(shift => shift.slot_index === 1)
    expect(new Set(second.map(shift => shift.employee_id))).toEqual(new Set(['e7']))

    // Число мест — настройка точки, иначе дырки в графике считать не от чего.
    const config = recorded.find(row => row.table === 'pickup_points')
    expect((config?.body as Record<string, unknown>)?.slot_config).toEqual({ def: 2 })
  })

  test('смена ставится на выбранный день', async ({ page }) => {
    // Неделя 14–20 сентября: на Ленина 12 пусто 19-е.
    await page.clock.setFixedTime(new Date('2026-09-18T10:00:00+03:00'))
    const recorded = await stubSupabase(page)
    await page.goto('/sched')
    await page.waitForSelector('[data-screen]')

    // В матрице «Все ПВЗ» пустая клетка подписана «нет» — открываем именно её.
    await page.getByRole('button', { name: 'нет' }).first().click()
    await page.waitForSelector('text=Смена не занята')
    await page.screenshot({ path: 'visual/shots/app/sheet-day.png' })

    await page.getByRole('button', { name: 'Добавить сотрудника' }).click()
    await page.screenshot({ path: 'visual/shots/app/sheet-candidate.png' })

    // Имя есть и в легенде под сеткой — кликаем именно в шторке.
    await page.getByRole('dialog').getByText('Дмитрий Орлов').click()
    await expect.poll(() => recorded.filter(row => row.table === 'shifts').length).toBe(1)

    const shift = recorded.find(row => row.table === 'shifts')!.body as Record<string, unknown>
    expect(String(shift.planned_start)).toContain('2026-09-19')
    expect(shift.pay_mode).toBe('FULL')
  })
})
