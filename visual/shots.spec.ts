import { test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { screens } from './screens'
import { stubSupabase } from './stub'

/**
 * Снимает экраны приложения на телефонном экране. Данные подставляются фикстурами,
 * поэтому картинки одинаковы от прогона к прогону и сравнимы с прототипом.
 * Список экранов ведётся в screens.ts.
 */
test.describe('снимки приложения', () => {
  test.beforeAll(async () => { await mkdir('visual/shots/app', { recursive: true }) })

  for (const screen of screens) {
    test(screen.name, async ({ page }) => {
      const problems:string[] = []
      page.on('pageerror', error => problems.push(error.message))

      if (!screen.standalone) await stubSupabase(page)
      await page.goto(screen.path)
      await page.waitForSelector('[data-screen]', { timeout: 15_000 })
      if (screen.click) await page.click(screen.click)
      // Ждём шрифты: без них кегли и отбивки на снимке чужие.
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(400)
      await page.screenshot({ path: `visual/shots/app/${screen.name}.png`, fullPage: false })

      // Пустой экран из-за упавшего запроса выглядит на снимке как «пока ничего нет»,
      // поэтому ошибки в консоли считаем провалом теста.
      if (problems.length) throw new Error(`Ошибки на странице: ${problems.join('; ')}`)
    })
  }
})
