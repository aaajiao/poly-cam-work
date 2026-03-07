import { existsSync, readFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import path from 'node:path'

type ApiHandlerModule = {
  default: (request: Request) => Response | Promise<Response>
}

type Route = {
  pattern: RegExp
  load: () => Promise<ApiHandlerModule>
}

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return

  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const splitIndex = trimmed.indexOf('=')
    if (splitIndex <= 0) continue

    const key = trimmed.slice(0, splitIndex).trim()
    if (!key || process.env[key] !== undefined) continue

    const rawValue = trimmed.slice(splitIndex + 1).trim()
    const quotedDouble = rawValue.startsWith('"') && rawValue.endsWith('"')
    const quotedSingle = rawValue.startsWith("'") && rawValue.endsWith("'")
    const value = quotedDouble || quotedSingle ? rawValue.slice(1, -1) : rawValue
    process.env[key] = value
  }
}

loadEnvFile(path.resolve(process.cwd(), '.env'))
loadEnvFile(path.resolve(process.cwd(), '.env.local'))

const routes: Route[] = [
  {
    pattern: /^\/api\/auth\/login\/?$/,
    load: () => import('./auth/login.ts'),
  },
  {
    pattern: /^\/api\/auth\/logout\/?$/,
    load: () => import('./auth/logout.ts'),
  },
  {
    pattern: /^\/api\/media\/upload\/?$/,
    load: () => import('./media/upload.ts'),
  },
  {
    pattern: /^\/api\/draft\/[^/]+\/?$/,
    load: () => import('./draft/[sceneId].ts'),
  },
  {
    pattern: /^\/api\/publish\/[^/]+\/?$/,
    load: () => import('./publish/[sceneId].ts'),
  },
  {
    pattern: /^\/api\/release\/[^/]+\/?$/,
    load: () => import('./release/[sceneId].ts'),
  },
  {
    pattern: /^\/api\/rollback\/[^/]+\/?$/,
    load: () => import('./rollback/[sceneId].ts'),
  },
]

const port = Number.parseInt(process.env.API_PORT ?? '3000', 10)

async function toRequest(req: IncomingMessage): Promise<Request> {
  const method = req.method ?? 'GET'
  const host = req.headers.host ?? `localhost:${port}`
  const url = `http://${host}${req.url ?? '/'}`

  const headers = new Headers()
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(name, item)
      }
      continue
    }

    if (typeof value === 'string') {
      headers.set(name, value)
    }
  }

  if (method === 'GET' || method === 'HEAD') {
    return new Request(url, { method, headers })
  }

  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }

  const body = Buffer.concat(chunks)
  return new Request(url, {
    method,
    headers,
    body: body.length > 0 ? body : undefined,
  })
}

async function writeResponse(serverRes: ServerResponse, response: Response) {
  serverRes.statusCode = response.status
  response.headers.forEach((value, key) => {
    serverRes.setHeader(key, value)
  })

  const payload = Buffer.from(await response.arrayBuffer())
  serverRes.end(payload)
}

createServer(async (req, res) => {
  const pathname = (req.url ?? '').split('?')[0] || '/'
  const route = routes.find((candidate) => candidate.pattern.test(pathname))

  if (!route) {
    await writeResponse(
      res,
      new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    return
  }

  try {
    const request = await toRequest(req)
    const module = await route.load()
    const response = await module.default(request)
    await writeResponse(res, response)
  } catch (error) {
    console.error('[api-dev] route error', pathname, error)
    await writeResponse(
      res,
      new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    )
  }
}).listen(port, () => {
  console.log(`[api-dev] listening on http://localhost:${port}`)
})
