import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import { MONTH, tables } from './fixtures'

/**
 * Подменяет Supabase фикстурами: сессия кладётся в localStorage, запросы к PostgREST
 * перехватываются и отвечают из fixtures.ts.
 *
 * Иначе снимки экранов показывали бы форму входа, а с живой базой менялись бы от прогона
 * к прогону. Сравнение с прототипом требует одних и тех же данных.
 */

/** Ключ сессии supabase-js собран из ссылки проекта: sb-<ref>-auth-token. */
function projectRef() {
  const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  const url = /VITE_SUPABASE_URL=(\S+)/.exec(env)?.[1] ?? ''
  return /https:\/\/([^.]+)\./.exec(url)?.[1] ?? 'local'
}

export interface Recorded { method:string; table:string; body:unknown }

/**
 * `signedIn: false` — без сессии: для экранов входа, регистрации и восстановления.
 * `point` — выбранный ПВЗ; по умолчанию «Все ПВЗ» (пустая строка), как у нового пользователя.
 */
export async function stubSupabase(page:Page, { signedIn = true, point = '' }:{ signedIn?:boolean; point?:string } = {}) {
  const ref = projectRef()
  /** Записанные запросы: по ним проверяем, что форма отправила именно то, что показала. */
  const recorded:Recorded[] = []

  await page.addInitScript(({ key, month, signedIn, point }) => {
    const session = {
      access_token: 'stub-access-token',
      refresh_token: 'stub-refresh-token',
      token_type: 'bearer',
      expires_in: 3600,
      // Секунды, а не миллисекунды: supabase-js сам считает срок годности.
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'user-1', aud: 'authenticated', role: 'authenticated', email: 'owner@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }
    if (signedIn) localStorage.setItem(key, JSON.stringify(session))
    // Экраны берут месяц и ПВЗ из localStorage — фиксируем, чтобы снимки не зависели от даты.
    localStorage.setItem('pvz.month', month)
    // ПВЗ — только при первом заходе: перезагрузка должна видеть то, что сохранило приложение.
    if (localStorage.getItem('pvz.point') === null) localStorage.setItem('pvz.point', point)
  }, { key: `sb-${ref}-auth-token`, month: MONTH, signedIn, point })

  await page.route('**/auth/v1/**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: 'user-1', aud: 'authenticated', role: 'authenticated', email: 'owner@example.test' }),
  }))

  await page.route('**/rest/v1/**', route => {
    const request = route.request()
    const url = new URL(request.url())
    // /rest/v1/<таблица или rpc>
    const path = url.pathname.replace('/rest/v1/', '')

    if (request.method() !== 'GET') {
      let body:unknown = null
      try { body = request.postDataJSON() } catch { body = request.postData() }
      recorded.push({ method: request.method(), table: path, body })
      // Записи отвечаем эхом: сервисы часто просят `.select().single()` после вставки.
      const rows = (Array.isArray(body) ? body : [body]).map((row, index) => ({ id: `new-${index}`, ...(row as object) }))
      // `.single()` просит объект, как и настоящий PostgREST: иначе `data.id` у вставки пустой.
      const single = request.headers()['accept']?.includes('vnd.pgrst.object')
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(single ? rows[0] : rows),
      })
    }

    if (path.startsWith('rpc/')) return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' })

    const rows = filter(tables[path] ?? [], url.searchParams)
    const single = route.request().headers()['accept']?.includes('vnd.pgrst.object')
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(single ? rows[0] ?? null : rows),
    })
  })

  return recorded
}

/**
 * Минимальный разбор фильтров PostgREST: eq, in, gte, lt, is и limit.
 *
 * Без него заглушка отдавала бы все строки таблицы, и на снимке оказывались бы, например,
 * закрытые удержания в блоке «требуют внимания» — то есть картинка врала бы про поведение.
 */
function filter(rows:unknown[], params:URLSearchParams) {
  const limit = Number(params.get('limit') ?? 0)
  const result = rows.filter(row => {
    const record = row as Record<string, unknown>
    for (const [column, expression] of params) {
      if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(column)) continue
      const [operator, ...rest] = expression.split('.')
      const value = rest.join('.')
      const actual = record[column]
      if (operator === 'eq' && String(actual) !== value) return false
      if (operator === 'neq' && String(actual) === value) return false
      if (operator === 'gte' && !(String(actual) >= value)) return false
      if (operator === 'gt' && !(String(actual) > value)) return false
      if (operator === 'lte' && !(String(actual) <= value)) return false
      if (operator === 'lt' && !(String(actual) < value)) return false
      if (operator === 'is') {
        const isNull = actual === null || actual === undefined
        if ((value === 'null') !== isNull) return false
      }
      if (operator === 'in') {
        const allowed = value.replace(/^\(|\)$/g, '').split(',').map(item => item.replace(/^"|"$/g, ''))
        if (!allowed.includes(String(actual))) return false
      }
    }
    return true
  })
  return limit ? result.slice(0, limit) : result
}
