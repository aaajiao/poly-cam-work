# api/ — Vercel Functions API

12 route handlers + 9 shared utilities. All use `export default { fetch: handler }` format.

## Route Map

| Route | Methods | Auth | Purpose |
|-------|---------|------|---------|
| `/api/auth/login` | POST | — | Password → HMAC-SHA256 session cookie (7-day) |
| `/api/auth/session` | GET | — | Check authentication status |
| `/api/auth/logout` | POST | — | Clear session cookie |
| `/api/draft/:sceneId` | GET, PUT | ✓ | Load/save draft with revision conflict detection (409) |
| `/api/publish/:sceneId` | GET, POST, DELETE | ✓ | List versions, create immutable release, delete version |
| `/api/release/:sceneId` | GET | — | Read live or specific version (public) |
| `/api/rollback/:sceneId` | POST | ✓ | Revert live pointer to previous version |
| `/api/intro/:sceneId` | GET, PUT | GET: conditional, PUT: ✓ | Intro preset snapshot management |
| `/api/models` | GET, POST | GET: —, POST: ✓ | Model catalog CRUD (create, upsert, replace) |
| `/api/models/upload` | POST | ✓ | Vercel Blob client upload token for GLB/PLY |
| `/api/media/upload` | POST | token: ✓ | Vercel Blob client upload token for images |
| `/api/discover/local-models` | GET | — | Scan `public/models/` for GLB+PLY pairs |

## Shared Utilities (`_lib/`)

| File | Role |
|------|------|
| `http.ts` | `jsonResponse`, `badRequest`, `unauthorized`, `notFound`, `conflict`, `methodNotAllowed` |
| `auth.ts` | Session cookie: HMAC-SHA256 signing, timing-safe verify, 7-day expiry |
| `blobStore.ts` | Vercel Blob read/write/list/delete with cache bypass |
| `blobToken.ts` | Token resolution: `POLYCAM_BLOB_READ_WRITE_TOKEN` or legacy fallback |
| `modelRegistry.ts` | `models/index.json` CRUD with retry logic (4 attempts) |
| `modelValidation.ts` | URL validation, ID sanitization (`cloud-` prefix), deduplication |
| `sceneAssetCleanup.ts` | Image GC: reconcile referenced vs stale images across draft + releases |
| `modelAssetCleanup.ts` | Model asset cleanup: delete stale GLB/PLY on replace |
| `discovery.ts` | Local model discovery: validate GLB/PLY headers in `public/models/` |

## Blob Storage Paths

```
scenes/{sceneId}/draft.json
scenes/{sceneId}/live.json                      # { version: N }
scenes/{sceneId}/releases/{version}.json        # Immutable
scenes/{sceneId}/intro/draft.json
scenes/{sceneId}/intro/releases/{version}.json
scenes/{sceneId}/images/{annotationId}/*
models/index.json                               # Registry
```

## Conventions

- **Handler format**: `export default { fetch: async (req: Request) => Response }`
- **Imports MUST use `.js` extensions**: `from '../_lib/auth.js'` — Vercel Node.js ESM requires it. Bun resolves without them locally but **production breaks**.
- **Error responses**: Always use `_lib/http.ts` helpers, never raw `new Response()`.
- **Auth check**: `requireAuth(req)` returns boolean; 401 via `unauthorized()`.
- **Conflict handling**: Draft PUT sends `expectedRevision`; server returns 409 on mismatch.

## Adding a New Route

1. Create `api/{domain}/[param].ts` or `api/{domain}/index.ts`
2. Use `export default { fetch: handler }` format
3. Import from `../_lib/*.js` (note `.js` extension)
4. Register route in `api/dev-server.ts` routes map
5. Add frontend client function in `src/lib/*.ts`
6. Wire into `viewerStore` action if state mutation needed

## Anti-Patterns

- Importing without `.js` extension (works locally, breaks on Vercel)
- Using named exports instead of `export default { fetch: handler }`
- Raw `new Response()` instead of `_lib/http.ts` helpers
- Bypassing `requireAuth()` on protected routes
- Storing mutable state in route handlers (Functions are stateless)
