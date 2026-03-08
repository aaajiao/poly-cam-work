# Testing Workflow

Use the smallest test layer that can prove the change.

This repository uses three layers:

1. Vitest unit tests for pure logic and store transitions.
2. Vitest browser integration tests for real-browser UI interactions.
3. Playwright E2E for smoke-level full-app checks only.

The main source of confusion is that this repo uses Playwright in two different roles. `vitest.config.ts` uses `@vitest/browser-playwright` for browser integration, while `playwright.config.ts` runs the separate Playwright E2E smoke suite.

## Command Selection

| If you changed... | Run... | Why |
| --- | --- | --- |
| Pure helpers, math, parser logic, store transitions | `bun run test:vitest:unit` | Fast jsdom/unit coverage is enough. |
| Sidebar, toolbar, annotation, publish, viewer UI interactions | `bun run test:vitest:browser` | This is the primary path for component and store integration through a real browser. |
| App boot, shell integrity, or a critical full-runtime smoke path | `bun run test:e2e` | This uses Playwright's own runner against the app served on `http://localhost:5173`. |
| Debug a smoke E2E interactively | `bun run test:e2e:ui` | UI mode is useful for debugging, but it stays interactive until you stop it. |
| Verify the main repo test suite before shipping a code change | `bun run test:vitest` | Runs both unit and browser Vitest projects. |

## The Two Playwright Paths

### Vitest browser integration

- Command: `bun run test:vitest:browser`
- Config: `vitest.config.ts`
- Browser provider: `@vitest/browser-playwright`
- Best for: component interactions, lazy-loaded UI, state + UI integration, `data-testid` contracts

Choose this by default when the question is "does this UI behavior work in a real browser?"

### Vitest browser debugging

Use this layer first when debugging component interactions, lazy-loaded editor UI, or store-driven rendering.

Useful commands:

- Run the browser suite once: `bun run test:vitest:browser`
- Re-run browser tests in watch mode: `bun run test:watch -- --project browser`
- Focus one file: `bun run test:vitest:browser -- src/__tests__/browser/viewer.test.tsx`
- Focus one test name: `bun run test:vitest:browser -- -t "view mode toggle"`
- Use Vitest UI for interactive filtering: `bunx vitest --ui --project browser`

Repo-specific debugging habits:

- Browser tests in `src/__tests__/browser/` are async. Keep `await render(...)`, `await expect.element(...)`, and awaited interactions instead of mixing in synchronous DOM checks too early.
- Most files reset persisted zustand state with `localStorage.removeItem('polycam-viewer-state')` plus `useViewerStore.setState(...)` in `beforeEach()`. If a test passes alone but fails in the suite, check for leaked store state first.
- Many browser tests mock API modules at file scope with `vi.mock(...)` and then restore/reseed them in `beforeEach()`. If async UI never settles, check whether a mock was cleared by `vi.restoreAllMocks()` and not reconfigured.
- Lazy-loaded UI in `Toolbar` and `Sidebar` should usually be asserted with awaited visibility checks, not immediate `querySelector` reads. If login, publish, file manager, or annotation UI seems missing, suspect lazy-boundary timing before suspecting E2E/runtime issues.
- Stable `data-testid` values are part of the test contract in this repo. When a browser test breaks after a UI refactor, check selector drift before expanding coverage to Playwright E2E.

Common browser-test failure patterns here:

- **State leak**: wrong active scene, auth state, or draft state appears from a previous test. Reset store and persisted local storage first.
- **Mock mismatch**: mocked publish/model/storage functions were not reseeded after restoring mocks, so the UI waits forever or renders the wrong branch.
- **Lazy UI not settled**: a component behind `React.lazy` has not resolved yet; wait on the visible element you actually care about.
- **Wrong layer**: if you reached for `bun run test:e2e` to debug a toolbar/sidebar/annotation interaction, move back to `bun run test:vitest:browser` unless the bug truly needs full app runtime.

Practical defaults for this repo:

- `viewer.test.tsx`, `tools.test.tsx`, and `annotations.test.tsx` are the right starting points for most interaction regressions.
- `toolbarLazyUi.test.tsx` and `sidebarLazyUi.test.tsx` are the right place to debug lazy-loading boundary issues.
- `publishButton.test.tsx` is the first stop for publish control visibility, version menu, rollback, and delete behavior.

### Playwright smoke E2E

- Command: `bun run test:e2e`
- Config: `playwright.config.ts`
- Current suite: `e2e/smoke.test.ts`
- Best for: app shell integrity and a very small number of critical runtime checks

Do not default to Playwright E2E for annotation, sidebar, toolbar, or publish interaction coverage if browser Vitest can prove the behavior.

## Local Playwright Behavior In This Repo

`bun run test:e2e` uses the `webServer` setting in `playwright.config.ts`:

- it starts `bun run dev`,
- waits for `http://localhost:5173`,
- reuses an existing local server when `CI` is not set.

That reuse is convenient when the dev server is healthy, but it is also the most likely reason Playwright looks stuck locally.

## Common "Playwright Is Hanging" Cases

### 1. `bun run test:e2e:ui` looks stuck

This is often expected. UI mode is interactive and keeps running until you close it with Ctrl+C.

Use it only when you want Playwright's visual debugger. For normal smoke runs, prefer `bun run test:e2e`.

### 2. Playwright is waiting for the app server

`test:e2e` expects the frontend on `http://localhost:5173`.

If the terminal appears stuck while waiting for the server:

- check whether another process already owns port `5173`,
- stop any stale `bun run dev` process,
- rerun `bun run test:e2e` from a clean shell.

Because local runs reuse an existing server, Playwright may attach to a bad or half-started dev server instead of starting a fresh one.

### 3. You are debugging the wrong layer

If the failure is about component behavior, list interactions, panel layout, lazy-loaded UI, or store-driven rendering, start with `bun run test:vitest:browser`.

Using Playwright E2E for those cases usually adds extra server/process complexity without better signal.

### 4. You actually need API runtime, not just the frontend

The current E2E suite is smoke-only and does not cover the full publish/auth workflow.

If you are debugging behavior that depends on local API routes, run `bun run dev:api` separately as needed. Do not assume `bun run test:e2e` starts the API server for you.

### 5. A debugging helper was left in Playwright code

If you temporarily add things like `page.pause()` while debugging Playwright tests, remove them before treating the run as a normal automated check.

## Authoring Rules

- Prefer unit tests for pure logic and browser Vitest for most UI behavior.
- Keep Playwright E2E smoke-level and high-value.
- Do not duplicate browser-integration coverage in E2E unless the behavior truly needs full app runtime.
- Keep using stable `data-testid` selectors for interactive UI tested through browser or E2E flows.

## Practical Defaults

- Adding or changing a tool/sidebar/toolbar interaction: start with `bun run test:vitest:browser`.
- Changing parser/math/store logic: start with `bun run test:vitest:unit`.
- Verifying the app still boots and renders the shell: run `bun run test:e2e`.
- Reaching for `bun run test:e2e:ui` first is usually a debugging choice, not the default workflow.
