/**
 * Распаковка прототипа «Пункт - прототип приложения ПВЗ.html».
 *
 * Файл — это выгрузка одностраничного приложения: внутри манифест с gzip-ассетами
 * и экранированный HTML-шаблон. Читать его как есть невозможно, а сверяться с ним
 * нужно на каждом экране, поэтому распаковка вынесена в скрипт.
 *
 * Запуск: npm run proto
 * Результат (в .prototype/, не под git):
 *   proto.html      — отрендеренная разметка с инлайновыми стилями: источник истины по вёрстке
 *   proto-logic.js  — 1545 строк логики, состояния и сид-данных прототипа
 *   <id>.js/.woff2  — ассеты выгрузки (шрифты, рантайм)
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { join } from 'node:path'

const root = process.cwd()
const outDir = join(root, '.prototype')

const source = readdirSync(root).find(name => name.endsWith('.html') && name.includes('прототип'))
if (!source) {
  console.error('Не нашёл файл прототипа в корне проекта (*прототип*.html).')
  process.exit(1)
}

mkdirSync(outDir, { recursive: true })
const lines = readFileSync(join(root, source), 'utf8').split(/\r?\n/)

// Манифест и шаблон — это две очень длинные строки: JSON с ассетами и строка с HTML.
const manifestLine = lines.find(line => line.trim().startsWith('{"') && line.length > 100_000)
const templateLine = lines.find(line => line.trim().startsWith('"<!DOCTYPE html>'))

if (templateLine) {
  const html = JSON.parse(templateLine)
  writeFileSync(join(outDir, 'proto.html'), html)
  console.log(`proto.html — ${html.length} символов`)

  // Логика лежит в теге <script type="text/x-dc"> в HTML-экранированном виде.
  const script = /<script[^>]*type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1]
  if (script) {
    const code = script
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&')
    writeFileSync(join(outDir, 'proto-logic.js'), code)
    console.log(`proto-logic.js — ${code.split('\n').length} строк`)
  }
}

if (manifestLine) {
  const assets = JSON.parse(manifestLine)
  for (const [id, asset] of Object.entries(assets)) {
    const raw = Buffer.from(asset.data, 'base64')
    const data = asset.compressed ? gunzipSync(raw) : raw
    const extension = asset.mime.includes('javascript') ? 'js' : asset.mime.includes('woff2') ? 'woff2' : 'bin'
    writeFileSync(join(outDir, `${id.slice(0, 8)}.${extension}`), data)
  }
  console.log(`ассетов: ${Object.keys(assets).length}`)
}

console.log(`\nГотово: ${outDir}`)
