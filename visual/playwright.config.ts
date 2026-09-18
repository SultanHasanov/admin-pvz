import { defineConfig, devices } from '@playwright/test'

/**
 * Стенд визуальной проверки: снимки приложения на телефонном экране рядом со снимками
 * прототипа. Попиксельное равенство не цель — глаз ловит расхождения в отбивках и весе
 * шрифта быстрее любого diff, поэтому снимки складываются в один контактный лист.
 *
 * Запуск: npx playwright test -c visual
 * Лист:   node visual/contact-sheet.mjs
 */
export default defineConfig({
  testDir: '.',
  outputDir: './.artifacts',
  reporter: [['list']],
  // Снимки экранов зависят от шрифтов и анимаций — параллельность делает их нестабильными.
  workers: 1,
  use: {
    ...devices['iPhone 14'],
    // Тот же viewport, что у рамки прототипа: 390×846.
    viewport: { width: 390, height: 846 },
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    baseURL: 'http://localhost:5199',
  },
  webServer: {
    command: 'npx vite dev --port 5199 --strictPort',
    url: 'http://localhost:5199/kit',
    reuseExistingServer: true,
    cwd: '..',
    timeout: 120_000,
  },
})
