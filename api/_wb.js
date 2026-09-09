import crypto from 'node:crypto'
import { db, decryptToken, encryptToken } from './_telegram.js'

const AUTH_ORIGIN = 'https://auth-my-pvz.wb.ru'
const APP_TYPE = 'prod-my-pvz'
const APP_VERSION = process.env.WB_APP_VERSION || 'v0.0.59'
const WB_ORIGIN = 'https://my-pvz.wb.ru'
const BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36'

const browserHeaders = () => ({
  Origin:WB_ORIGIN,
  Referer:`${WB_ORIGIN}/`,
  'User-Agent':BROWSER_USER_AGENT,
  'Accept-Language':'ru-RU,ru;q=0.9',
  'Cache-Control':'no-cache',
  Pragma:'no-cache',
  'Sec-CH-UA':'"Chromium";v="152", "Not?A_Brand";v="24", "Google Chrome";v="152"',
  'Sec-CH-UA-Mobile':'?0',
  'Sec-CH-UA-Platform':'"Windows"',
  'Sec-Fetch-Dest':'empty',
  'Sec-Fetch-Mode':'cors',
  'Sec-Fetch-Site':'same-site',
})

export class WbError extends Error {
  constructor(message, status = 500, data = null) { super(message); this.status = status; this.data = data }
}

const normalizePhone = value => {
  let digits = String(value || '').replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`
  if (digits.length === 10) digits = `7${digits}`
  if (!/^7\d{10}$/.test(digits)) throw new WbError('Введите номер в формате +7 999 123-45-67', 400)
  return digits
}

function message(data, fallback) {
  return data?.error?.message || data?.message || (typeof data?.error === 'string' ? data.error : fallback)
}

function authHeaders(session) {
  return {
    ...browserHeaders(),
    deviceId:session.deviceUuid,
    'wb-appversion':APP_VERSION,
    'X-Language':'ru',
  }
}

function powChallenge(value) {
  const match = String(value || '').match(/challenge=([^;]+)/i)
  return match?.[1] || null
}

function solvePow(challenge) {
  const parts = String(challenge).split(',')
  const difficulty = Number(parts[0])
  const salt = parts.slice(1).join(',')
  if (!Number.isInteger(difficulty) || difficulty < 0 || difficulty > 30 || !salt) throw new WbError('WB вернул некорректную проверку X-Pow', 502)
  const fullNibbles = Math.floor(difficulty / 4), remainingBits = difficulty % 4
  const maxAttempts = 2 ** (difficulty + 6)
  for (let nonce = 0; nonce < maxAttempts; nonce += 1) {
    const digest = crypto.createHash('sha256').update(`${salt}${nonce}`).digest('hex')
    const fullZeroes = digest.startsWith('0'.repeat(fullNibbles))
    const nextNibble = Number.parseInt(digest[fullNibbles] || '0', 16)
    if (fullZeroes && (remainingBits === 0 || nextNibble < 2 ** (4 - remainingBits))) return nonce
  }
  throw new WbError('Не удалось пройти проверку безопасности WB', 502)
}

function authPayload(result, fallback) {
  if (Number(result?.result) === 4) throw new WbError('Код уже отправлен. Подождите минуту перед повторной отправкой.', 429, result)
  if (Number(result?.result) === 6) throw new WbError('Неверный код WB. Проверьте цифры и попробуйте ещё раз.', 400, result)
  if (Number(result?.result) !== 0 || !result?.payload) throw new WbError(message(result, fallback), 400, result)
  return result.payload
}

function tokenClientId(token) {
  try {
    const payload = JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8'))
    const value = String(payload.client_id || '').trim()
    if (value) return value
  } catch { /* checked below */ }
  return 'my-pvz'
}

async function json(url, { method = 'GET', headers = {}, body } = {}) {
  const response = await fetch(url, {
    method,
    headers: { Accept:'application/json', ...headers, ...(body === undefined ? {} : { 'Content-Type':'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new WbError(message(data, `WB вернул HTTP ${response.status}`), response.status, data)
  return data
}

async function authAttempt(session, body, challenge = null) {
  const headers = authHeaders(session)
  if (challenge) headers['X-Pow'] = `status=valid; nonce=${solvePow(challenge)}; challenge=${challenge}`
  const response = await fetch(`${AUTH_ORIGIN}/v2/auth`, {
    method:'POST', headers:{ Accept:'application/json', 'Content-Type':'application/json', ...headers },
    body:JSON.stringify(body), signal:AbortSignal.timeout(30000),
  })
  const data = await response.json().catch(() => null)
  return { response, data, challenge:powChallenge(response.headers.get('x-pow')) }
}

export async function requestCode(phone, previous = {}) {
  const normalized = normalizePhone(phone)
  const session = { phone:normalized, deviceUuid:previous.deviceUuid || crypto.randomUUID() }
  const result = await json(`${AUTH_ORIGIN}/v2/code/wb-captcha`, {
    method:'POST',
    headers:authHeaders(session),
    body:{ captcha_token:'', phone_number:normalized, save_push:true },
  })
  const payload = authPayload(result, 'WB не отправил код подтверждения')
  if (!payload.sticker) throw new WbError('WB не выдал токен подтверждения', 502)
  return { ...session, sticker:payload.sticker, codeLength:6 }
}

export async function confirmCode(session, code) {
  const digits = String(code || '').replace(/\D/g, '')
  if (!session?.sticker || !/^\d{6}$/.test(digits)) throw new WbError('Введите 6-значный код из сообщения WB', 400)
  const body = { code:Number(digits), sticker:session.sticker }
  let attempt = await authAttempt(session, body)
  if (attempt.challenge && (!attempt.response.ok || Number(attempt.data?.result) !== 0 || !attempt.data?.payload?.access_token)) {
    attempt = await authAttempt(session, body, attempt.challenge)
  }
  if (!attempt.response.ok) throw new WbError(message(attempt.data, `WB вернул HTTP ${attempt.response.status}`), attempt.response.status, attempt.data)
  const result = attempt.data
  const payload = authPayload(result, 'WB не подтвердил код')
  const accessToken = payload.access_token || payload.accessToken
  if (!accessToken) throw new WbError('WB не выдал рабочую сессию', 502)
  return {
    phone:session.phone,
    deviceUuid:session.deviceUuid,
    token:accessToken,
    clientId:tokenClientId(accessToken),
  }
}

export const sealSession = session => encryptToken(JSON.stringify(session))
export const openSession = payload => JSON.parse(decryptToken(payload))

function wbHeaders(session) {
  return {
    ...browserHeaders(),
    'X-App-Type':APP_TYPE,
    'X-App-Version':APP_VERSION,
    'X-Client-Id':String(session.clientId),
    'X-Language':'ru',
    'X-Token':session.token,
    Deviceid:session.deviceUuid,
  }
}

async function wb(session, url, options = {}) {
  return json(url, { ...options, headers:{ ...wbHeaders(session), ...(options.headers || {}) } })
}

export async function enrichSession(session) {
  const organizations = await wb(session, 'https://r-point.wb.ru/auth-api/v3/my-orgs')
  const organization = list(organizations)[0]
  if (!organization?.id) throw new WbError('В кабинете WB не найдена доступная организация', 403)
  const enriched = await wb(session, 'https://r-point.wb.ru/auth-api/v3/enrich', {
    method:'POST', body:{ org_id:organization.id, position:organization.position },
  })
  const token = enriched?.access?.token
  if (!token) throw new WbError('WB не выдал доступ к выбранной организации', 502)
  return {
    ...session,
    token,
    clientId:tokenClientId(token),
    refreshToken:enriched?.refresh?.token || null,
    wbOrganizationId:organization.id,
    wbOrganizationName:organization.org_name || null,
  }
}

const list = value => Array.isArray(value) ? value : []
const kopecks = value => Math.max(1, Math.round(Number(value || 0) * 100))
const dateOrNow = value => value && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : new Date().toISOString()
const cleanPhone = value => value ? `+${String(value).replace(/\D/g, '')}` : null
const norm = value => String(value || '').trim().toLocaleLowerCase('ru-RU')

async function allOffices(session) {
  const result = [], limit = 100
  for (let offset = 0; offset < 10000; offset += limit) {
    const data = await wb(session, `https://pickpoint-ext-delivery.wb.ru/v3/my-pvz/offices?limit=${limit}&offset=${offset}`)
    const page = list(data?.data); result.push(...page)
    if (page.length < limit || result.length >= Number(data?.total || 0)) break
  }
  return result
}

async function managers(session) {
  const data = await wb(session, 'https://pickpoint-ext-delivery.wb.ru/service-manager/api/v2/personal-account/my-pvz/managers', {
    method:'POST', body:{ filter:{}, limit:1000, offset:0 },
  })
  return list(data?.managers)
}

async function userData(session, ids) {
  const result = []
  for (let offset = 0; offset < ids.length; offset += 100) {
    const data = await wb(session, 'https://r-point.wb.ru/gw/common/v1/users-data', { method:'POST', body:{ user_ids:ids.slice(offset, offset + 100) } })
    result.push(...list(data?.data))
  }
  return result
}

async function pagedPost(session, url, makeBody, pickItems) {
  const result = [], limit = 100
  for (let offset = 0; offset < 10000; offset += limit) {
    const data = await wb(session, url, { method:'POST', body:makeBody(offset, limit) })
    const page = list(pickItems(data)); result.push(...page)
    if (page.length < limit || result.length >= Number(data?.total || 0)) break
  }
  return result
}

async function upsertPoints(organizationId, offices) {
  const existing = await db(`pickup_points?organization_id=eq.${organizationId}&select=id,name,address,wb_external_id`)
  const result = new Map()
  for (const office of offices) {
    const externalId = Number(office.office_id)
    if (!Number.isSafeInteger(externalId)) continue
    const match = existing.find(row => Number(row.wb_external_id) === externalId || norm(row.address) === norm(office.full_address))
    const payload = { name:`ПВЗ ${externalId}`, address:office.full_address || office.city || `ПВЗ ${externalId}`, timezone:'Europe/Moscow', wb_external_id:externalId, updated_at:new Date().toISOString() }
    const rows = match
      ? await db(`pickup_points?id=eq.${match.id}`, { method:'PATCH', body:JSON.stringify(payload) })
      : await db('pickup_points', { method:'POST', body:JSON.stringify({ organization_id:organizationId, ...payload }) })
    result.set(externalId, rows[0].id)
  }
  return result
}

async function upsertEmployees(organizationId, managerRows, users, pointIds) {
  const existing = await db(`employees?organization_id=eq.${organizationId}&select=id,full_name,phone,wb_user_id`)
  const details = new Map(users.map(user => [Number(user.id), user]))
  const result = new Map()
  for (const manager of managerRows) {
    const wbUserId = Number(manager.user_id), user = details.get(wbUserId) || {}
    if (!Number.isSafeInteger(wbUserId)) continue
    const phone = cleanPhone(user.phone)
    const match = existing.find(row => Number(row.wb_user_id) === wbUserId || (phone && row.phone === phone) || norm(row.full_name) === norm(user.name))
    const payload = { full_name:String(user.name || `Сотрудник WB ${wbUserId}`).trim(), phone, status:manager.is_active === false ? 'ARCHIVED' : 'ACTIVE', wb_user_id:wbUserId, updated_at:new Date().toISOString() }
    const rows = match
      ? await db(`employees?id=eq.${match.id}`, { method:'PATCH', body:JSON.stringify(payload) })
      : await db('employees', { method:'POST', body:JSON.stringify({ organization_id:organizationId, payment_type:'SHIFT', ...payload }) })
    const employeeId = rows[0].id; result.set(wbUserId, employeeId)
    const links = list(manager.external_ids).map(link => pointIds.get(Number(link.external_office_id))).filter(Boolean)
    if (links.length) await db('employee_pickup_points?on_conflict=employee_id,pickup_point_id', {
      method:'POST', prefer:'resolution=ignore-duplicates,return=minimal', body:JSON.stringify(links.map(pickup_point_id => ({ employee_id:employeeId, pickup_point_id }))),
    })
  }
  return result
}

async function deductionsForPoint(session, externalPointId) {
  const rows = []
  for (const state of ['to_hold','hold','add']) {
    const defects = await pagedPost(session, 'https://write-off-ext-delivery.wb.ru/my-pvz/get-defect-panel',
      (offset, limit) => ({ filter:{ transaction_type:state, pickpoints_id:[externalPointId], sort_by:'date', sort_order:'desc' }, offset, limit }),
      data => data?.defect_products)
    for (const item of defects) rows.push({
      source:'defect', key:`${item.item_uid || item.shk}:${state}`, wbUserId:Number(item.employer_id) || null,
      eventAt:dateOrNow(item.last_operation_date || item.on_hold_date), amount:kopecks(item.retention_price),
      reason:item.defect_type || 'Удержание WB за дефект', status:state,
      comment:item.name ? `Товар: ${item.name}` : null,
    })
  }
  for (const state of ['hold','add']) {
    const overdue = await pagedPost(session, 'https://write-off-ext-delivery.wb.ru/my-pvz/v2/overdue-goods-hold-add/list',
      (offset, limit) => ({ pickpoint_id:externalPointId, type:state, limit, offset }), data => data?.goods)
    for (const item of overdue) rows.push({
      source:'overdue', key:`${item.item_uid || item.id}:${state}`, wbUserId:Number(item.employee_id) || null,
      eventAt:dateOrNow(item.operation_dt || item.hold_date || item.add_date), amount:kopecks(item.price_ru ?? item.price),
      reason:item.reason_description || 'Удержание WB за просроченный товар', status:state,
      comment:item.info?.name ? `Товар: ${item.info.name}` : null,
    })
  }
  return rows
}

const statusFor = state => state === 'to_hold' ? 'PENDING' : state === 'add' ? 'CANCELLED_BY_WB' : 'CONFIRMED_BY_WB'

export async function synchronize(session, organizationId) {
  const offices = await allOffices(session)
  const managerRows = await managers(session)
  const users = await userData(session, [...new Set(managerRows.map(row => Number(row.user_id)).filter(Number.isSafeInteger))])
  const pointIds = await upsertPoints(organizationId, offices)
  const employeeIds = await upsertEmployees(organizationId, managerRows, users, pointIds)
  const deductionPayload = []
  for (const [externalPointId, pickupPointId] of pointIds) {
    const rows = await deductionsForPoint(session, externalPointId)
    for (const item of rows) {
      deductionPayload.push({
        organization_id:organizationId, pickup_point_id:pickupPointId,
        employee_id:item.wbUserId ? employeeIds.get(item.wbUserId) || null : null,
        event_at:item.eventAt, amount_kopecks:item.amount, reason:item.reason,
        status:statusFor(item.status), comment:item.comment,
        wb_source:item.source, wb_external_key:item.key, updated_at:new Date().toISOString(),
      })
    }
  }
  for (let offset = 0; offset < deductionPayload.length; offset += 200) {
    await db('wb_deductions?on_conflict=organization_id,wb_source,wb_external_key', {
      method:'POST', prefer:'resolution=merge-duplicates,return=minimal', body:JSON.stringify(deductionPayload.slice(offset, offset + 200)),
    })
  }
  return { points:pointIds.size, employees:employeeIds.size, deductions:deductionPayload.length }
}
