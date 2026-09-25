import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { chromium } from '@playwright/test'

const root = resolve(import.meta.dirname, '..')
const source = join(root, 'assets', 'illustrations-source')
const output = join(root, 'public', 'illustrations')
const names = ['pickup-point', 'team', 'schedule', 'finance', 'setup-complete']

await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()

try {
  for (const name of names) {
    const bytes = await readFile(join(source, `${name}.png`))
    const dataUrl = `data:image/png;base64,${bytes.toString('base64')}`
    const results = await page.evaluate(async ({ dataUrl }) => {
      const image = new Image()
      image.src = dataUrl
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = 512
      canvas.height = 512
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Canvas 2D is unavailable')
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      context.drawImage(image, 0, 0, 512, 512)
      return {
        png: canvas.toDataURL('image/png').split(',')[1],
        webp: canvas.toDataURL('image/webp', .84).split(',')[1],
      }
    }, { dataUrl })
    await writeFile(join(output, `${name}-512.png`), Buffer.from(results.png, 'base64'))
    await writeFile(join(output, `${name}-512.webp`), Buffer.from(results.webp, 'base64'))
    process.stdout.write(`optimized ${basename(name)}\n`)
  }
} finally {
  await browser.close()
}
