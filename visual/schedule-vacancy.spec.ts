import { expect, test } from '@playwright/test'
import { stubSupabase } from './stub'

test('пустой будущий день заметен в календаре ПВЗ', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-18T09:00:00+03:00'))
  await stubSupabase(page)
  await page.addInitScript(() => localStorage.setItem('pvz.point', 'p1'))
  await page.goto('/sched')

  await expect(page.getByRole('status')).toContainText('день без сотрудника')
  const empty = page.getByRole('button', { name: '19 сентября: НУЖЕН', exact: true })
  await expect(empty).toBeVisible()
  await page.screenshot({ path: 'visual/shots/app/sched-vacancy.png' })

  await page.getByRole('button', { name: 'Неделя', exact: true }).click()
  await expect(page.getByText('Нужен сотрудник')).toBeVisible()
  await page.screenshot({ path: 'visual/shots/app/sched-vacancy-week.png' })
})
