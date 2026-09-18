// Склеивает supabase/migrations/*.sql в supabase/full_schema.sql — схема для чистой базы одним файлом.
// Запуск: npm run db:squash
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const dir = path.join(root, 'supabase', 'migrations')
const files = fs.readdirSync(dir).filter(name => name.endsWith('.sql')).sort()

const header = `-- ============================================================================
-- «Пункт»: вся схема базы одним файлом — миграции ${files[0].slice(0, 16)} … ${files.at(-1).slice(0, 16)} по порядку.
-- Собрано ${new Date().toISOString().slice(0, 10)} из supabase/migrations/ (${files.length} файлов). Источник правды —
-- по-прежнему папка migrations: правите там, этот файл пересобираете.
--
-- Для ПУСТОЙ базы Supabase (SQL Editor → вставить → Run). Всё в одной транзакции:
-- ошибка на любом шаге откатывает всё, база остаётся как была.
--
-- Снести текущую базу перед применением (выполнить ОТДЕЛЬНО, необратимо):
--
--   drop schema if exists public cascade;
--   create schema public;
--   grant usage on schema public to postgres, anon, authenticated, service_role;
--   alter default privileges in schema public grant all on tables    to postgres, anon, authenticated, service_role;
--   alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;
--   alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
--
-- Аккаунты (auth.users) это не трогает: люди смогут войти, но организаций у них не будет —
-- приложение отправит их на регистрацию. Удалить и аккаунты: Authentication → Users.
-- ============================================================================

begin;
`

let body = ''
for (const file of files) {
  let sql = fs.readFileSync(path.join(dir, file), 'utf8').replace(/^﻿/, '')
  // Своя транзакция внутри миграции разорвала бы общую — снимаем только верхнеуровневые begin;/commit;.
  sql = sql.split('\n').filter(line => !/^\s*(begin|commit)\s*;\s*$/i.test(line)).join('\n')
  body += `\n-- ────────────────────────────────────────────────────────────────────────────\n-- ${file}\n-- ────────────────────────────────────────────────────────────────────────────\n\n${sql.trim()}\n`
}

const out = path.join(root, 'supabase', 'full_schema.sql')
fs.writeFileSync(out, header + body + '\ncommit;\n')
console.log(out, files.length, 'files')
