# PVZ Control

Административная панель для владельцев ПВЗ: точки, сотрудники, смены, зарплаты и финансовый результат.

## Запуск

```bash
npm install
copy .env.example .env.local
npm run dev
```

Заполните `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY` значениями проекта Supabase. В клиенте используется только anon key; service role ключ не используется и не должен попадать в Vercel или браузер.

## База Supabase

Выполните SQL из `supabase/migrations/202609090001_initial_schema.sql` через Supabase CLI или SQL Editor. Миграция создаёт таблицы, ограничения связей, RLS и функцию `replace_shift` для атомарной замены сотрудника.

В Auth включите Email + Password и задайте Redirect URL для адреса приложения. Для файлов штрафов создайте приватный bucket `penalty-attachments` и добавьте Storage policies, проверяющие организацию владельца файла.

## Ручной учёт и Telegram

ПВЗ, сотрудники, график, доходы, расходы и удержания вводятся вручную и сохраняются в Supabase. Выполните также миграцию `202609090002_telegram_manual_entry.sql`, чтобы подключить Telegram-бота.

В Vercel добавьте серверные переменные `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN` и `TELEGRAM_WEBHOOK_SECRET`. Они не должны иметь префикс `VITE_` и не попадают в браузер.

После деплоя зарегистрируйте webhook у BotFather API:

```text
POST https://api.telegram.org/bot<BOT_TOKEN>/setWebhook
{
  "url": "https://<ваш-домен>/api/telegram/webhook",
  "secret_token": "<TELEGRAM_WEBHOOK_SECRET>",
  "allowed_updates": ["message"]
}
```

В разделе «Telegram» админки владелец создаёт одноразовый код, затем отправляет боту `/start КОД`. Бот предлагает кнопки добавления удержания или расхода, а также просмотра сотрудников и ближайших смен.

## Архитектура

- `src/app` — маршрутизация и каркас приложения.
- `src/pages` — экраны MVP.
- `src/entities` — типы и чистые расчёты.
- `src/lib` — клиент Supabase.
- `supabase/migrations` — PostgreSQL-схема и RLS.

В качестве временного набора для визуальной проверки интерфейс показывает демо-значения, когда Supabase не настроен. Бизнес-операции в production должны вызываться через сервисы Supabase; локальное хранилище не применяется.

## Проверки

```bash
npm run test
npm run build
```

Для Vercel добавьте те же `VITE_*` переменные окружения и используйте `npm run build`.
