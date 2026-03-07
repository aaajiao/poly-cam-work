import { createSessionCookieHeader, validateLoginPassword } from '../_lib/auth'
import { badRequest, jsonResponse, methodNotAllowed } from '../_lib/http'

interface LoginBody {
  password?: string
}

export default async function handler(request: Request) {
  if (request.method !== 'POST') {
    return methodNotAllowed(['POST'])
  }

  const body = (await request.json().catch(() => null)) as LoginBody | null
  const password = body?.password
  if (typeof password !== 'string' || password.length === 0) {
    return badRequest('password is required')
  }

  if (!validateLoginPassword(password)) {
    return jsonResponse({ error: 'Invalid credentials' }, 401)
  }

  return jsonResponse({ ok: true }, 200, {
    'Set-Cookie': createSessionCookieHeader(request),
  })
}
