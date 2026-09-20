/**
 * Пробная отправка напоминания из приложения: владелец видит в группе ровно тот текст,
 * который придёт по расписанию, и понимает, что бот в группе действительно пишет.
 *
 * Текст строит тот же `buildReminder`, что и планировщик, но в режиме `preview`:
 * «дырок нет» здесь показывается явно, а не молчанием.
 */
import { authenticatedUser, db, decryptToken, requireOwner, telegram } from '../_telegram.js'
import { REMINDER_KINDS, buildReminder, localNow } from '../_reminders.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const user = await authenticatedUser(req)
    if (!user) return res.status(401).json({ error: 'Войдите в аккаунт' })
    const organizationId = String(req.body?.organizationId || '')
    const pickupPointId = String(req.body?.pickupPointId || '')
    const kind = String(req.body?.kind || 'duty_today')
    if (!organizationId || !(await requireOwner(user.id, organizationId))) return res.status(403).json({ error: 'Недостаточно прав' })
    if (!REMINDER_KINDS.includes(kind)) return res.status(400).json({ error: 'Неизвестный вид напоминания' })

    const [integration] = await db(`telegram_integrations?organization_id=eq.${encodeURIComponent(organizationId)}&pickup_point_id=eq.${encodeURIComponent(pickupPointId)}&status=eq.CONNECTED&select=id,organization_id,pickup_point_id`)
    if (!integration) return res.status(400).json({ error: 'Бот этого ПВЗ не подключён' })
    const [point] = await db(`pickup_points?id=eq.${encodeURIComponent(pickupPointId)}&select=id,name,timezone,slot_config`)
    if (!point) return res.status(400).json({ error: 'Пункт не найден' })
    const chats = await db(`telegram_chats?integration_id=eq.${integration.id}&chat_kind=eq.GROUP&active=eq.true&approved_at=not.is.null&select=id,telegram_chat_id`)
    if (!chats.length) return res.status(400).json({ error: 'Бот ещё не добавлен в группу' })

    const [settings] = await db(`telegram_bot_settings?integration_id=eq.${integration.id}&select=*`)
    const [secret] = await db(`telegram_bot_secrets?integration_id=eq.${integration.id}&select=encrypted_bot_token`)
    if (!secret) return res.status(400).json({ error: 'Токен бота не найден — подключите бота заново' })

    const { date } = localNow(point.timezone || 'Europe/Moscow')
    const text = await buildReminder({
      kind, point, organizationId, today: date, preview: true,
      settings: settings || { gaps_horizon_days: 14, gaps_quiet_when_full: true },
    })
    if (!text) return res.status(400).json({ error: 'Для этого напоминания сейчас нечего отправить' })

    const botToken = decryptToken(secret.encrypted_bot_token)
    let sent = 0
    for (const chat of chats) {
      try { await telegram(botToken, 'sendMessage', { chat_id: chat.telegram_chat_id, text }); sent += 1 }
      catch (error) { console.error('telegram notify send', error.message) }
    }
    if (!sent) return res.status(502).json({ error: 'Telegram не принял сообщение — проверьте, что бот всё ещё в группе' })
    return res.status(200).json({ ok: true, sent })
  } catch (error) {
    console.error('telegram notify', error.message)
    return res.status(500).json({ error: error.message || 'Не удалось отправить' })
  }
}
