# __tests__/ — Test Suite

26 unit tests (jsdom) + 8 browser tests (Playwright) + 1 E2E smoke suite.

## Test Layers

| Layer | Location | Environment | Run Command |
|-------|----------|-------------|-------------|
| Unit | `*.test.ts` | jsdom | `bun run test:vitest:unit` |
| Browser | `browser/*.test.tsx` | Playwright (Chromium) | `bun run test:vitest:browser` |
| E2E | `e2e/smoke.test.ts` | Playwright | `bun run test:e2e` |

## When to Use Which

| Changed | Layer |
|---------|-------|
| Pure helpers, math, store logic, API route handlers | Unit |
| Sidebar, toolbar, annotation UI, publish UI, component interactions | Browser |
| App shell boot, critical runtime smoke | E2E (keep minimal) |

## Unit Test Pattern

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useViewerStore } from '@/store/viewerStore'

describe('feature', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.removeItem('polycam-viewer-state')
    useViewerStore.setState({ activeSceneId: 'scan-a', ... })
  })

  it('does something', () => {
    useViewerStore.getState().action()
    expect(useViewerStore.getState().field).toBe(value)
  })
})
```

## Browser Test Pattern

```typescript
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'

vi.mock('@/lib/publishApi', () => ({ ... }))

describe('component', () => {
  beforeEach(() => { vi.restoreAllMocks(); resetStore() })

  test('interaction', async () => {
    const screen = await render(<Component />)
    await expect.element(screen.getByTestId('id')).toBeVisible()
    await screen.getByTestId('button').click()
  })
})
```

## API Route Test Pattern

```typescript
const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  readJsonBlob: vi.fn(),
}))
vi.mock('../../api/_lib/auth', () => ({ requireAuth: mocks.requireAuth }))

import handlerModule from '../../api/publish/[sceneId]'
const handler = handlerModule.fetch

it('returns 401', async () => {
  mocks.requireAuth.mockReturnValue(false)
  const res = await handler(new Request('http://localhost/api/publish/scan-a'))
  expect(res.status).toBe(401)
})
```

## Mock Strategies

- **Module mocking**: `vi.hoisted()` + `vi.mock()` at file scope for API deps
- **Spy mocking**: `vi.spyOn(module, 'fn')` for runtime interception
- **Typed mocks**: `vi.mocked(fn)` for type-safe mock setup
- **Three.js**: No mocking needed — tests use real `THREE.Vector3` etc.

## Key Conventions

- Store reset in **every** `beforeEach`: `localStorage.removeItem('polycam-viewer-state')` + `setState()`
- `vi.restoreAllMocks()` before each test
- Browser tests use `await expect.element(...)` (async DOM assertions)
- `data-testid` is kebab-case: `"scene-item-scan-a"`, `"view-mode-mesh"`
- No `as any` in test code — strict types everywhere
- E2E suite is smoke-only (39 lines). Do NOT expand to cover what browser Vitest can prove.
