## Types & Store Setup (2026-03-05)
- Pre-existing TS errors in `src/components/ui/*.tsx` (missing `@/lib/utils`) — not introduced by our work
- `zustand` `persist` middleware with `partialize` works cleanly for selective persistence
- `@/` path alias resolves correctly in both `src/types/` and `src/store/`
- `useActiveScene` selector helper merges `scenes` + `uploadedScenes` arrays for unified lookup

## T4: Test Infrastructure Setup (2026-03-05)

### Vitest Unit Tests
- Config: `vitest.config.ts` with jsdom environment, globals, `@/` alias
- Setup file: `src/__tests__/setup.ts` imports `@testing-library/jest-dom`
- Store tests: `src/__tests__/store.test.ts` — 8 tests all passing
- Zustand store supports `setState()` for test resets (works with persist middleware)
- `useViewerStore.getState()` works in jsdom without React context

### Playwright E2E
- Config: `playwright.config.ts` — chromium only, webServer auto-starts `npm run dev`
- Smoke tests: `e2e/smoke.test.ts` — tests layout elements via `data-testid` selectors
- E2E tests require `data-testid` attributes on: sidebar, toolbar, canvas-container, statusbar, sidebar-toggle

### Scripts added to package.json
- `test`: vitest run (one-shot)
- `test:watch`: vitest (watch mode)
- `test:e2e`: playwright test
- `test:e2e:ui`: playwright test --ui

### Versions installed
- vitest: ^4.0.18
- @playwright/test: ^1.58.2
- @testing-library/react: ^16.3.2
- @testing-library/jest-dom: ^6.9.1

## T5: shadcn/ui + Layout Skeleton (2026-03-05)

### shadcn/ui Init with React 19 + Tailwind v4
- `npx shadcn@latest init --defaults` works but npm install inside it fails due to `@react-three/drei` peer conflict
- Fix: add `.npmrc` with `legacy-peer-deps=true` — shadcn's internal npm calls then succeed
- shadcn v3 generates `components.json` with `style: "new-york"` and sets up CSS vars in `src/index.css`
- CSS init adds `@import "tw-animate-css"` and `@import "shadcn/tailwind.css"` which use `"style"` exports
- **Problem**: `"style"` export condition not resolved by @tailwindcss/vite CSS processor
- **Fix**: Replace with direct paths: `@import "../node_modules/tw-animate-css/dist/tw-animate.css"` and `@import "../node_modules/shadcn/dist/tailwind.css"`

### shadcn Component Add
- `npx shadcn@latest add button slider toggle-group tooltip separator badge dialog --overwrite` works once `.npmrc` has `legacy-peer-deps=true`
- Creates: button, slider, tooltip, separator, badge, dialog, toggle, toggle-group in `src/components/ui/`
- `shadcn add` does NOT create `src/lib/utils.ts` — must create manually when `init` fails mid-way

### Layout Architecture
- `Layout.tsx` uses `useState` for sidebar open/close — controlled locally, no store
- Sidebar width: `w-72` (288px) open, `w-12` (48px) collapsed via Tailwind classes
- All regions have `data-testid` for Playwright: sidebar, sidebar-toggle, toolbar, canvas-container, statusbar
