import { authenticatedUser, db, requireOwner } from '../_telegram.js'
import { WbError, confirmCode, openSession, requestCode, sealSession, synchronize } from '../_wb.js'

export const config = { maxDuration:60 }

const safeRow = row => ({
  status:row?.status || 'NOT_CONNECTED', phoneHint:row?.phone_hint || null,
  lastSyncAt:row?.last_sync_at || null, lastError:row?.last_error || null,
})

export default async function handler(req, res) {
  if (!['GET','POST','DELETE'].includes(req.method)) return res.status(405).json({ error:'Method not allowed' })
  try {
    const user = await authenticatedUser(req)
    if (!user) return res.status(401).json({ error:'Войдите в аккаунт PVZ Control' })
    const organizationId = String(req.query?.organizationId || req.body?.organizationId || '')
    if (!organizationId || !(await requireOwner(user.id, organizationId))) return res.status(403).json({ error:'Недостаточно прав' })
    const rows = await db(`wb_integrations?organization_id=eq.${encodeURIComponent(organizationId)}&select=*`)
    const current = rows[0]
    if (req.method === 'GET') return res.status(200).json(safeRow(current))
    if (req.method === 'DELETE') {
      if (current) await db(`wb_integrations?organization_id=eq.${organizationId}`, { method:'DELETE', prefer:'return=minimal' })
      return res.status(200).json({ ok:true })
    }
    const action = String(req.body?.action || '')
    if (action === 'request_code') {
      const previous = current?.encrypted_session ? openSession(current.encrypted_session) : {}
      const session = await requestCode(req.body?.phone, previous)
      await db('wb_integrations?on_conflict=organization_id', { method:'POST', prefer:'resolution=merge-duplicates,return=minimal', body:JSON.stringify({
        organization_id:organizationId, status:'AWAIT_CODE', encrypted_session:sealSession(session), phone_hint:`+7 ••• •••-${session.phone.slice(-4, -2)}-${session.phone.slice(-2)}`, last_error:null, updated_at:new Date().toISOString(),
      }) })
      return res.status(200).json({ ok:true, codeLength:session.codeLength })
    }
    if (action === 'confirm_code') {
      if (!current?.encrypted_session) return res.status(409).json({ error:'Сначала запросите код WB' })
      const session = await confirmCode(openSession(current.encrypted_session), req.body?.code)
      await db(`wb_integrations?organization_id=eq.${organizationId}`, { method:'PATCH', prefer:'return=minimal', body:JSON.stringify({ status:'CONNECTED', encrypted_session:sealSession(session), last_error:null, updated_at:new Date().toISOString() }) })
      return res.status(200).json({ ok:true })
    }
    if (action === 'sync') {
      if (current?.status !== 'CONNECTED' || !current.encrypted_session) return res.status(409).json({ error:'Сначала подключите кабинет WB' })
      const result = await synchronize(openSession(current.encrypted_session), organizationId)
      const now = new Date().toISOString()
      await db(`wb_integrations?organization_id=eq.${organizationId}`, { method:'PATCH', prefer:'return=minimal', body:JSON.stringify({ last_sync_at:now, last_error:null, updated_at:now }) })
      return res.status(200).json({ ok:true, ...result, lastSyncAt:now })
    }
    return res.status(400).json({ error:'Неизвестное действие' })
  } catch (error) {
    console.error('WB integration', error.message)
    const status = error instanceof WbError && error.status >= 400 && error.status < 500 ? error.status : 500
    return res.status(status).json({ error:error.message || 'Ошибка интеграции WB' })
  }
}
