/**
 * Картинка с графиком для отправки сотрудникам.
 *
 * Рисуем на canvas вручную, а не снимаем DOM: html2canvas и родня тянут сотни килобайт
 * и всё равно врут с веб-шрифтами, а здесь нужен ровно список строк «дата — имя — время».
 * Плотность 2× — чтобы в мессенджере картинка не выглядела мыльной.
 */
export interface ShareRow { date:string; name:string; time:string; note?:string }

const SCALE = 2
const WIDTH = 720
const PADDING = 40
const ROW = 64

export function drawSchedule({ title, subtitle, rows, footer }:{
  title:string
  subtitle:string
  rows:ShareRow[]
  footer:string
}):HTMLCanvasElement {
  const height = PADDING * 2 + 120 + rows.length * ROW + 60
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH * SCALE
  canvas.height = height * SCALE
  const context = canvas.getContext('2d')!
  context.scale(SCALE, SCALE)

  const sans = (size:number, weight = '400') => `${weight} ${size}px 'IBM Plex Sans', system-ui, sans-serif`
  const mono = (size:number, weight = '500') => `${weight} ${size}px 'IBM Plex Mono', monospace`

  context.fillStyle = '#f4f1ee'
  context.fillRect(0, 0, WIDTH, height)

  // Шапка тёмной плашкой — как тёмная карточка в приложении.
  context.fillStyle = '#1b1614'
  context.beginPath()
  context.roundRect(PADDING, PADDING, WIDTH - PADDING * 2, 96, 20)
  context.fill()

  context.fillStyle = 'rgba(255,255,255,0.55)'
  context.font = mono(13, '600')
  context.fillText(subtitle.toUpperCase(), PADDING + 22, PADDING + 36)
  context.fillStyle = '#ffffff'
  context.font = sans(28, '600')
  context.fillText(title, PADDING + 22, PADDING + 72)

  let y = PADDING + 130
  for (const row of rows) {
    context.fillStyle = '#ffffff'
    context.beginPath()
    context.roundRect(PADDING, y, WIDTH - PADDING * 2, ROW - 8, 14)
    context.fill()

    context.fillStyle = '#8a807a'
    context.font = mono(14, '600')
    context.fillText(row.date, PADDING + 18, y + 34)

    context.fillStyle = '#1b1614'
    context.font = sans(18, '500')
    context.fillText(row.name, PADDING + 130, y + 34)

    context.fillStyle = row.note ? '#9a6b18' : '#6f665f'
    context.font = mono(15)
    const label = row.note ? `${row.time} · ${row.note}` : row.time
    context.fillText(label, WIDTH - PADDING - 18 - context.measureText(label).width, y + 34)

    y += ROW
  }

  context.fillStyle = '#8a807a'
  context.font = sans(14)
  context.fillText(footer, PADDING, y + 28)

  return canvas
}

/** Отдаём картинку системе: делимся файлом, а если нельзя — сохраняем. */
export async function shareSchedule(canvas:HTMLCanvasElement, fileName:string):Promise<'shared' | 'saved'> {
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('Не удалось собрать картинку')

  const file = new File([blob], fileName, { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: fileName })
    return 'shared'
  }

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
  return 'saved'
}
