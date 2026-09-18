/**
 * Синтаксическая проверка миграций настоящим парсером PostgreSQL (libpg-query).
 * Базы не требует, поэтому запускается где угодно: ловит опечатки до того, как они
 * дойдут до `supabase db reset` или SQL-редактора.
 *
 * Запуск: npm run db:check
 */
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parse } from 'pgsql-parser'

const migrations = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations')
let failed = 0

for (const file of readdirSync(migrations).filter(name => name.endsWith('.sql')).sort()) {
  const sql = readFileSync(join(migrations, file), 'utf8')
  try {
    const result = await parse(sql)
    console.log(`ok    ${file} — ${result.stmts.length} инструкций`)
  } catch (error) {
    failed += 1
    console.error(`ОШИБКА ${file}\n       ${String(error.message).split('\n')[0]}`)
  }
}

if (failed) {
  console.error(`\nНе разобрано файлов: ${failed}`)
  process.exit(1)
}
console.log('\nВсе миграции разбираются парсером PostgreSQL.')
