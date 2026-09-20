/**
 * Тексты и расписание напоминаний бота.
 *
 * Здесь нет обращений к Telegram и нет HTTP: только «какие данные нужны», «пора ли слать»
 * и «что написать». Так один и тот же текст уходит и по расписанию из cron, и по кнопке
 * «Отправить пробное» из приложения, и не расходится между ними.
 *
 * Время напоминания владелец задаёт местным временем точки, поэтому все даты считаются
 * в часовом поясе ПВЗ, а не в поясе сервера: на Vercel это UTC, и без пересчёта утреннее
 * напоминание уходило бы ночью.
 */
import { db } from './_telegram.js'

/** Смены в этих статусах занимают место на смене. Совпадает с findHoles в приложении. */
const ACTIVE_SHIFT_STATUSES = ['PLANNED', 'ON_DUTY', 'COMPLETED']

export const REMINDER_KINDS = ['duty_today', 'duty_tomorrow', 'gaps', 'week', 'money']

// ── Время и даты в поясе точки ──────────────────────────────────────────────

const dateFormatters = new Map()
const formatter = (timeZone, options) => {
  const key = `${timeZone}|${JSON.stringify(options)}`
  if (!dateFormatters.has(key)) dateFormatters.set(key, new Intl.DateTimeFormat('ru-RU', { timeZone, ...options }))
  return dateFormatters.get(key)
}

/** `YYYY-MM-DD` и минуты с полуночи в поясе точки. */
export function localNow(timeZone, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now).reduce((all, part) => ({ ...all, [part.type]: part.value }), {})
  // hour12:false даёт 24 вместо 00 на полночь в части окружений.
  const hour = Number(parts.hour) % 24
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: hour * 60 + Number(parts.minute) }
}

/** Сдвиг календарной даты без часовых поясов: строка «YYYY-MM-DD» → строка. */
export function addDays(date, days) {
  const moment = new Date(`${date}T00:00:00Z`)
  moment.setUTCDate(moment.getUTCDate() + days)
  return moment.toISOString().slice(0, 10)
}

/** День недели от понедельника (0) — та же нумерация, что в slot_config и в приложении. */
export const mondayIndex = date => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7

const WEEKDAY_SHORT = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']

/** «21 сентября», «пн, 22 сентября» — дата читается без календаря под рукой. */
export function humanDate(date, { weekday = false } = {}) {
  const text = formatter('UTC', { day: 'numeric', month: 'long' }).format(new Date(`${date}T00:00:00Z`))
  return weekday ? `${WEEKDAY_SHORT[mondayIndex(date)]}, ${text}` : text
}

const rubles = kopecks => `${Math.round(kopecks / 100).toLocaleString('ru-RU')} ₽`
const plural = (count, one, few, many) => {
  const tail = Math.abs(count) % 100, last = tail % 10
  if (tail > 10 && tail < 20) return many
  if (last > 1 && last < 5) return few
  return last === 1 ? one : many
}

/**
 * Пора ли отправлять. Окно, а не точное совпадение: планировщик просыпается раз в
 * несколько минут и может опоздать, а пропущенное напоминание хуже, чем сдвинутое.
 * Повтор внутри окна отсекает журнал отправок, а не эта проверка.
 */
export function isDue(scheduleTime, nowMinutes, windowMinutes) {
  const [hours, minutes] = String(scheduleTime).split(':').map(Number)
  const target = hours * 60 + minutes
  const passed = nowMinutes - target
  return passed >= 0 && passed < windowMinutes
}

/** Какие напоминания этой точки созрели к текущей минуте. */
export function dueKinds(settings, { minutes, date }, windowMinutes) {
  const due = []
  if (settings.duty_today_enabled && isDue(settings.duty_today_time, minutes, windowMinutes)) due.push('duty_today')
  if (settings.duty_tomorrow_enabled && isDue(settings.duty_tomorrow_time, minutes, windowMinutes)) due.push('duty_tomorrow')
  if (settings.gaps_enabled && isDue(settings.gaps_time, minutes, windowMinutes)) due.push('gaps')
  if (settings.week_enabled && mondayIndex(date) === settings.week_weekday && isDue(settings.week_time, minutes, windowMinutes)) due.push('week')
  if (settings.money_enabled && isDue(settings.money_time, minutes, windowMinutes)) due.push('money')
  return due
}

// ── Данные точки ────────────────────────────────────────────────────────────

/** Сколько человек должно выйти в этот день. Повторяет slotsForDay из приложения. */
export function slotsForDay(config, date) {
  const settings = config || { def: 1 }
  const byDate = settings.dates?.[date]
  const byWeekday = settings.wd?.[mondayIndex(date)]
  return Math.max(1, byDate ?? byWeekday ?? settings.def ?? 1)
}

/**
 * Смены и отпуска точки на отрезке дат.
 *
 * Отпуск важен так же, как отсутствие смены: человек в графике стоит, но не выйдет,
 * и день на деле пустой. В приложении это же правило живёт в findHoles.
 */
export async function loadSchedule({ organizationId, pointId, from, to }) {
  const shifts = await db(`shifts?pickup_point_id=eq.${pointId}&work_date=gte.${from}&work_date=lte.${to}`
    + `&status=in.(${ACTIVE_SHIFT_STATUSES.join(',')})`
    + '&select=work_date,slot_index,status,planned_start,planned_end,employee_id,employees(full_name)&order=work_date,slot_index')
  const vacations = await db(`vacations?organization_id=eq.${organizationId}&date_from=lte.${to}&date_to=gte.${from}&select=employee_id,date_from,date_to`)
  return { shifts, vacations }
}

const onVacation = (vacations, employeeId, date) =>
  vacations.some(row => row.employee_id === employeeId && date >= row.date_from && date <= row.date_to)

/** Кто реально выходит в этот день: без отпускников и без задвоенных мест. */
export function dayCrew({ shifts, vacations, date }) {
  const taken = new Map()
  for (const shift of shifts) {
    if (shift.work_date !== date) continue
    if (onVacation(vacations, shift.employee_id, date)) continue
    if (!taken.has(shift.slot_index)) taken.set(shift.slot_index, shift)
  }
  return [...taken.values()].sort((first, second) => first.slot_index - second.slot_index)
}

/** Часы смены в поясе точки: «09:00–21:00». */
function shiftHours(shift, timeZone) {
  const time = value => formatter(timeZone, { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
  return `${time(shift.planned_start)}–${time(shift.planned_end)}`
}

const nameOf = shift => shift.employees?.full_name || 'сотрудник'

// ── Тексты ──────────────────────────────────────────────────────────────────

function dutyText({ point, shifts, vacations, date, title }) {
  const crew = dayCrew({ shifts, vacations, date })
  const need = slotsForDay(point.slot_config, date)
  const head = `🗓 ${title}, ${humanDate(date)} — ${point.name}`
  if (!crew.length) return `${head}\n\n❗️ На смену никто не поставлен, нужно ${need} ${plural(need, 'человек', 'человека', 'человек')}.`
  const lines = crew.map(shift => `• ${shiftHours(shift, point.timezone)} — ${nameOf(shift)}`)
  const missing = need - crew.length
  if (missing > 0) lines.push(`\n❗️ Не хватает ${missing} ${plural(missing, 'человека', 'человек', 'человек')} из ${need}.`)
  return `${head}\n${lines.join('\n')}`
}

function gapsText({ point, shifts, vacations, from, horizon }) {
  const gaps = []
  for (let offset = 0; offset < horizon; offset += 1) {
    const date = addDays(from, offset)
    const need = slotsForDay(point.slot_config, date)
    const crew = dayCrew({ shifts, vacations, date })
    if (crew.length < need) gaps.push({ date, need, has: crew.length })
  }
  if (!gaps.length) return null
  const lines = gaps.map(gap => gap.has === 0
    ? `• ${humanDate(gap.date, { weekday: true })} — никого, нужно ${gap.need}`
    : `• ${humanDate(gap.date, { weekday: true })} — ${gap.has} из ${gap.need}`)
  return `⚠️ Не закрыт график — ${point.name}\n${lines.join('\n')}\n\nБлижайшие ${horizon} ${plural(horizon, 'день', 'дня', 'дней')}. Поставьте людей в приложении.`
}

function weekText({ point, shifts, vacations, from }) {
  const lines = []
  for (let offset = 0; offset < 7; offset += 1) {
    const date = addDays(from, offset)
    const crew = dayCrew({ shifts, vacations, date })
    const need = slotsForDay(point.slot_config, date)
    const who = crew.length ? crew.map(nameOf).join(', ') : '— никого'
    lines.push(`• ${humanDate(date, { weekday: true })}: ${who}${crew.length < need ? ` (не хватает ${need - crew.length})` : ''}`)
  }
  return `📅 Неделя ${humanDate(from)} — ${humanDate(addDays(from, 6))} · ${point.name}\n${lines.join('\n')}`
}

async function moneyText({ point, organizationId, date }) {
  const expenses = await db(`expense_entries?organization_id=eq.${organizationId}&pickup_point_id=eq.${point.id}&date=eq.${date}&select=amount_kopecks`)
  const income = await db(`income_entries?organization_id=eq.${organizationId}&pickup_point_id=eq.${point.id}&date=eq.${date}&select=amount_kopecks`)
  const sum = rows => rows.reduce((total, row) => total + Number(row.amount_kopecks || 0), 0)
  const spent = sum(expenses), earned = sum(income)
  const tail = spent || earned
    ? `Сегодня записано: расходы ${rubles(spent)}, приход ${rubles(earned)}.`
    : 'Сегодня ещё ничего не записано.'
  return `💰 ${point.name} — не забудьте внести расходы за день.\n${tail}\n\nОтправьте боту «➕ Расход» — записи попадут в отчёт.`
}

/**
 * Текст одного напоминания или `null`, когда говорить не о чем.
 *
 * `null` для дырок — это не ошибка, а тишина по настройке: график закрыт, и ежедневное
 * «всё хорошо» быстро перестают читать вместе с настоящими предупреждениями.
 */
export async function buildReminder({ kind, point, settings, organizationId, today, preview = false }) {
  const horizon = Math.max(1, Math.min(60, settings.gaps_horizon_days || 14))

  if (kind === 'duty_today' || kind === 'duty_tomorrow') {
    const date = kind === 'duty_today' ? today : addDays(today, 1)
    const { shifts, vacations } = await loadSchedule({ organizationId, pointId: point.id, from: date, to: date })
    return dutyText({ point, shifts, vacations, date, title: kind === 'duty_today' ? 'Сегодня' : 'Завтра' })
  }

  if (kind === 'gaps') {
    const to = addDays(today, horizon - 1)
    const { shifts, vacations } = await loadSchedule({ organizationId, pointId: point.id, from: today, to })
    const text = gapsText({ point, shifts, vacations, from: today, horizon })
    if (text) return text
    // Пробную отправку тишиной подтверждать нельзя: владелец решит, что бот не работает.
    if (preview) return `✅ ${point.name}: график закрыт на ${horizon} ${plural(horizon, 'день', 'дня', 'дней')} вперёд.`
    return settings.gaps_quiet_when_full ? null : `✅ ${point.name}: график закрыт на ${horizon} ${plural(horizon, 'день', 'дня', 'дней')} вперёд.`
  }

  if (kind === 'week') {
    const to = addDays(today, 6)
    const { shifts, vacations } = await loadSchedule({ organizationId, pointId: point.id, from: today, to })
    return weekText({ point, shifts, vacations, from: today })
  }

  if (kind === 'money') return moneyText({ point, organizationId, date: today })

  return null
}
