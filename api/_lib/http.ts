export function jsonResponse(body: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  })
}

export function methodNotAllowed(allowed: string[]) {
  return jsonResponse({ error: 'Method not allowed' }, 405, {
    Allow: allowed.join(', '),
  })
}

export function unauthorized() {
  return jsonResponse({ error: 'Unauthorized' }, 401)
}

export function badRequest(message: string) {
  return jsonResponse({ error: message }, 400)
}

export function notFound(message = 'Not found') {
  return jsonResponse({ error: message }, 404)
}

export function conflict(message: string) {
  return jsonResponse({ error: message }, 409)
}
