/**
 * Планировщик напоминаний: просыпается по расписанию Vercel Cron и рассылает то,
 * чьё время наступило.
 *
 * Идемпотентность держится на журнале `telegram_reminder_log`: строку с уникальным
 * ключом (бот, чат, вид, дата) вставляем ДО отправки и удаляем, если Telegram не принял.
 * Так частые пробуждения не превращаются в спам, а упавшая отправка повторится.
 */
import { db, decryptToken, safeEqual, telegram } from '../_telegram.js'
import { buildReminder, dueKinds, localNow } from '../_reminders.js'

/** Насколько поздно ещё имеет смысл отправить напоминание, если планировщик опоздал. */
const WINDOW_MINUTES = Math.max(5, Math.min(240, Number(process.env.TELEGRAM_REMINDER_WINDOW_MINUTES) || 60))
/** Журнал нужен только для защиты от повторов — старое место не занимает. */
const LOG_KEEP_DAYS = 60

function authorized(req) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header = String(req.headers.authorization || '')
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : ''
  const query = String(req.query?.key || '')
  return (bearer && safeEqual(bearer, secret)) || (query && safeEqual(query, secret))
}

/** Занять отправку. `false` — это напоминание уже отправлено другим пробуждением. */
async function claim(integrationId, chatId, kind, refDate) {
  try {
    await db('telegram_reminder_log', {
      method: 'POST',
      body: JSON.stringify({ integration_id: integrationId, telegram_chat_id: chatId, kind, ref_date: refDate }),
      prefer: 'return=minimal',
    })
    return true
  } catch (error) {
    if (/23505|duplicate/i.test(String(error.message))) return false
    throw error
  }
}

const release = (integrationId, chatId, kind, refDate) => db(
  `telegram_reminder_log?integration_id=eq.${integrationId}&telegram_chat_id=eq.${chatId}&kind=eq.${kind}&ref_date=eq.${refDate}`,
  { method: 'DELETE', prefer: 'return=minimal' },
).catch(() => null)

/** Бот выгнан из группы или чат удалён — отписываем, чтобы не долбиться каждую минуту. */
const chatIsGone = message => /chat not found|bot was kicked|bot is not a member|group chat was upgraded|have no rights/i.test(String(message))

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' })
  if (!authorized(req)) return res.status(401).json({ error: 'Unauthorized' })

  const now = new Date()
  const report = { checked: 0, sent: 0, skipped: 0, failed: 0 }
  try {
    const settingsRows = await db('telegram_bot_settings?select=*')
    for (const settings of settingsRows) {
      try {
        const enabled = settings.duty_today_enabled || settings.duty_tomorrow_enabled || settings.gaps_enabled || settings.week_enabled || settings.money_enabled
        if (!enabled) continue

        const [integration] = await db(`telegram_integrations?id=eq.${settings.integration_id}&status=eq.CONNECTED&select=id,organization_id,pickup_point_id`)
        if (!integration?.pickup_point_id) continue
        const [point] = await db(`pickup_points?id=eq.${integration.pickup_point_id}&archived_at=is.null&select=id,name,timezone,slot_config`)
        if (!point) continue
        const chats = await db(`telegram_chats?integration_id=eq.${integration.id}&chat_kind=eq.GROUP&active=eq.true&approved_at=not.is.null&select=id,telegram_chat_id`)
        if (!chats.length) continue

        const timeZone = point.timezone || 'Europe/Moscow'
        const moment = localNow(timeZone, now)
        const kinds = dueKinds(settings, moment, WINDOW_MINUTES)
        if (!kinds.length) continue
        report.checked += 1

        const [secret] = await db(`telegram_bot_secrets?integration_id=eq.${integration.id}&select=encrypted_bot_token`)
        if (!secret) continue
        const botToken = decryptToken(secret.encrypted_bot_token)

        for (const kind of kinds) {
          const text = await buildReminder({
            kind, point, settings, organizationId: integration.organization_id, today: moment.date,
          })
          if (!text) { report.skipped += 1; continue }

          for (const chat of chats) {
            if (!(await claim(integration.id, chat.telegram_chat_id, kind, moment.date))) { report.skipped += 1; continue }
            try {
              await telegram(botToken, 'sendMessage', { chat_id: chat.telegram_chat_id, text, disable_notification: kind === 'week' })
              report.sent += 1
            } catch (error) {
              report.failed += 1
              if (chatIsGone(error.message)) {
                await db(`telegram_chats?id=eq.${chat.id}`, { method: 'PATCH', body: JSON.stringify({ active: false, updated_at: new Date().toISOString() }), prefer: 'return=minimal' }).catch(() => null)
              } else {
                // Разовый сбой Telegram: снимаем заявку, следующее пробуждение повторит.
                await release(integration.id, chat.telegram_chat_id, kind, moment.date)
              }
            }
          }
        }
      } catch (error) {
        report.failed += 1
        console.error('telegram cron point', settings.integration_id, error.message)
      }
    }

    const oldest = new Date(now.getTime() - LOG_KEEP_DAYS * 86400000).toISOString()
    await db(`telegram_reminder_log?sent_at=lt.${oldest}`, { method: 'DELETE', prefer: 'return=minimal' }).catch(() => null)

    return res.status(200).json({ ok: true, ...report })
  } catch (error) {
    console.error('telegram cron', error.message)
    return res.status(500).json({ error: 'Cron failed' })
  }
}
