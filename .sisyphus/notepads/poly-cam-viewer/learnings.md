## Task 1: Vite + React + TypeScript + 3D deps initialization

### Dependency Compatibility Issues
- `@react-three/fiber@^9` requires React 19 (peer: `>=19 <19.3`)
- `@react-three/drei@^9` (latest 9.x) requires `@react-three/fiber@^8` — incompatible with R3F v9
- Used `--legacy-peer-deps` to force install both; they work at runtime despite peer dep mismatch
- `@react-spring/three` (drei dep) requires React 18, but works with React 19 in practice

### tsconfig.node.json for Vite config
- `composite: true` is required when using `references` in tsconfig.json
- `composite: true` is incompatible with `noEmit: true` — remove noEmit from tsconfig.node.json
- `allowImportingTsExtensions` requires `noEmit` or `emitDeclarationOnly` — remove it from tsconfig.node.json
- Add `"types": ["node"]` and install `@types/node` for `path` module and `__dirname` in vite.config.ts

### npm create vite workaround
- `npm create vite@latest . -- --template react-ts` cancels if directory is non-empty
- Solution: manually scaffold all files (package.json, index.html, src/main.tsx, etc.)

### Tailwind v4
- Uses `@tailwindcss/vite` plugin (no postcss config needed)
- `src/index.css` only needs `@import "tailwindcss";`
