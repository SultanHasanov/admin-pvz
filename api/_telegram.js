import crypto from 'node:crypto'

const TELEGRAM_API = 'https://api.telegram.org'

export function serverConfig() {
  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  const encryptionKey = process.env.TELEGRAM_TOKEN_ENCRYPTION_KEY
  if (!url || !serviceKey) throw new Error('Supabase server environment variables are missing')
  if (!encryptionKey || encryptionKey.length < 32) throw new Error('TELEGRAM_TOKEN_ENCRYPTION_KEY must contain at least 32 characters')
  return { url: url.replace(/\/$/, ''), serviceKey, encryptionKey }
}

export async function db(path, options = {}) {
  const { url, serviceKey } = serverConfig()
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: options.prefer || 'return=representation',
      ...(options.headers || {}),
    },
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : null
}

export async function telegram(botToken, method, body = {}) {
  const response = await fetch(`${TELEGRAM_API}/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data?.ok) throw new Error(data?.description || `Telegram ${response.status}`)
  return data.result
}

function encryptionMaterial() {
  return crypto.createHash('sha256').update(serverConfig().encryptionKey, 'utf8').digest()
}

export function encryptToken(token) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionMaterial(), iv)
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), encrypted].map(value => value.toString('base64url')).join('.')
}

export function decryptToken(payload) {
  const [ivText, tagText, encryptedText] = String(payload).split('.')
  if (!ivText || !tagText || !encryptedText) throw new Error('Invalid encrypted Telegram token')
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionMaterial(), Buffer.from(ivText, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(encryptedText, 'base64url')), decipher.final()]).toString('utf8')
}

export const secretHash = value => crypto.createHash('sha256').update(String(value), 'utf8').digest('hex')

export function safeEqual(left, right) {
  const a = Buffer.from(String(left), 'utf8'), b = Buffer.from(String(right), 'utf8')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export async function authenticatedUser(req) {
  const authorization = String(req.headers.authorization || '')
  if (!authorization.startsWith('Bearer ')) return null
  const { url, serviceKey } = serverConfig()
  const response = await fetch(`${url}/auth/v1/user`, { headers: { apikey: serviceKey, Authorization: authorization } })
  return response.ok ? response.json() : null
}

export async function requireOwner(userId, organizationId) {
  const rows = await db(`organization_members?organization_id=eq.${encodeURIComponent(organizationId)}&user_id=eq.${encodeURIComponent(userId)}&role=eq.OWNER&select=id`)
  return Boolean(rows[0])
}

export function publicAppUrl(req) {
  const configured = String(process.env.PUBLIC_APP_URL || '').replace(/\/$/, '')
  if (configured) return configured
  const host = req.headers['x-forwarded-host'] || req.headers.host
  const protocol = req.headers['x-forwarded-proto'] || 'https'
  if (!host) throw new Error('PUBLIC_APP_URL is missing')
  return `${protocol}://${host}`
}
