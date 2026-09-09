import crypto from 'node:crypto'
import { authenticatedUser, db, decryptToken, encryptToken, publicAppUrl, requireOwner, secretHash, telegram } from '../_telegram.js'

function tokenFrom(body) { return String(body?.botToken || '').trim() }

export default async function handler(req, res) {
  if (!['POST', 'DELETE'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' })
  try {
    const user = await authenticatedUser(req)
    if (!user) return res.status(401).json({ error: 'Войдите в аккаунт PVZ Control' })
    const organizationId = String(req.body?.organizationId || '')
    if (!organizationId || !(await requireOwner(user.id, organizationId))) return res.status(403).json({ error: 'Недостаточно прав' })
    const integrations = await db(`telegram_integrations?organization_id=eq.${encodeURIComponent(organizationId)}&select=*`)
    const current = integrations[0]

    if (req.method === 'DELETE') {
      if (current) {
        const secrets = await db(`telegram_bot_secrets?integration_id=eq.${current.id}&select=encrypted_bot_token`)
        if (secrets[0]) await telegram(decryptToken(secrets[0].encrypted_bot_token), 'deleteWebhook', { drop_pending_updates: true }).catch(() => null)
        await db(`telegram_integrations?id=eq.${current.id}`, { method:'PATCH', body:JSON.stringify({ status:'NOT_CONNECTED', bot_id:null, bot_username:null, last_error:null, updated_at:new Date().toISOString() }), prefer:'return=minimal' })
        await db(`telegram_bot_secrets?integration_id=eq.${current.id}`, { method:'DELETE', prefer:'return=minimal' })
      }
      return res.status(200).json({ ok:true })
    }

    const botToken = tokenFrom(req.body)
    if (!botToken || /\s/.test(botToken) || !botToken.includes(':')) {
      return res.status(400).json({ error:'Вставьте полный токен от BotFather в формате 123456789:AA...' })
    }
    let bot
    try {
      bot = await telegram(botToken, 'getMe')
    } catch (error) {
      return res.status(400).json({ error:error.message || 'Telegram не принял токен. Получите новый токен у BotFather.' })
    }
    const now = new Date().toISOString()
    let integration = current
    if (integration) {
      const updated = await db(`telegram_integrations?id=eq.${integration.id}`, { method:'PATCH', body:JSON.stringify({ bot_id:bot.id, bot_username:bot.username, connected_by:user.id, connected_at:now, updated_at:now, status:'CONNECTING', last_error:null }) })
      integration = updated[0]
    } else {
      const created = await db('telegram_integrations', { method:'POST', body:JSON.stringify({ organization_id:organizationId, bot_id:bot.id, bot_username:bot.username, connected_by:user.id, connected_at:now, status:'CONNECTING' }) })
      integration = created[0]
    }
    const webhookSecret = crypto.randomBytes(32).toString('base64url')
    await db('telegram_bot_secrets', { method:'POST', body:JSON.stringify({ integration_id:integration.id, organization_id:organizationId, encrypted_bot_token:encryptToken(botToken), webhook_secret_hash:secretHash(webhookSecret), updated_at:now }), prefer:'resolution=merge-duplicates,return=minimal' })
    const webhookUrl = `${publicAppUrl(req)}/api/telegram/webhook?integration=${encodeURIComponent(integration.id)}`
    try {
      await telegram(botToken, 'setWebhook', { url:webhookUrl, secret_token:webhookSecret, allowed_updates:['message'], drop_pending_updates:false })
      await db(`telegram_integrations?id=eq.${integration.id}`, { method:'PATCH', body:JSON.stringify({ status:'CONNECTED', last_error:null, updated_at:new Date().toISOString() }), prefer:'return=minimal' })
    } catch (error) {
      await db(`telegram_integrations?id=eq.${integration.id}`, { method:'PATCH', body:JSON.stringify({ status:'ERROR', last_error:String(error.message).slice(0,300), updated_at:new Date().toISOString() }), prefer:'return=minimal' })
      throw error
    }
    return res.status(200).json({ ok:true, bot:{ id:bot.id, username:bot.username, firstName:bot.first_name } })
  } catch (error) {
    console.error('telegram integration', error.message)
    return res.status(500).json({ error:error.message || 'Не удалось подключить бота' })
  }
}
