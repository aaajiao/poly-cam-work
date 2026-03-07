import { clearSessionCookieHeader } from '../_lib/auth'
import { jsonResponse, methodNotAllowed } from '../_lib/http'

export default async function handler(request: Request) {
  if (request.method !== 'POST') {
    return methodNotAllowed(['POST'])
  }

  return jsonResponse({ ok: true }, 200, {
    'Set-Cookie': clearSessionCookieHeader(),
  })
}
