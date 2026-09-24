import { expect, test } from '@playwright/test'
import { stubSupabase } from './stub'

test('две пары, правка дня и повторение недели с подтверждением', async ({ page }) => {
  const recorded = await stubSupabase(page)
  await page.goto('/sched/build')
  await expect(page.getByText('Шаг 1 из 3')).toBeVisible()
  await page.getByRole('button', { name: 'Двое', exact: true }).click()
  const teamA = page.getByRole('group', { name: 'Первая пара' })
  const teamB = page.getByRole('group', { name: 'Вторая пара' })
  await teamA.getByRole('checkbox', { name: 'Ирина Соколова' }).check()
  await teamA.getByRole('checkbox', { name: 'Дмитрий Орлов' }).check()
  await teamB.getByRole('checkbox', { name: 'Камила Юсупова' }).check()
  await expect(teamA).toContainText('выбрано 2 из 2')
  await expect(teamB).toContainText('выбрано 1 из 2')
  await expect(teamA.getByRole('checkbox', { name: 'Камила Юсупова' })).toBeDisabled()
  // Перенос между парами: Ирина уходит во вторую пару и возвращается.
  await teamB.getByRole('checkbox', { name: 'Ирина Соколова' }).check()
  await expect(teamA).toContainText('выбрано 1 из 2')
  await teamA.getByRole('checkbox', { name: 'Ирина Соколова' }).check()
  await expect(teamA).toContainText('выбрано 2 из 2')
  await expect(teamB).toContainText('выбрано 1 из 2')
  // Незаполненную пару дальше не пускаем и показываем, что осталось.
  await page.getByRole('button', { name: 'Показать неделю' }).click()
  await expect(page.getByText('Шаг 1 из 3')).toBeVisible()
  await expect(teamB).toContainText('Отметьте ещё 1, без этого график не построить.')
  await page.screenshot({ path: 'visual/shots/app/guide-missing.png' })
  // Четвёртого менеджера на точке нет — добавляем, не выходя из мастера.
  await page.getByRole('button', { name: '+ Добавить сотрудника' }).click()
  await page.getByLabel('ФИО').fill('Олег Тестов')
  await page.getByLabel('Ставка за смену').fill('2000')
  await page.getByRole('button', { name: 'Добавить и поставить в график' }).click()
  await expect(teamB).toContainText('выбрано 2 из 2')
  await expect(teamB).not.toContainText('без этого график не построить')
  await page.getByRole('button', { name: 'Каждому ½ смены' }).click()
  // Первая пара начинает свой первый день 28 сентября.
  await page.getByRole('button', { name: /сент, / }).click()
  await page.getByRole('button', { name: /^28 сентября/ }).click()
  await page.getByRole('button', { name: 'Показать неделю' }).click()

  await expect(page.getByText('Шаг 2 из 3')).toBeVisible()
  await page.screenshot({ path: 'visual/shots/app/guide-week.png' })
  await page.getByRole('button', { name: /сб 3/ }).click()
  await page.getByRole('button', { name: 'Один', exact: true }).click()
  await expect(page.getByText('Исправлено дней: 1')).toBeVisible()
  await page.getByRole('button', { name: 'Выбрать недели' }).click()

  await expect(page.getByText('Шаг 3 из 3')).toBeVisible()
  // Сентябрь до 28-го не трогаем: весь месяц — это октябрь без недели-образца.
  await page.getByRole('button', { name: '›', exact: true }).click()
  await page.getByRole('button', { name: /Заполнить весь/ }).click()
  await expect(page.getByText('Выбрано недель: 4')).toBeVisible()
  await page.screenshot({ path: 'visual/shots/app/guide-repeat.png' })
  await page.getByRole('button', { name: /Сохранить \d+ смен/ }).click()
  await expect(page.getByText(/Новых смен:/)).toBeVisible()
  await page.getByRole('button', { name: 'Сохранить график' }).click()

  await expect.poll(() => recorded.some(call => call.table === 'pickup_points' && call.method === 'PATCH')).toBe(true)
  const config = recorded.find(call => call.table === 'pickup_points' && call.method === 'PATCH')?.body as { slot_config?:{ def:number; dates:Record<string, number> } }
  expect(config.slot_config?.def).toBe(2)
  // Правка субботы повторилась в следующих неделях; дни раньше 28 сентября не тронуты.
  expect(config.slot_config?.dates['2026-10-03']).toBe(1)
  expect(config.slot_config?.dates['2026-10-10']).toBe(1)
  expect(config.slot_config?.dates['2026-09-26']).toBeUndefined()
})

test('один менеджер: первый и второй сотрудник, выбор заменяется', async ({ page }) => {
  await stubSupabase(page)
  await page.goto('/sched/build')
  await page.getByRole('button', { name: 'Один', exact: true }).click()
  // Выбор ПВЗ — шторкой, а не рядом чипов.
  await page.getByRole('button', { name: 'Выбрать ПВЗ' }).click()
  await page.getByRole('button', { name: /Мира 5/ }).click()
  await page.getByRole('button', { name: 'Выбрать ПВЗ' }).click()
  await page.getByRole('button', { name: /Ленина 12/ }).click()
  const first = page.getByRole('group', { name: 'Первый сотрудник' })
  const second = page.getByRole('group', { name: 'Второй сотрудник' })
  await first.getByRole('radio', { name: 'Ирина Соколова' }).check()
  await first.getByRole('radio', { name: 'Дмитрий Орлов' }).check()
  await expect(first.getByRole('radio', { name: 'Ирина Соколова' })).not.toBeChecked()
  await second.getByRole('radio', { name: 'Камила Юсупова' }).check()
  // Второй становится первым: сотрудники меняются местами.
  await first.getByRole('radio', { name: 'Камила Юсупова' }).check()
  await expect(second.getByRole('radio', { name: 'Дмитрий Орлов' })).toBeChecked()
  await first.getByRole('radio', { name: 'Дмитрий Орлов' }).check()
  await expect(second.getByRole('radio', { name: 'Камила Юсупова' })).toBeChecked()
  await expect(page.getByLabel('Кто работает на неделе')).toContainText('Дмитрий')
  await expect(page.getByLabel('Кто работает на неделе')).toContainText('Камила')
  await page.getByLabel('Кто работает на неделе').scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'visual/shots/app/guide-single.png' })
})

test('перенос из тетради: сегодня у первого 2-й день, дальше два дня второй', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-24T10:00:00+03:00'))
  await stubSupabase(page)
  await page.goto('/sched/build')
  await page.getByRole('button', { name: 'Один', exact: true }).click()
  await page.getByRole('group', { name: 'Первый сотрудник' }).getByRole('radio', { name: 'Дмитрий Орлов' }).check()
  await page.getByRole('group', { name: 'Второй сотрудник' }).getByRole('radio', { name: 'Камила Юсупова' }).check()

  // Четверг, 24-е: работает Дмитрий, и это его второй день подряд.
  await page.getByRole('button', { name: 'Дмитрий', exact: true }).click()
  await page.getByRole('button', { name: '2-й', exact: true }).click()
  const strip = page.getByLabel('Кто работает на неделе')
  await expect(strip.getByRole('button', { name: 'чт 24: Дмитрий' })).toBeVisible()
  await expect(strip.getByRole('button', { name: 'пт 25: Камила' })).toBeVisible()
  await expect(strip.getByRole('button', { name: 'сб 26: Камила' })).toBeVisible()
  await expect(strip.getByRole('button', { name: 'вс 27: Дмитрий' })).toBeVisible()
  await expect(page.getByText(/чт 24 — Дмитрий \(2-й день\) · пт 25–сб 26 — Камила/)).toBeVisible()
  await strip.scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'visual/shots/app/guide-from-notebook.png' })

  // Нажатие на день в полоске подставляет ответы из очереди.
  await strip.getByRole('button', { name: 'сб 26: Камила' }).click()
  await expect(page.getByRole('button', { name: 'Камила', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: '2-й', exact: true })).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('button', { name: 'Показать неделю' }).click()
  await expect(page.getByText('Не заполняем — раньше выбранного дня')).toHaveCount(5)
})
