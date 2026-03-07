import { createHmac, timingSafeEqual } from 'node:crypto'

const COOKIE_NAME = 'polycam_admin'
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60

interface SessionPayload {
  exp: number
}

function getSecret() {
  const secret = process.env.AUTH_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('AUTH_SECRET must be set to at least 32 characters')
  }
  return secret
}

function encodeBase64Url(value: string | Buffer) {
  return Buffer.from(value).toString('base64url')
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8')
}

function signValue(payloadBase64: string, secret: string) {
  return createHmac('sha256', secret).update(payloadBase64).digest('base64url')
}

function parseCookies(request: Request) {
  const cookieHeader = request.headers.get('cookie') ?? ''
  const entries = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.includes('='))

  const cookies = new Map<string, string>()
  for (const entry of entries) {
    const [name, ...rest] = entry.split('=')
    cookies.set(name, rest.join('='))
  }
  return cookies
}

function secureCookieFlag(request: Request) {
  const forwardedProto = request.headers.get('x-forwarded-proto')
  if (forwardedProto === 'https') {
    return '; Secure'
  }

  const protocol = new URL(request.url).protocol
  return protocol === 'https:' ? '; Secure' : ''
}

export function createSessionCookieHeader(request: Request) {
  const secret = getSecret()
  const payload: SessionPayload = {
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  }
  const payloadBase64 = encodeBase64Url(JSON.stringify(payload))
  const signature = signValue(payloadBase64, secret)
  const token = `${payloadBase64}.${signature}`

  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict${secureCookieFlag(request)}; Max-Age=${SESSION_MAX_AGE_SECONDS}`
}

export function clearSessionCookieHeader(request: Request) {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict${secureCookieFlag(request)}; Max-Age=0`
}

export function requireAuth(request: Request) {
  const secret = getSecret()
  const cookies = parseCookies(request)
  const token = cookies.get(COOKIE_NAME)
  if (!token) return false

  const [payloadBase64, signature] = token.split('.')
  if (!payloadBase64 || !signature) return false

  const expectedSignature = signValue(payloadBase64, secret)
  const signatureBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expectedSignature)
  if (signatureBuffer.length !== expectedBuffer.length) return false
  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) return false

  try {
    const payload = JSON.parse(decodeBase64Url(payloadBase64)) as SessionPayload
    return Number.isFinite(payload.exp) && payload.exp > Math.floor(Date.now() / 1000)
  } catch {
    return false
  }
}

export function validateLoginPassword(password: string) {
  const adminPassword = process.env.ADMIN_PASSWORD
  if (!adminPassword) {
    throw new Error('ADMIN_PASSWORD is not configured')
  }
  return password === adminPassword
}
