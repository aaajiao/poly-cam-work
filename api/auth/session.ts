import { requireAuth } from '../_lib/auth'
import { jsonResponse, methodNotAllowed } from '../_lib/http'

export default async function handler(request: Request) {
  if (request.method !== 'GET') {
    return methodNotAllowed(['GET'])
  }

  return jsonResponse({ authenticated: requireAuth(request) })
}
