/** Российский номер в единый вид: что бы ни ввели — на выходе +7 (900) 000-00-00. */
export function formatPhone(value:string):string {
  let digits = value.replace(/\D/g, '')
  if (digits.startsWith('8')) digits = `7${digits.slice(1)}`
  if (digits && !digits.startsWith('7')) digits = `7${digits}`
  digits = digits.slice(0, 11)
  if (!digits) return ''
  const [, code = '', first = '', second = '', third = ''] = /^7(\d{0,3})(\d{0,3})(\d{0,2})(\d{0,2})$/.exec(digits) ?? []
  let result = '+7'
  if (code) result += ` (${code}`
  if (code.length === 3) result += ')'
  if (first) result += ` ${first}`
  if (second) result += `-${second}`
  if (third) result += `-${third}`
  return result
}

/** Telegram-логин всегда хранится с @, чтобы бот находил сотрудника по одному написанию. */
export function formatTelegram(value:string):string {
  const clean = value.replace(/[^A-Za-z0-9_]/g, '')
  return clean ? `@${clean}` : ''
}
