import { db, decryptToken, safeEqual, secretHash, telegram } from '../_telegram.js'

const mainKeyboard = [[{ text: '➕ Удержание' }, { text: '➕ Расход' }], [{ text: '👥 Сотрудники' }, { text: '📅 Смены' }], [{ text: '🔄 Главное меню' }]]
const money = text => { const value = Number(String(text).replace(',', '.').replace(/[^\d.]/g, '')); return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : null }
const rubles = kopecks => `${(kopecks / 100).toLocaleString('ru-RU')} ₽`
/** Кнопки по две в ряд + возврат в меню. */
const optionsKeyboard = values => [...values.reduce((rows, value, index) => { if (index % 2 === 0) rows.push([]); rows[rows.length - 1].push({ text: value }); return rows }, []), [{ text: '🔄 Главное меню' }]]

async function integrationContext(req) {
  const id = String(req.query?.integration || '')
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const integrations = await db(`telegram_integrations?id=eq.${encodeURIComponent(id)}&status=eq.CONNECTED&select=id,organization_id`)
  const integration = integrations[0]
  if (!integration) return null
  const secrets = await db(`telegram_bot_secrets?integration_id=eq.${encodeURIComponent(id)}&select=encrypted_bot_token,webhook_secret_hash`)
  const stored = secrets[0], received = String(req.headers['x-telegram-bot-api-secret-token'] || '')
  if (!stored || !received || !safeEqual(stored.webhook_secret_hash, secretHash(received))) return null
  return { ...integration, botToken: decryptToken(stored.encrypted_bot_token) }
}

async function getChat(integrationId, chatId) { const rows = await db(`telegram_chats?integration_id=eq.${integrationId}&telegram_chat_id=eq.${chatId}&active=eq.true&select=*`); return rows[0] || null }
async function setState(id, state) { await db(`telegram_chats?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ state, updated_at: new Date().toISOString() }), prefer: 'return=minimal' }) }
async function send(token, chatId, text, keyboard = mainKeyboard) { return telegram(token, 'sendMessage', { chat_id: chatId, text, reply_markup: { keyboard, resize_keyboard: true } }) }

async function linkChat(context, chatId, userId, code) {
  const rows = await db(`telegram_pairing_codes?integration_id=eq.${context.id}&code=eq.${encodeURIComponent(code)}&used_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=*`)
  const pair = rows[0]; if (!pair) return false
  await db('telegram_chats', { method: 'POST', body: JSON.stringify({ organization_id: context.organization_id, integration_id: context.id, user_id: pair.user_id, telegram_chat_id: chatId, telegram_user_id: userId, role: 'OWNER', state: { step: 'idle' } }), prefer: 'resolution=merge-duplicates,return=minimal' })
  await db(`telegram_pairing_codes?id=eq.${pair.id}`, { method: 'PATCH', body: JSON.stringify({ used_at: new Date().toISOString() }), prefer: 'return=minimal' })
  return true
}

const listPoints = organizationId => db(`pickup_points?organization_id=eq.${organizationId}&archived_at=is.null&select=id,name&order=name`)
const listPresets = (organizationId, pointId, kind) => db(`entry_presets?organization_id=eq.${organizationId}&pickup_point_id=eq.${pointId}&kind=eq.${kind}&select=category_name,amount_kopecks&order=category_name`)

async function rememberPreset(organizationId, pointId, kind, category, amount) {
  await db('entry_presets?on_conflict=organization_id,pickup_point_id,kind,category_name', {
    method: 'POST',
    body: JSON.stringify({ organization_id: organizationId, pickup_point_id: pointId, kind, category_name: category, amount_kopecks: amount, updated_at: new Date().toISOString() }),
    prefer: 'resolution=merge-duplicates,return=minimal',
  })
}

/** Шаг выбора ПВЗ пропускается, когда точка одна. */
async function startPointStep(context, chat, reply, nextStep) {
  const points = await listPoints(chat.organization_id)
  if (!points.length) { await setState(chat.id, { step: 'idle' }); return reply('Сначала добавьте ПВЗ в админке.') }
  if (points.length === 1) return enterCategoryStep(chat, reply, nextStep, points[0])
  await setState(chat.id, { step: `${nextStep}_point`, points })
  return reply('Выберите ПВЗ.', optionsKeyboard(points.map(point => point.name)))
}

async function enterCategoryStep(chat, reply, nextStep, point) {
  if (nextStep === 'deduction') {
    await setState(chat.id, { step: 'deduction_amount', point })
    return reply(`ПВЗ: ${point.name}. Введите сумму удержания в рублях.`)
  }
  const presets = await listPresets(chat.organization_id, point.id, 'EXPENSE')
  await setState(chat.id, { step: 'expense_category', point })
  return reply(
    presets.length ? `ПВЗ: ${point.name}. Выберите категорию или напишите новую.` : `ПВЗ: ${point.name}. Напишите категорию расхода, например: Расходники.`,
    presets.length ? optionsKeyboard(presets.map(preset => preset.category_name)) : mainKeyboard,
  )
}

async function handleConnected(context, chat, text) {
  const state = chat.state || { step: 'idle' }
  const reply = (value, keyboard) => send(context.botToken, chat.telegram_chat_id, value, keyboard)

  if (text === '🔄 Главное меню' || text === '/start') { await setState(chat.id, { step: 'idle' }); return reply('Выберите действие.') }
  if (text === '➕ Удержание') return startPointStep(context, chat, reply, 'deduction')
  if (text === '➕ Расход') return startPointStep(context, chat, reply, 'expense')
  if (text === '👥 Сотрудники') {
    const rows = await db(`employees?organization_id=eq.${chat.organization_id}&status=eq.ACTIVE&select=full_name&order=full_name`)
    return reply(rows.length ? `Сотрудники:\n${rows.map(x => `• ${x.full_name}`).join('\n')}` : 'Сотрудников пока нет. Добавьте их в админке.')
  }
  if (text === '📅 Смены') {
    const rows = await db(`shifts?organization_id=eq.${chat.organization_id}&planned_start=gte.${encodeURIComponent(new Date().toISOString())}&select=planned_start,employees(full_name)&order=planned_start&limit=5`)
    return reply(rows.length ? `Ближайшие смены:\n${rows.map(x => `• ${new Date(x.planned_start).toLocaleString('ru-RU')} — ${x.employees?.full_name || 'сотрудник'}`).join('\n')}` : 'Ближайших смен нет.')
  }

  if (state.step === 'expense_point' || state.step === 'deduction_point') {
    const point = (state.points || []).find(item => item.name === text)
    if (!point) return reply('Выберите ПВЗ кнопкой из списка.', optionsKeyboard((state.points || []).map(item => item.name)))
    return enterCategoryStep(chat, reply, state.step === 'expense_point' ? 'expense' : 'deduction', point)
  }

  if (state.step === 'deduction_amount') {
    const amount = money(text)
    if (!amount) return reply('Введите сумму числом, например: 3730')
    await setState(chat.id, { step: 'deduction_reason', amount, point: state.point })
    return reply('Напишите причину удержания.')
  }
  if (state.step === 'deduction_reason') {
    await db('wb_deductions', { method: 'POST', body: JSON.stringify({ organization_id: chat.organization_id, pickup_point_id: state.point?.id ?? null, event_at: new Date().toISOString(), amount_kopecks: state.amount, reason: text, status: 'NEW' }), prefer: 'return=minimal' })
    await setState(chat.id, { step: 'idle' })
    return reply(`Удержание ${rubles(state.amount)} добавлено. Причина: ${text}`)
  }

  if (state.step === 'expense_category') {
    const category = text.trim()
    const presets = await listPresets(chat.organization_id, state.point.id, 'EXPENSE')
    const preset = presets.find(item => item.category_name === category)
    await setState(chat.id, { step: 'expense_amount', point: state.point, category, preset: preset?.amount_kopecks ?? null })
    return preset
      ? reply(`Запомненная сумма для «${category}» — ${rubles(preset.amount_kopecks)}. Отправьте её кнопкой или введите другую.`, optionsKeyboard([String(preset.amount_kopecks / 100)]))
      : reply(`Введите сумму расхода «${category}» в рублях.`)
  }

  if (state.step === 'expense_amount') {
    const amount = money(text)
    if (!amount) return reply('Введите сумму числом, например: 1200')
    const categories = await db(`expense_categories?organization_id=eq.${chat.organization_id}&name=eq.${encodeURIComponent(state.category)}&select=id`)
    let categoryId = categories[0]?.id
    if (!categoryId) {
      const created = await db('expense_categories', { method: 'POST', body: JSON.stringify({ organization_id: chat.organization_id, name: state.category }) })
      categoryId = created[0].id
    }
    await db('expense_entries', { method: 'POST', body: JSON.stringify({ organization_id: chat.organization_id, category_id: categoryId, pickup_point_id: state.point.id, date: new Date().toISOString().slice(0, 10), amount_kopecks: amount }), prefer: 'return=minimal' })
    if (state.preset === amount) {
      await setState(chat.id, { step: 'idle' })
      return reply(`Расход ${rubles(amount)} добавлен: ${state.category} · ${state.point.name}.`)
    }
    await setState(chat.id, { step: 'expense_remember', point: state.point, category: state.category, amount })
    return reply(`Расход ${rubles(amount)} добавлен: ${state.category} · ${state.point.name}.\nЗапомнить эту сумму для следующего раза?`, optionsKeyboard(['Запомнить', 'Не запоминать']))
  }

  if (state.step === 'expense_remember') {
    if (text === 'Запомнить') {
      await rememberPreset(chat.organization_id, state.point.id, 'EXPENSE', state.category, state.amount)
      await setState(chat.id, { step: 'idle' })
      return reply(`Запомнил: ${state.category} · ${state.point.name} — ${rubles(state.amount)}.`)
    }
    await setState(chat.id, { step: 'idle' })
    return reply('Хорошо, сумма не запомнена.')
  }

  return reply('Нажмите кнопку нужного действия.')
}

export default async function handler(req, res) {
  if (req.method === 'GET') return res.status(200).json({ ok: true, service: 'pvz-control-telegram', mode: 'organization-bots' })
  if (req.method !== 'POST') return res.status(405).end()
  try {
    const context = await integrationContext(req); if (!context) return res.status(401).end()
    const message = req.body?.message; if (!message?.chat?.id || !message?.from?.id) return res.status(200).json({ ok: true })
    const text = String(message.text || '').trim(), match = text.match(/^\/start\s+([A-Z0-9]{8})$/i)
    if (match) {
      const linked = await linkChat(context, message.chat.id, message.from.id, match[1].toUpperCase())
      await send(context.botToken, message.chat.id, linked ? 'PVZ Control подключён. Выберите действие.' : 'Код подключения недействителен или истёк. Создайте новый в админке.')
      return res.status(200).json({ ok: true })
    }
    const chat = await getChat(context.id, message.chat.id)
    if (!chat) { await send(context.botToken, message.chat.id, 'Сначала создайте код подключения в админке и отправьте /start КОД.'); return res.status(200).json({ ok: true }) }
    try {
      await handleConnected(context, chat, text)
    } catch (error) {
      // Пятисотка заставила бы Telegram ретраить апдейт и подвесить очередь чата,
      // поэтому сбой сценария объясняем пользователю и подтверждаем доставку.
      console.error('telegram scenario', error)
      await setState(chat.id, { step: 'idle' }).catch(() => null)
      await send(context.botToken, chat.telegram_chat_id, 'Не удалось выполнить действие. Попробуйте ещё раз.').catch(() => null)
    }
    return res.status(200).json({ ok: true })
  } catch (error) {
    console.error('telegram webhook', error.message)
    return res.status(500).json({ error: 'Webhook failed' })
  }
}
