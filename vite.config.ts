// defineConfig берём из vitest, чтобы в этом же файле жили настройки тестов.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // prompt, а не autoUpdate: новая версия не должна перезагрузить экран посреди
      // заполнения формы — человек сам жмёт «Обновить» (см. app/UpdatePrompt.tsx).
      registerType: 'prompt',
      injectRegister: false,
      // Манифест лежит в public/ и подключён в index.html — плагин его не генерирует.
      manifest: false,
      workbox: {
        navigateFallback: '/index.html',
        // Функции Vercel и файлы (robots.txt, sitemap.xml, welcome.html) — не страницы приложения:
        // иначе открытый в браузере robots.txt показывал бы приложение.
        navigateFallbackDenylist: [/^\/api\//, /\/[^/?]+\.[a-z0-9]+$/i],
        // Только woff2 и только нужные алфавиты: остальные начертания браузер докачает сам по unicode-range.
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}', '**/*-{latin,latin-ext,cyrillic,cyrillic-ext}-*.woff2'],
        runtimeCaching: [{
          // Данные — только из сети. Кэш с устаревшими сменами или суммами хуже, чем честная ошибка «нет сети».
          urlPattern: ({ url }) => url.hostname.endsWith('.supabase.co') || url.pathname.startsWith('/api/'),
          handler: 'NetworkOnly',
        }],
      },
    }),
  ],
  server: {
    host: '0.0.0.0',
    strictPort: true,
    port: 5173,
    open: true,
  },
  test: {
    // visual/ — это Playwright: снимки экранов запускаются своим раннером
    // (npx playwright test -c visual), а vitest считает чистый слой.
    exclude: ['node_modules/**', 'dist/**', 'visual/**'],
  },
})
