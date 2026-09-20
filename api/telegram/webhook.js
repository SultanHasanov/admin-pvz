/**
 * Вебхук бота точки.
 *
 * Бот односторонний: он присылает в рабочую группу ПВЗ то, что настроено в приложении.
 * Сценариев ввода (расходы, удержания, кабинет сотрудника) здесь нет — всё это делается
 * на сайте, и бот не должен быть вторым, расходящимся с ним интерфейсом.
 *
 * Поэтому вебхук делает ровно две вещи: запоминает чаты, в которые бота добавили, и
 * отвечает на свои команды в подтверждённой группе. Подтверждает группу владелец кнопкой
 * в приложении: без этого любой, кто знает @имя бота, добавил бы его в свой чат и получал
 * бы график точки с именами сотрудников.
 */
import { db, decryptToken, safeEqual, secretHash, telegram } from '../_telegram.js'
import { buildReminder, localNow } from '../_reminders.js'

async function integrationContext(req) {
  const id = String(req.query?.integration || '')
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const integrations = await db(`telegram_integrations?id=eq.${encodeURIComponent(id)}&status=eq.CONNECTED&pickup_point_id=not.is.null&select=id,organization_id,pickup_point_id`)
  const integration = integrations[0]
  if (!integration) return null
  const secrets = await db(`telegram_bot_secrets?integration_id=eq.${encodeURIComponent(id)}&select=encrypted_bot_token,webhook_secret_hash`)
  const stored = secrets[0], received = String(req.headers['x-telegram-bot-api-secret-token'] || '')
  if (!stored || !received || !safeEqual(stored.webhook_secret_hash, secretHash(received))) return null
  return { ...integration, botToken: decryptToken(stored.encrypted_bot_token) }
}

const isGroupChat = chat => chat?.type === 'group' || chat?.type === 'supergroup'

const send = (context, chatId, text) => telegram(context.botToken, 'sendMessage', { chat_id: chatId, text })

const findChat = (integrationId, chatId) =>
  db(`telegram_chats?integration_id=eq.${integrationId}&telegram_chat_id=eq.${chatId}&select=id,chat_kind,telegram_chat_id,active,approved_at`)
    .then(rows => rows[0] || null)

const patchChat = (id, patch) => db(`telegram_chats?id=eq.${id}`, {
  method: 'PATCH',
  body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  prefer: 'return=minimal',
}).catch(() => null)

/**
 * Запомнить чат, в который добавили бота. Он появится в приложении как кандидат —
 * подтверждённым (и получающим напоминания) его делает владелец кнопкой.
 */
async function rememberChat(context, chat, fromId) {
  const known = await findChat(context.id, chat.id)
  const title = String(chat.title || '').slice(0, 120)
  if (known) {
    await patchChat(known.id, { active: true, title })
    return known
  }
  await db('telegram_chats', {
    method: 'POST',
    body: JSON.stringify({
      organization_id: context.organization_id, integration_id: context.id,
      telegram_chat_id: chat.id, telegram_user_id: fromId,
      chat_kind: 'GROUP', title, active: true, approved_at: null, state: { step: 'idle' },
    }),
    prefer: 'return=minimal',
  }).catch(error => { console.error('telegram remember chat', error.message) })
  return null
}

const HELP = [
  'Я присылаю в эту группу напоминания по вашему ПВЗ.',
  '',
  '/today — кто на смене сегодня',
  '/tomorrow — кто выходит завтра',
  '/week — расписание на неделю',
  '/gaps — где в графике не хватает людей',
  '/stop — перестать писать в эту группу',
  '',
  'Что и во сколько приходит — настраивается в приложении: «Ещё → Telegram-боты».',
].join('\n')

const WAITING = 'Я в группе. Осталось подтвердить её в приложении: «Ещё → Telegram-боты → Напоминания в группу» — эта группа уже в списке, нажмите «Подключить».'

const COMMANDS = { '/today': 'duty_today', '/tomorrow': 'duty_tomorrow', '/week': 'week', '/gaps': 'gaps' }

/**
 * Группа — чат живых людей, а не пульт: на обычные сообщения бот обязан молчать,
 * иначе его выгонят в первый же день. Отвечаем только на свои команды.
 */
async function handleCommand(context, chat, text) {
  const command = text.replace(/@[A-Za-z0-9_]+/g, '').trim().toLowerCase()
  if (command === '/start' || command === '/help') return send(context, chat.telegram_chat_id, HELP)
  if (command === '/stop') {
    // Бот остаётся в чате, но замолкает: в приложении группа снова станет кандидатом.
    await patchChat(chat.id, { approved_at: null })
    return send(context, chat.telegram_chat_id, 'Больше сюда не пишу. Вернуть напоминания можно в приложении.')
  }

  const kind = COMMANDS[command]
  if (!kind) return null

  const [point] = await db(`pickup_points?id=eq.${context.pickup_point_id}&select=id,name,timezone,slot_config`)
  if (!point) return send(context, chat.telegram_chat_id, 'Этот бот больше не привязан к ПВЗ.')
  const [settings] = await db(`telegram_bot_settings?integration_id=eq.${context.id}&select=*`)
  const { date } = localNow(point.timezone || 'Europe/Moscow')
  const message = await buildReminder({
    kind, point, organizationId: context.organization_id, today: date, preview: true,
    settings: settings || { gaps_horizon_days: 14, gaps_quiet_when_full: true },
  })
  return send(context, chat.telegram_chat_id, message || 'Пока нечего показать.')
}

export default async function handler(req, res) {
  if (req.method === 'GET') return res.status(200).json({ ok: true, service: 'punkt-telegram', mode: 'group-reminders' })
  if (req.method !== 'POST') return res.status(405).end()
  try {
    const context = await integrationContext(req); if (!context) return res.status(401).end()

    const updateId = Number(req.body?.update_id)
    if (Number.isFinite(updateId)) {
      try { await db('telegram_updates', { method: 'POST', body: JSON.stringify({ integration_id: context.id, update_id: updateId }), prefer: 'return=minimal' }) }
      catch (error) { if (/23505|duplicate/i.test(String(error.message))) return res.status(200).json({ ok: true, duplicate: true }); throw error }
    }

    // Бота добавили в группу или выгнали из неё. Добавление — единственный способ
    // узнать id чата: Bot API не даёт боту список его чатов.
    const membership = req.body?.my_chat_member
    if (membership?.chat?.id) {
      const status = membership.new_chat_member?.status
      const known = await findChat(context.id, membership.chat.id)
      if (['left', 'kicked'].includes(status)) {
        if (known) await patchChat(known.id, { active: false })
      } else if (isGroupChat(membership.chat) && ['member', 'administrator'].includes(status)) {
        const existing = await rememberChat(context, membership.chat, membership.from?.id ?? 0)
        if (!existing?.approved_at) await send(context, membership.chat.id, WAITING).catch(() => null)
      }
      return res.status(200).json({ ok: true })
    }

    const message = req.body?.message
    if (!message?.chat?.id || !message?.from?.id) return res.status(200).json({ ok: true })
    const text = String(message.text || '').trim()

    // В личке бот не нужен: всё, что он умеет, настраивается на сайте. Объясняем это
    // на команду и молчим на остальное, чтобы не изображать несуществующее меню.
    if (!isGroupChat(message.chat)) {
      if (/^\/(start|help)\b/i.test(text)) {
        await send(context, message.chat.id, 'Этот бот присылает напоминания в рабочую группу ПВЗ. Добавьте меня в группу и подтвердите её в приложении — «Ещё → Telegram-боты».').catch(() => null)
      }
      return res.status(200).json({ ok: true })
    }

    const chat = await findChat(context.id, message.chat.id)

    // Бота добавили в группу до этой версии — события о добавлении не было. Любой
    // «/start» в группе возвращает её в список приложения, кода для этого не нужно.
    if (!chat) {
      if (/^\/start\b/i.test(text)) {
        await rememberChat(context, message.chat, message.from.id)
        await send(context, message.chat.id, WAITING).catch(() => null)
      }
      return res.status(200).json({ ok: true })
    }

    if (!chat.approved_at) {
      if (/^\/(start|help)\b/i.test(text)) await send(context, message.chat.id, WAITING).catch(() => null)
      return res.status(200).json({ ok: true })
    }

    try {
      await handleCommand(context, chat, text)
    } catch (error) {
      // Пятисотка заставила бы Telegram ретраить апдейт и подвесить очередь чата,
      // поэтому сбой объясняем в чате и подтверждаем доставку.
      console.error('telegram command', error)
      await send(context, chat.telegram_chat_id, 'Не получилось собрать ответ. Попробуйте ещё раз.').catch(() => null)
    }
    return res.status(200).json({ ok: true })
  } catch (error) {
    console.error('telegram webhook', error.message)
    return res.status(500).json({ error: 'Webhook failed' })
  }
}
