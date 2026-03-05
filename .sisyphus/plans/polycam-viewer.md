# Polycam 3D Data Visualization Web Tool

## TL;DR

> **Quick Summary**: 基于 React Three Fiber 构建一个全功能的 Polycam 3D 扫描数据可视化 Web 工具，支持 GLB 纹理网格和 PLY 彩色点云的查看、切换、测量、切割、着色、标注和导出。
> 
> **Deliverables**:
> - 完整的 Vite + React + TypeScript SPA 项目
> - 3D 查看器（轨道控制、光照、环境）
> - GLB 网格 ↔ PLY 点云双模式切换
> - 侧边栏文件管理器（3 组扫描 + 拖拽上传）
> - 测量工具（两点距离、面积）
> - 截面切割平面（交互式）
> - 点云颜色映射（高度/密度/自定义）
> - 3D 标注系统
> - 截图导出
> - Vitest + Playwright 测试套件
> 
> **Estimated Effort**: Large
> **Parallel Execution**: YES - 5 waves
> **Critical Path**: Task 1 → Task 3 → Task 7/8 → Task 12 → Task 17 → Task 20 → Final

---

## Context

### Original Request
用户有 Polycam (https://poly.cam/) 导出的 3D 扫描数据（3 个 GLB 文件 + 3 个 PLY 文件），需要做成一个基于 Web 的数据可视化工具。用户选择了方案 A（React Three Fiber 全家桶），并选中了全部 9 项功能。

### Data Profile

**PLY 文件（彩色点云）**:
| 文件 | 点数 | 大小 | 空间范围 (米) |
|------|------|------|--------------|
| 00.ply | 1,300,420 | 34 MB | 5.2 × 13.1 × 3.1 |
| 01.ply | **5,107,900** | **132 MB** | 13.0 × 16.4 × 4.2 |
| 02.ply | 1,483,000 | 39 MB | 14.3 × 19.2 × 4.3 |

- 格式：Binary little-endian, `"Created by Polycam"`
- 每点：x, y, z (float64) + red, green, blue (uint8) = 27 bytes/point
- 无法线、无面片 — 纯彩色点云

**GLB 文件（带纹理网格）**:
| 文件 | 网格数 | 顶点数 | 三角面数 | 纹理(JPEG) | 大小 |
|------|--------|--------|----------|-----------|------|
| 00.glb | 5 | 255,395 | ~431K | 5 | 15.4 MB |
| 01.glb | 14 | 65,021 | ~78K | 14 | 25.7 MB |
| 02.glb | 12 | 74,150 | ~88K | 12 | 26.2 MB |

- glTF 2.0, PBR 材质 (metallicFactor=0), 每 mesh 一张 JPEG baseColorTexture

### Interview Summary
**Key Discussions**:
- **框架**: Vite + React 19 + TypeScript (SPA) — 轻量快速，无需后端
- **功能范围**: 全部 9 项功能均选中
- **测试策略**: Vitest + Playwright (从零搭建)
- **技术选型**: R3F v9 (stable) + drei v9 + Three.js r175+ + zustand + shadcn/ui + Tailwind
- **Metis 发现**: R3F v10 是 alpha，改用 v9 (stable, 支持 React 19)

**Research Findings**:
- Three.js PLYLoader 原生支持 binary PLY → BufferGeometry
- GLTFLoader 原生支持 GLB 全 PBR
- @react-three/drei 提供 useGLTF, OrbitControls, Html, Stats, GizmoHelper
- Three.js 原生 ClippingPlane API + renderer.localClippingEnabled
- Raycaster 支持 Points 几何体 (intersectObjects with Points)
- `gl.domElement.toDataURL('image/png')` 用于截图
- PLY float64 坐标需在 Worker 中转 Float32 以节省 GPU 内存
- 5.1M 点的 PLY (132MB) 是主要性能瓶颈 → WebWorker 解析 + 可选降采样
- Potree-core 对 <10M 点来说过重，Three.js Points + 自定义 shader 足够

### Metis Review (Critical Findings)

**Issue 1: PLY↔GLB 文件配对错误 ⚠️**
文件编号不是一一对应的！Metis 通过 bounding box 对齐分析发现正确配对：
| 扫描 | PLY 文件 | GLB 文件 | 说明 |
|------|---------|---------|------|
| Scan A | `00.ply` (34MB) | `01.glb` (26MB) | 走廊 5×3×13m |
| Scan B | `01.ply` (132MB) | `00.glb` (16MB) | 大房间 12×4×16m |
| Scan C | `02.ply` (39MB) | `02.glb` (27MB) | 多房间 14×4×19m |
→ 已修正到 presetScenes 配置中

**Issue 2: 坐标系不对齐 ⚠️**
- PLY: Z-up (Polycam 扫描约定)
- GLB: Y-up (glTF 标准)
- 变换公式: `PLY(x, y, z) → Scene(x, z, -y)` = 对 PLY 组应用 `rotation.x = -Math.PI/2`

**Issue 3: R3F 版本 ⚠️**
- R3F v10 是 alpha (不稳定) → 改用 v9 (stable, 支持 React 19)

**Issue 4: BVH 必需 ⚠️**
- 5.1M 点的 raycasting 无 BVH = O(n) = 50-200ms/ray → 不可用
- 需要 drei `<Bvh>` 或 `three-mesh-bvh` → O(log n) = 0.5-2ms/ray

**Issue 5: GLB doubleSided: false ⚠️**
- 裁切面会暴露空洞内部 → 裁切激活时需设 `material.side = THREE.DoubleSide`

**Issue 6: 面积测量限制**
- 点云没有面片，面积测量只能在 GLB 网格上使用

**已融入计划的缓解措施**:
- 修正 presetScenes 文件配对
- PLY 加载时应用坐标变换
- R3F 版本锁定 v9
- 测量工具强制使用 BVH
- 裁切面激活时切换 DoubleSide
- 面积测量限制为 mesh-only

---

## Work Objectives

### Core Objective
构建一个生产级的 Web 3D 可视化工具，能够加载、渲染和交互式分析 Polycam 导出的 GLB 纹理网格和 PLY 彩色点云数据。

### Concrete Deliverables
- `src/` — 完整的 React + TypeScript 源码
- `public/models/` — 预置的 3 组 GLB + PLY 数据文件
- 可部署的 SPA（`npm run build` → `dist/`）
- Vitest 单元测试 + Playwright E2E 测试

### Definition of Done
- [ ] `npm run dev` 启动后在浏览器中可正常加载和渲染全部 3 组 GLB 和 PLY 文件
- [ ] 全部 9 项功能可正常工作
- [ ] `npm run build` 零错误
- [ ] `npm run test` 全部通过
- [ ] Playwright E2E 截图验证通过

### Must Have
- 全部 3 个 GLB 文件可正常加载和渲染（带纹理）
- 全部 3 个 PLY 文件可正常加载和渲染（带顶点色）
- 132MB 的 01.ply 加载时有进度指示，不阻塞 UI
- 点云 ↔ 网格可切换，坐标系对齐
- 测量工具支持两点距离
- 截面切割支持至少一个轴向平面
- 颜色映射至少支持按高度 (Z) 着色
- 标注可在 3D 空间中添加和显示
- 截图可保存为 PNG
- 拖拽上传支持 .glb 和 .ply 文件

### Must NOT Have (Guardrails)
- ❌ 后端服务器 / API / 数据库 — 纯前端 SPA
- ❌ 用户认证 / 登录
- ❌ 协作编辑 / 实时同步
- ❌ AR/VR/WebXR 功能
- ❌ 过度抽象 — 不要做通用 3D 引擎，只做 Polycam 查看器
- ❌ 自定义 3D 文件格式转换管线
- ❌ 不必要的动画效果
- ❌ `as any` / `@ts-ignore` — 严格类型
- ❌ 空 catch 块
- ❌ console.log 在生产代码中（dev-only 除外）
- ❌ 未使用的导入
- ❌ 过度注释（只在复杂逻辑处注释）

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: NO (greenfield project)
- **Automated tests**: YES — Tests-after (implementation first, then tests)
- **Framework**: Vitest (unit/component) + Playwright (E2E visual)
- **Setup included**: Wave 1 contains test infrastructure setup task

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright — Navigate, interact, assert DOM, screenshot
- **3D Rendering**: Playwright screenshot + pixel comparison
- **Point Cloud Loading**: Bash (node) — verify parse output
- **Build/TypeCheck**: Bash — `npm run build`, `npx tsc --noEmit`

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — Start Immediately, 6 parallel):
├── Task 1: Vite + React + TS project scaffolding + deps          [quick]
├── Task 2: Tailwind + shadcn/ui + layout skeleton                [visual-engineering]
├── Task 3: zustand store + TypeScript types                      [quick]
├── Task 4: WebWorker PLY parser                                  [deep]
├── Task 5: Vitest + Playwright test infrastructure               [quick]
└── Task 6: Copy data files to public/models/                     [quick]

Wave 2 (Core 3D Engine — After Wave 1, 5 parallel):
├── Task 7: GLB viewer (useGLTF + orbit + lights)         (depends: 1,3,6) [deep]
├── Task 8: PLY point cloud viewer (PLYLoader + Points)   (depends: 1,3,4,6) [deep]
├── Task 9: File manager sidebar UI                       (depends: 2,3) [visual-engineering]
├── Task 10: Drag-and-drop upload                         (depends: 1,3) [unspecified-high]
└── Task 11: Screenshot/export                            (depends: 1,3) [quick]

Wave 3 (Mode Switching + Advanced Tools — After Wave 2, 5 parallel):
├── Task 12: Point cloud ↔ mesh toggle                   (depends: 7,8,9) [deep]
├── Task 13: Measurement tool — distance                  (depends: 7,8) [deep]
├── Task 14: Clipping plane                               (depends: 7,8) [deep]
├── Task 15: Color mapping (point cloud)                  (depends: 8) [deep]
└── Task 16: Annotation system                            (depends: 7,8) [unspecified-high]

Wave 4 (Integration + Polish — After Wave 3, 4 parallel):
├── Task 17: Toolbar + mode switching UI                  (depends: 12-16) [visual-engineering]
├── Task 18: Loading states + error handling + perf       (depends: 7,8,10) [unspecified-high]
├── Task 19: Unit tests (Vitest)                          (depends: 5, 7-16) [unspecified-high]
└── Task 20: E2E tests (Playwright)                       (depends: 5, 17, 18) [unspecified-high]

Wave FINAL (Verification — After ALL, 4 parallel):
├── Task F1: Plan compliance audit                        [oracle]
├── Task F2: Code quality review                          [unspecified-high]
├── Task F3: Real manual QA (Playwright)                  [unspecified-high]
└── Task F4: Scope fidelity check                         [deep]

Critical Path: T1 → T3 → T7/T8 → T12 → T17 → T20 → Final
Parallel Speedup: ~65% faster than sequential
Max Concurrent: 6 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 7,8,10,11 | 1 |
| 2 | — | 9,17 | 1 |
| 3 | — | 7,8,9,10,11,12-16 | 1 |
| 4 | — | 8 | 1 |
| 5 | — | 19,20 | 1 |
| 6 | — | 7,8 | 1 |
| 7 | 1,3,6 | 12,13,14,16,17 | 2 |
| 8 | 1,3,4,6 | 12,13,14,15,16,17 | 2 |
| 9 | 2,3 | 12,17 | 2 |
| 10 | 1,3 | 18 | 2 |
| 11 | 1,3 | 17 | 2 |
| 12 | 7,8,9 | 17 | 3 |
| 13 | 7,8 | 17 | 3 |
| 14 | 7,8 | 17 | 3 |
| 15 | 8 | 17 | 3 |
| 16 | 7,8 | 17 | 3 |
| 17 | 12-16 | 20 | 4 |
| 18 | 7,8,10 | 20 | 4 |
| 19 | 5,7-16 | — | 4 |
| 20 | 5,17,18 | — | 4 |

### Agent Dispatch Summary

- **Wave 1** (6 tasks): T1 → `quick`, T2 → `visual-engineering`, T3 → `quick`, T4 → `deep`, T5 → `quick`, T6 → `quick`
- **Wave 2** (5 tasks): T7 → `deep`, T8 → `deep`, T9 → `visual-engineering`, T10 → `unspecified-high`, T11 → `quick`
- **Wave 3** (5 tasks): T12 → `deep`, T13 → `deep`, T14 → `deep`, T15 → `deep`, T16 → `unspecified-high`
- **Wave 4** (4 tasks): T17 → `visual-engineering`, T18 → `unspecified-high`, T19 → `unspecified-high`, T20 → `unspecified-high`
- **Final** (4 tasks): F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.

- [ ] 1. Vite + React + TypeScript 项目脚手架

  **What to do**:
  - 用 `npm create vite@latest . -- --template react-ts` 初始化项目（注意在当前目录，不要创建子目录）
  - 安装核心依赖：`three`, `@react-three/fiber@^9`, `@react-three/drei@^9`, `zustand`, `@types/three`（注意：R3F 用 v9 稳定版，不要用 v10 alpha）
  - 安装 UI 依赖：`tailwindcss`, `@tailwindcss/vite`, `shadcn` (用 shadcn init 初始化)
  - 配置 `vite.config.ts`：设置 `assetsInclude: ['**/*.glb', '**/*.ply']`，配置 worker 支持
  - 配置 `tsconfig.json`：strict mode, paths alias (`@/` → `src/`)
  - 配置 tailwindcss v4 (通过 `@tailwindcss/vite` 插件 + `@import "tailwindcss"` in CSS)
  - 创建基本目录结构：
    ```
    src/
    ├── components/    # React 组件
    │   ├── viewer/    # 3D 查看器组件
    │   ├── sidebar/   # 侧边栏
    │   ├── toolbar/   # 工具栏
    │   └── ui/        # shadcn/ui 组件
    ├── hooks/         # 自定义 hooks
    ├── store/         # zustand stores
    ├── types/         # TypeScript 类型定义
    ├── workers/       # WebWorker
    ├── utils/         # 工具函数
    └── lib/           # shadcn/ui utils
    ```
  - 创建 `src/App.tsx` 入口：基本的 layout shell（左侧 sidebar + 右侧 canvas 区域）
  - 验证 `npm run dev` 可启动，浏览器能打开

  **Must NOT do**:
  - 不要安装 Next.js 或任何 SSR 框架
  - 不要安装 potree-core（目前不需要）
  - 不要创建复杂的路由系统

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 标准脚手架操作，步骤明确
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: 此任务不涉及 UI 设计

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2,3,4,5,6)
  - **Blocks**: Tasks 7,8,9,10,11
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - 无（greenfield 项目）

  **API/Type References**:
  - Vite React TS template: `npm create vite@latest`

  **External References**:
  - Vite 官方文档: https://vitejs.dev/guide/
  - React Three Fiber 安装: https://r3f.docs.pmnd.rs/getting-started/installation
  - shadcn/ui Vite 安装: https://ui.shadcn.com/docs/installation/vite
  - Tailwind CSS v4 Vite: https://tailwindcss.com/docs/installation/vite

  **WHY Each Reference Matters**:
  - Vite template 确保 React 19 + TS 5 正确配置
  - R3F 安装文档有 peer dependency 要求（three 版本匹配）
  - shadcn/ui 需要 tailwindcss + 特定配置结构

  **Acceptance Criteria**:
  - [ ] `npm run dev` → 浏览器打开 localhost:5173 显示页面
  - [ ] `npx tsc --noEmit` → 零错误
  - [ ] package.json 包含 three, @react-three/fiber, @react-three/drei, zustand
  - [ ] tailwindcss 配置正确，样式生效
  - [ ] src/ 目录结构完整

  **QA Scenarios**:

  ```
  Scenario: Dev server starts successfully
    Tool: Bash
    Preconditions: npm install completed
    Steps:
      1. Run `npm run dev` in background
      2. Wait 5 seconds for server startup
      3. `curl -s http://localhost:5173` → check HTTP 200
      4. Verify response contains `<div id="root">`
    Expected Result: HTTP 200 with React root element
    Failure Indicators: Connection refused, 404, or missing root div
    Evidence: .sisyphus/evidence/task-1-dev-server.txt

  Scenario: TypeScript strict mode works
    Tool: Bash
    Preconditions: Project scaffolded
    Steps:
      1. Run `npx tsc --noEmit`
      2. Check exit code is 0
    Expected Result: Zero type errors
    Failure Indicators: Non-zero exit code or error output
    Evidence: .sisyphus/evidence/task-1-typecheck.txt
  ```

  **Commit**: YES
  - Message: `chore: scaffold vite + react + ts project with 3d deps`
  - Files: `package.json, vite.config.ts, tsconfig.json, src/main.tsx, src/App.tsx, tailwind config`
  - Pre-commit: `npx tsc --noEmit`

- [ ] 2. Tailwind + shadcn/ui + 布局骨架

  **What to do**:
  - 使用 shadcn 初始化并安装需要的组件：`button`, `slider`, `toggle`, `dropdown-menu`, `tooltip`, `separator`, `card`, `badge`, `dialog`
  - 创建全局布局组件 `src/components/Layout.tsx`：
    - 左侧可收缩侧边栏 (280px, 可折叠到 48px icon bar)
    - 顶部工具栏 (48px 高)
    - 右侧 3D canvas 区域（flex-1 撑满剩余空间）
    - 底部状态栏 (32px 高，显示点数/FPS/坐标)
  - 布局使用 CSS Grid 或 Flexbox，确保 canvas 区域 100% 填充
  - 侧边栏骨架：文件列表区 + 属性面板区（后续任务填充内容）
  - 工具栏骨架：工具按钮区（后续任务添加工具图标）
  - 安装图标库 `lucide-react`
  - 配置深色主题（3D 工具通常深色背景）

  **Must NOT do**:
  - 不要实现具体的 3D 功能
  - 不要在此任务添加真实数据
  - 不要过度设计组件 props — 保持简单骨架

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: 布局和 UI 设计任务
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: 布局设计需要 UI/UX 审美
  - **Skills Evaluated but Omitted**:
    - `playwright`: 此任务不需要浏览器自动化验证

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1,3,4,5,6)
  - **Blocks**: Tasks 9, 17
  - **Blocked By**: None (can start immediately, but depends on Task 1 for deps — schedule after T1 completes or assume deps exist)

  **References**:

  **External References**:
  - shadcn/ui 组件文档: https://ui.shadcn.com/docs/components
  - lucide-react 图标: https://lucide.dev/icons/
  - Tailwind CSS 暗色模式: https://tailwindcss.com/docs/dark-mode

  **WHY Each Reference Matters**:
  - shadcn/ui 组件用于侧边栏控件（Slider 用于裁切面、颜色映射等）
  - lucide-react 提供工具栏图标（Ruler, Scissors, Palette, Tag 等）

  **Acceptance Criteria**:
  - [ ] 布局在 1920x1080 和 1366x768 分辨率下正确显示
  - [ ] 侧边栏可折叠/展开
  - [ ] Canvas 区域占满剩余空间
  - [ ] 深色主题应用

  **QA Scenarios**:

  ```
  Scenario: Layout renders correctly at 1920x1080
    Tool: Playwright
    Preconditions: npm run dev running
    Steps:
      1. Navigate to http://localhost:5173
      2. Set viewport to 1920x1080
      3. Assert sidebar visible with width ~280px
      4. Assert toolbar height ~48px
      5. Assert canvas area fills remaining space
      6. Screenshot full page
    Expected Result: Three-panel layout (sidebar + toolbar + canvas) with dark theme
    Failure Indicators: Overlapping elements, missing panels, white background
    Evidence: .sisyphus/evidence/task-2-layout-1920.png

  Scenario: Sidebar collapses
    Tool: Playwright
    Preconditions: Layout rendered
    Steps:
      1. Click sidebar collapse button (CSS selector: `[data-testid="sidebar-toggle"]`)
      2. Assert sidebar width shrinks to ~48px
      3. Assert canvas area expands
      4. Screenshot
    Expected Result: Sidebar collapsed to icon bar
    Failure Indicators: Sidebar doesn't animate or canvas doesn't expand
    Evidence: .sisyphus/evidence/task-2-sidebar-collapse.png
  ```

  **Commit**: YES (groups with T1)
  - Message: `feat: add layout skeleton with sidebar, toolbar, and canvas area`
  - Files: `src/components/Layout.tsx, src/components/sidebar/*, src/components/toolbar/*`
  - Pre-commit: `npx tsc --noEmit`

- [ ] 3. Zustand Store + TypeScript 类型定义

  **What to do**:
  - 创建类型定义 `src/types/index.ts`：
    ```typescript
    // 扫描场景
    interface ScanScene {
      id: string
      name: string
      glbUrl: string
      plyUrl: string
      metadata?: ScanMetadata
    }
    
    // 扫描元数据
    interface ScanMetadata {
      pointCount: number
      vertexCount: number
      triangleCount: number
      bounds: { min: [number, number, number]; max: [number, number, number] }
      fileSize: number
    }
    
    // 查看模式
    type ViewMode = 'mesh' | 'pointcloud' | 'both'
    
    // 工具模式
    type ToolMode = 'orbit' | 'measure' | 'clip' | 'annotate'
    
    // 测量结果
    interface Measurement {
      id: string
      type: 'distance' | 'area'
      points: [number, number, number][]
      value: number
      unit: string
    }
    
    // 标注
    interface Annotation {
      id: string
      position: [number, number, number]
      text: string
      color?: string
    }
    
    // 裁切面
    interface ClipPlaneState {
      enabled: boolean
      axis: 'x' | 'y' | 'z'
      position: number  // 归一化 0-1
      flipped: boolean
    }
    
    // 颜色映射
    type ColorMapMode = 'original' | 'height' | 'intensity' | 'custom'
    ```
  - 创建主 store `src/store/viewerStore.ts`：
    - `activeScene`: 当前选中的扫描场景
    - `viewMode`: mesh / pointcloud / both
    - `toolMode`: orbit / measure / clip / annotate
    - `measurements`: 测量结果数组
    - `annotations`: 标注数组
    - `clipPlane`: 裁切面状态
    - `colorMapMode`: 颜色映射模式
    - `pointSize`: 点云点大小
    - `isLoading`: 加载状态
    - `loadingProgress`: 加载进度 0-100
    - `scenes`: 所有可用场景列表
    - `uploadedScenes`: 用户上传的场景
  - 创建预置场景配置 `src/store/presetScenes.ts`：
    ```typescript
    // 文件已在 Task 6 中按配对关系重命名，直接一一对应
    const PRESET_SCENES: ScanScene[] = [
      { id: 'scan-a', name: 'Scan A (Corridor)',   glbUrl: '/models/scan-a.glb', plyUrl: '/models/scan-a.ply' },
      { id: 'scan-b', name: 'Scan B (Large Room)', glbUrl: '/models/scan-b.glb', plyUrl: '/models/scan-b.ply' },
      { id: 'scan-c', name: 'Scan C (Multi-Room)', glbUrl: '/models/scan-c.glb', plyUrl: '/models/scan-c.ply' },
    ]
    ```

  **Must NOT do**:
  - 不要在 store 中存储 Three.js 对象（BufferGeometry, Mesh 等）— 它们不可序列化
  - 不要创建过多分散的 store — 一个主 store 即可

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 类型定义和 store 是纯 TypeScript 逻辑
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 7,8,9,10,11,12-16
  - **Blocked By**: None

  **References**:

  **External References**:
  - zustand 文档: https://zustand.docs.pmnd.rs/getting-started/introduction
  - zustand + R3F 最佳实践: https://r3f.docs.pmnd.rs/tutorials/using-with-zustand

  **WHY Each Reference Matters**:
  - zustand 是 R3F 生态推荐的状态管理方案，文档中有 R3F 集成示例
  - 避免在 store 中存储 Three.js 对象的反模式

  **Acceptance Criteria**:
  - [ ] `npx tsc --noEmit` → 零错误
  - [ ] 所有类型导出正确
  - [ ] store 可在组件中正常使用（import + useViewerStore()）

  **QA Scenarios**:

  ```
  Scenario: Store initializes with preset scenes
    Tool: Bash
    Preconditions: Types and store files created
    Steps:
      1. Run `npx tsc --noEmit` to verify types
      2. Check that PRESET_SCENES has 3 entries
      3. Check store exports useViewerStore
    Expected Result: Zero type errors, 3 preset scenes defined
    Failure Indicators: Type errors or missing exports
    Evidence: .sisyphus/evidence/task-3-typecheck.txt
  ```

  **Commit**: YES (groups with T1)
  - Message: `feat: add typescript types and zustand viewer store`
  - Files: `src/types/index.ts, src/store/viewerStore.ts, src/store/presetScenes.ts`
  - Pre-commit: `npx tsc --noEmit`

- [ ] 4. WebWorker PLY 解析器

  **What to do**:
  - 创建 `src/workers/ply-parser.worker.ts`：
    - 接收 ArrayBuffer 消息
    - 解析 PLY header（提取 vertex count, properties, format）
    - 读取 binary data：
      - 原始格式：每点 27 bytes (3×float64 xyz + 3×uint8 rgb)
      - **关键**：将 float64 坐标转为 Float32Array（精度足够，坐标在 ±10m 内，float32 精度约 0.001mm）
      - 将 uint8 rgb 转为 Float32Array (0-1 范围)，用于 Three.js vertexColors
    - 发送进度消息（每处理 10% 发一次）
    - 返回：`{ positions: Float32Array, colors: Float32Array, count: number, bounds: {...} }`
  - 创建 `src/hooks/usePLYLoader.ts` hook：
    - 封装 Worker 调用
    - 管理 loading / progress / error 状态
    - 支持取消（Worker.terminate()）
    - 返回解析后的 BufferGeometry（或 positions + colors arrays）
  - **性能关键**：使用 Transferable objects 传递 ArrayBuffer，避免复制
  - **可选降采样**：如果点数 > 阈值（如 300万），提供 `stride` 参数进行均匀降采样

  **Must NOT do**:
  - 不要在主线程解析 PLY
  - 不要使用 Three.js PLYLoader（它在主线程运行且没有进度回调）
  - 不要使用 SharedArrayBuffer（兼容性问题）

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 二进制解析 + Worker 通信 + 性能优化，需要深入理解
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 8
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - PLY 00 header 实际内容：
    ```
    ply
    format binary_little_endian 1.0
    comment Created by Polycam
    element vertex 1300420
    property double x
    property double y
    property double z
    property uchar red
    property uchar green
    property uchar blue
    end_header
    ```
  - 每点 27 bytes = 3×double(8) + 3×uchar(1)

  **External References**:
  - Vite Worker 文档: https://vitejs.dev/guide/features.html#web-workers
  - Transferable Objects MDN: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects

  **WHY Each Reference Matters**:
  - Vite 对 Worker 有特定的 import 语法（`new Worker(new URL(...), { type: 'module' })`）
  - Transferable 避免大 ArrayBuffer 的内存复制（132MB 不能复制！）

  **Acceptance Criteria**:
  - [ ] Worker 可正确解析全部 3 个 PLY 文件
  - [ ] 132MB 的 01.ply 解析期间 UI 不卡顿
  - [ ] 进度回调正确反映解析进度
  - [ ] 返回的 positions 是 Float32Array（不是 Float64）
  - [ ] 返回的 colors 范围是 0-1（不是 0-255）
  - [ ] bounds 正确反映空间范围

  **QA Scenarios**:

  ```
  Scenario: Parse smallest PLY file (00.ply)
    Tool: Bash (node)
    Preconditions: Worker file created
    Steps:
      1. Write a small Node.js script that imports the parser logic
      2. Feed it the binary content of public/models/ply/00.ply
      3. Assert returned count === 1300420
      4. Assert positions.length === 1300420 * 3
      5. Assert colors values are in [0, 1] range
      6. Assert bounds.min and bounds.max are reasonable (within ±10)
    Expected Result: 1,300,420 points parsed, positions Float32Array, colors normalized
    Failure Indicators: Wrong count, NaN values, or colors > 1
    Evidence: .sisyphus/evidence/task-4-parse-00.txt

  Scenario: Parse largest PLY file (01.ply) without UI freeze
    Tool: Playwright
    Preconditions: Dev server running with PLY loader integrated
    Steps:
      1. Navigate to app
      2. Trigger load of 01.ply
      3. During loading, verify UI is responsive (click sidebar, check no hang)
      4. Verify progress indicator updates
      5. Verify final point count displayed: 5,107,900
    Expected Result: 01.ply loads with progress, UI stays responsive
    Failure Indicators: Browser becomes unresponsive or progress never updates
    Evidence: .sisyphus/evidence/task-4-parse-01-progress.png
  ```

  **Commit**: YES
  - Message: `feat: add webworker ply parser with progress and transferable`
  - Files: `src/workers/ply-parser.worker.ts, src/hooks/usePLYLoader.ts`
  - Pre-commit: `npx tsc --noEmit`

- [ ] 5. Vitest + Playwright 测试基础设施

  **What to do**:
  - 安装 Vitest 依赖：`vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`
  - 配置 `vitest.config.ts`：
    - environment: jsdom
    - 排除 e2e 目录
    - coverage 配置（optional）
  - 安装 Playwright：`@playwright/test`，运行 `npx playwright install chromium`
  - 配置 `playwright.config.ts`：
    - baseURL: http://localhost:5173
    - webServer: `npm run dev`
    - 只用 chromium（够用）
    - screenshot on failure
  - 创建示例测试确认基础设施工作：
    - `src/__tests__/store.test.ts` — 验证 zustand store 初始化
    - `e2e/smoke.test.ts` — 验证 dev server 启动 + 页面渲染
  - 添加 npm scripts：
    - `"test": "vitest run"`
    - `"test:watch": "vitest"`
    - `"test:e2e": "playwright test"`

  **Must NOT do**:
  - 不要安装 Jest（用 Vitest）
  - 不要配置多浏览器（只用 chromium）

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 标准测试配置
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 19, 20
  - **Blocked By**: None (但最好在 Task 1 之后，需要 package.json)

  **References**:

  **External References**:
  - Vitest 配置: https://vitest.dev/config/
  - Playwright 配置: https://playwright.dev/docs/test-configuration

  **Acceptance Criteria**:
  - [ ] `npm run test` → 示例测试通过
  - [ ] `npm run test:e2e` → smoke 测试通过

  **QA Scenarios**:

  ```
  Scenario: Vitest runs successfully
    Tool: Bash
    Preconditions: Vitest configured
    Steps:
      1. Run `npm run test`
      2. Assert exit code 0
      3. Assert output contains "1 passed"
    Expected Result: Vitest finds and runs sample test
    Failure Indicators: Config errors or test not found
    Evidence: .sisyphus/evidence/task-5-vitest.txt

  Scenario: Playwright E2E smoke test
    Tool: Bash
    Preconditions: Playwright configured, dev server available
    Steps:
      1. Run `npm run test:e2e`
      2. Assert exit code 0
      3. Assert output contains "1 passed"
    Expected Result: Playwright opens browser, loads page, passes assertion
    Failure Indicators: Browser launch failure or assertion error
    Evidence: .sisyphus/evidence/task-5-playwright.txt
  ```

  **Commit**: YES (groups with T3/T5)
  - Message: `chore: add vitest + playwright test infrastructure`
  - Files: `vitest.config.ts, playwright.config.ts, src/__tests__/store.test.ts, e2e/smoke.test.ts`
  - Pre-commit: `npm run test`

- [ ] 6. 重命名并复制数据文件到 public/models/

  **What to do**:
  - **重命名策略**（已通过 bounding box 分析验证配对关系）：
    - 原始文件编号不是一一对应的，重命名为语义化名称避免混淆
    - 配对关系（经 Metis + bounding box 双重验证）：
      - `00.ply` + `01.glb` → `scan-a`（走廊，~5×3×13m）
      - `01.ply` + `00.glb` → `scan-b`（大房间，~13×4×16m）
      - `02.ply` + `02.glb` → `scan-c`（多房间，~14×4×19m）
  - 创建 `public/models/` 目录，按新名称复制：
    - `glb/01.glb` → `public/models/scan-a.glb`
    - `ply/00.ply` → `public/models/scan-a.ply`
    - `glb/00.glb` → `public/models/scan-b.glb`
    - `ply/01.ply` → `public/models/scan-b.ply`
    - `glb/02.glb` → `public/models/scan-c.glb`
    - `ply/02.ply` → `public/models/scan-c.ply`
  - 更新 `.gitignore`：添加 `public/models/` 排除（~272MB 不进 git）
  - 创建 `public/models/README.md`：记录原始文件名、配对关系、坐标系说明

  **Must NOT do**:
  - 不要把大文件加入 git（~272MB 总计）
  - 不要修改原始文件（只复制，不移动）
  - 不要使用原始编号命名（`00.glb` 等）— 会造成混淆

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 纯文件操作
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 7, 8
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - 当前文件位置：`/workspace/poly.cam/glb/` 和 `/workspace/poly.cam/ply/`
  - 重命名映射（经 bounding box 验证）：
    - `glb/01.glb` (走廊 4.4×3.2×13.2m) → `public/models/scan-a.glb`
    - `ply/00.ply` (走廊 5.2×3.1×13.1m) → `public/models/scan-a.ply`
    - `glb/00.glb` (大房间 13.5×4.5×16.5m) → `public/models/scan-b.glb`
    - `ply/01.ply` (大房间 13.0×4.2×16.4m) → `public/models/scan-b.ply`
    - `glb/02.glb` (多房间 13.8×4.4×18.6m) → `public/models/scan-c.glb`
    - `ply/02.ply` (多房间 14.3×4.3×19.2m) → `public/models/scan-c.ply`

  **Acceptance Criteria**:
  - [ ] `public/models/scan-a.glb`, `scan-a.ply`, `scan-b.glb`, `scan-b.ply`, `scan-c.glb`, `scan-c.ply` 全部存在
  - [ ] `.gitignore` 包含 `public/models/`
  - [ ] Vite dev server 可通过 `/models/scan-a.glb` 等路径访问文件
  - [ ] `public/models/README.md` 记录原始文件名和配对关系

  **QA Scenarios**:

  ```
  Scenario: Renamed data files accessible via dev server
    Tool: Bash
    Preconditions: Files copied and renamed, dev server running
    Steps:
      1. `curl -sI http://localhost:5173/models/scan-a.glb` → check 200
      2. `curl -sI http://localhost:5173/models/scan-a.ply` → check 200
      3. `curl -sI http://localhost:5173/models/scan-b.glb` → check 200
      4. `curl -sI http://localhost:5173/models/scan-b.ply` → check 200
      5. `curl -sI http://localhost:5173/models/scan-c.glb` → check 200
      6. `curl -sI http://localhost:5173/models/scan-c.ply` → check 200
      7. Verify scan-b.ply is ~132MB (largest file)
    Expected Result: All 6 renamed files accessible with correct sizes
    Failure Indicators: 404 or size mismatch
    Evidence: .sisyphus/evidence/task-6-file-access.txt
  ```

  **Commit**: NO (files in .gitignore)

- [ ] 7. GLB 纹理网格查看器

  **What to do**:
  - 创建 `src/components/viewer/GLBViewer.tsx`：
    - 使用 drei 的 `useGLTF` hook 加载 GLB 文件
    - 使用 `<primitive object={scene} />` 渲染
    - 在 `<Suspense>` 中包裹，配合加载状态
  - 创建 `src/components/viewer/SceneCanvas.tsx` — 主 Canvas 容器：
    - `<Canvas>` 配置：`camera={{ position: [0, 5, 10], fov: 50 }}`, `gl={{ antialias: true, preserveDrawingBuffer: true }}` (preserveDrawingBuffer 是截图必需)
    - `<OrbitControls>` — 轨道控制（旋转/缩放/平移）
    - `<ambientLight intensity={0.5} />` + `<directionalLight>`
    - 可选 `<Environment preset="city" />` 做环境反射
    - `<GizmoHelper>` 显示坐标轴指示器（右下角）
    - `<Stats>` 显示 FPS（开发模式）
  - 确保 GLB 的 PBR 材质正确渲染（metallicFactor=0, baseColorTexture）
  - **坐标系注意**：GLB 文件使用 Y-up 坐标系（glTF 标准），PLY 可能是 Z-up。需在此任务中记录 GLB 的实际朝向，为 Task 12 (toggle) 做准备。测试方法：加载 GLB 后观察模型朝向，记录相机应该放在哪个位置能看到正面
  - 响应式：Canvas 随容器自动调整大小

  **Must NOT do**:
  - 不要在此任务实现 PLY 加载
  - 不要在此任务实现任何工具（测量/裁切等）
  - 不要手动管理 Three.js renderer（R3F 自动管理）

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 3D 渲染配置需要正确理解 PBR、光照、相机
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: 3D 场景的视觉呈现需要审美判断（光照强度、环境设置等）

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 8,9,10,11)
  - **Blocks**: Tasks 12,13,14,16,17
  - **Blocked By**: Tasks 1,3,6

  **References**:

  **API/Type References**:
  - GLB 00 数据：5 meshes, 255K vertices, 431K triangles, 5 JPEG textures, bounds min=[-7.06, -1.54, -9.42] max=[6.41, 2.91, 7.10]
  - GLB 01 数据：14 meshes, 65K vertices, 14 JPEG textures
  - GLB 02 数据：12 meshes, 74K vertices, 12 JPEG textures
  - 所有 GLB：PBR metallicFactor=0, baseColorTexture 为 JPEG

  **External References**:
  - drei useGLTF: https://drei.docs.pmnd.rs/loaders/gltf-use-gltf
  - R3F Canvas API: https://r3f.docs.pmnd.rs/api/canvas
  - drei OrbitControls: https://drei.docs.pmnd.rs/controls/orbit-controls
  - drei GizmoHelper: https://drei.docs.pmnd.rs/gizmos/gizmo-helper
  - Three.js webgl_loader_gltf example: https://threejs.org/examples/#webgl_loader_gltf

  **WHY Each Reference Matters**:
  - useGLTF 是 R3F 加载 GLB 的标准方式，带缓存和预加载
  - preserveDrawingBuffer=true 必须在 Canvas 创建时设置，后期改不了（截图功能依赖）
  - GizmoHelper 帮助用户理解坐标系方向

  **Acceptance Criteria**:
  - [ ] 加载 00.glb 后可在 Canvas 中看到带纹理的 3D 模型
  - [ ] 鼠标左键拖拽旋转，滚轮缩放，右键/中键平移
  - [ ] 纹理正确显示（不是纯白或纯色）
  - [ ] 坐标轴指示器可见
  - [ ] 切换 3 个 GLB 文件都能正常加载

  **QA Scenarios**:

  ```
  Scenario: GLB model renders with textures
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, data files in public/models/
    Steps:
      1. Navigate to http://localhost:5173
      2. Wait for canvas to appear (selector: `canvas`)
      3. Wait 3 seconds for model to load
      4. Take screenshot
      5. Verify canvas is not all-black and not all-white (pixel sampling)
    Expected Result: 3D model visible with photographic textures
    Failure Indicators: Black/white canvas, no model visible, missing textures
    Evidence: .sisyphus/evidence/task-7-glb-render.png

  Scenario: Orbit controls work
    Tool: Playwright
    Preconditions: Model loaded
    Steps:
      1. Take screenshot (initial view)
      2. Perform mouse drag on canvas (simulate orbit rotation)
      3. Take screenshot (rotated view)
      4. Compare: screenshots should differ (model rotated)
    Expected Result: Two different screenshots showing model from different angles
    Failure Indicators: Identical screenshots (controls not working)
    Evidence: .sisyphus/evidence/task-7-orbit-before.png, task-7-orbit-after.png
  ```

  **Commit**: YES
  - Message: `feat: add glb viewer with orbit controls and lighting`
  - Files: `src/components/viewer/GLBViewer.tsx, src/components/viewer/SceneCanvas.tsx`
  - Pre-commit: `npx tsc --noEmit`

- [ ] 8. PLY 点云查看器

  **What to do**:
  - 创建 `src/components/viewer/PointCloudViewer.tsx`：
    - 使用 Task 4 的 `usePLYLoader` hook 加载和解析 PLY 文件
    - 将返回的 `positions` 和 `colors` 构建为 `<points>` 几何体：
      ```tsx
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
          <bufferAttribute attach="attributes-color" count={count} array={colors} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial size={pointSize} vertexColors sizeAttenuation />
      </points>
      ```
    - 点大小 (`pointSize`) 从 zustand store 读取，默认 0.02
    - 加载进度从 Worker 回调更新到 store
  - **性能优化**：
    - `useMemo` 包裹 BufferGeometry 创建，避免每帧重建
    - 不要在 `useFrame` 中更新 geometry attributes
    - 如果点数 > 3,000,000，自动提示用户可降采样
  - **坐标系**：记录 PLY 的实际朝向（和 GLB 对比），为 Task 12 准备变换矩阵
  - 加载状态显示：百分比进度条覆盖在 Canvas 上
  - **保存原始颜色**：将 Worker 返回的 colors 副本保存在 ref 中，颜色映射功能（Task 15）需要用来恢复原色

  **Must NOT do**:
  - 不要使用 Three.js 内置的 PLYLoader（无 Worker + 无进度）
  - 不要在每帧更新几何体
  - 不要存储 Float64 坐标（已在 Worker 中转为 Float32）

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 需要正确处理大数据量渲染和 WebWorker 集成
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 12,13,14,15,16,17
  - **Blocked By**: Tasks 1,3,4,6

  **References**:

  **API/Type References**:
  - PLY 00: 1,300,420 points, bounds X[-2.26, 2.96] Y[-6.62, 6.47] Z[-1.29, 1.77]
  - PLY 01: 5,107,900 points (最大文件), bounds X[-6.71, 6.25] Y[-6.95, 9.42] Z[-1.43, 2.78]
  - PLY 02: 1,483,000 points, bounds X[-6.98, 7.32] Y[-9.61, 9.59] Z[-1.54, 2.80]
  - Worker 返回格式：`{ positions: Float32Array, colors: Float32Array, count: number, bounds }`

  **External References**:
  - Three.js Points + PointsMaterial: https://threejs.org/docs/#api/en/objects/Points
  - Three.js webgl_interactive_raycasting_points example: https://threejs.org/examples/#webgl_interactive_raycasting_points
  - R3F BufferGeometry pattern: https://r3f.docs.pmnd.rs/api/objects#primitives

  **WHY Each Reference Matters**:
  - Points 是渲染大量点的标准方式（单次 draw call）
  - raycasting_points example 展示了如何做点云交互
  - BufferAttribute attach 语法是 R3F 特有的

  **Acceptance Criteria**:
  - [ ] 00.ply (1.3M) 加载并渲染，带顶点色
  - [ ] 01.ply (5.1M) 加载时有进度显示，UI 不卡顿
  - [ ] 点云在 Canvas 中可见（彩色点），不是黑色
  - [ ] 轨道控制在点云上正常工作

  **QA Scenarios**:

  ```
  Scenario: Point cloud renders with vertex colors
    Tool: Playwright
    Preconditions: Dev server running
    Steps:
      1. Navigate to app, switch to point cloud mode for scan-00
      2. Wait for loading to complete (progress bar disappears)
      3. Screenshot canvas
      4. Verify canvas has colored pixels (not all black/white)
    Expected Result: Colorful point cloud visible in canvas
    Failure Indicators: Black canvas, all-white, or single color
    Evidence: .sisyphus/evidence/task-8-pointcloud-render.png

  Scenario: Large PLY loads with progress
    Tool: Playwright
    Preconditions: Dev server running
    Steps:
      1. Navigate to app, trigger load of scan-01 (5.1M points)
      2. Assert progress indicator is visible
      3. Wait for progress to reach 100%
      4. Assert canvas now shows point cloud
      5. During loading, click sidebar — verify UI responsive
    Expected Result: Progress bar shows 0→100%, final render shows point cloud
    Failure Indicators: No progress indicator, UI freezes, or loading never completes
    Evidence: .sisyphus/evidence/task-8-large-ply-progress.png
  ```

  **Commit**: YES
  - Message: `feat: add ply point cloud viewer with webworker loading`
  - Files: `src/components/viewer/PointCloudViewer.tsx`
  - Pre-commit: `npx tsc --noEmit`

- [ ] 9. 文件管理器侧边栏 UI

  **What to do**:
  - 创建 `src/components/sidebar/FileManager.tsx`：
    - 从 store 读取 `scenes`（预置 + 用户上传）
    - 每个场景显示为一个卡片/列表项：
      - 名称（Scan 00, Scan 01, Scan 02）
      - 缩略图（可选，用 placeholder 或后续从截图生成）
      - 文件大小和点数等元数据
      - 活跃状态高亮
    - 点击切换 `activeScene`
    - 分组显示：「预置扫描」和「上传的扫描」
  - 创建 `src/components/sidebar/PropertyPanel.tsx`（属性面板）：
    - 显示当前选中场景的详细信息：
      - 点数 / 顶点数 / 三角面数
      - 文件大小
      - 空间范围 (bounds)
    - 显示控制选项（后续任务填充具体控件）
  - 集成到 Layout 的侧边栏区域

  **Must NOT do**:
  - 不要实现拖拽上传功能（Task 10）
  - 不要实现具体的属性控件（滑块等在后续任务）

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI 组件设计
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 12, 17
  - **Blocked By**: Tasks 2, 3

  **References**:

  **External References**:
  - shadcn/ui Card: https://ui.shadcn.com/docs/components/card
  - shadcn/ui Badge: https://ui.shadcn.com/docs/components/badge

  **Acceptance Criteria**:
  - [ ] 侧边栏显示 3 个预置扫描
  - [ ] 点击切换高亮和 activeScene
  - [ ] 属性面板显示选中场景信息

  **QA Scenarios**:

  ```
  Scenario: File manager shows preset scans
    Tool: Playwright
    Preconditions: Dev server running
    Steps:
      1. Navigate to http://localhost:5173
      2. Assert sidebar contains 3 items matching "Scan 00", "Scan 01", "Scan 02"
      3. Click "Scan 01"
      4. Assert "Scan 01" item has active/highlighted style
      5. Assert property panel shows metadata
    Expected Result: 3 scan items visible, clicking switches active
    Failure Indicators: Missing items, no highlight change, empty property panel
    Evidence: .sisyphus/evidence/task-9-sidebar.png
  ```

  **Commit**: YES (groups with T7/T8)
  - Message: `feat: add file manager sidebar with scene switching`
  - Files: `src/components/sidebar/FileManager.tsx, src/components/sidebar/PropertyPanel.tsx`
  - Pre-commit: `npx tsc --noEmit`

- [ ] 10. 拖拽上传功能

  **What to do**:
  - 创建 `src/components/upload/DropZone.tsx`：
    - 全屏拖拽覆盖层（当拖入文件时出现半透明遮罩 + "Drop files here" 提示）
    - 支持 `.glb` 和 `.ply` 文件
    - 验证：检查文件扩展名、文件大小上限（500MB）
    - 错误提示：不支持的格式、文件过大
  - 创建 `src/hooks/useFileUpload.ts`：
    - 接收 File → 创建 ObjectURL
    - 检测文件类型 (GLB 判断: magic bytes `glTF`; PLY 判断: header `ply\n`)
    - GLB: 用 GLTFLoader.parse(arrayBuffer, ...)
    - PLY: 用 Worker 解析
    - 成功后创建新的 ScanScene，添加到 store.uploadedScenes
    - **内存管理**：上传新文件时 dispose 旧的 ObjectURL
  - 集成到 Layout：注册全局 dragover/drop 事件
  - 同时支持点击上传按钮（侧边栏底部的 "+" 按钮）

  **Must NOT do**:
  - 不要上传到服务器（纯客户端处理）
  - 不要同时支持其他 3D 格式（只 GLB + PLY）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 文件处理 + 内存管理
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 18
  - **Blocked By**: Tasks 1, 3

  **References**:

  **External References**:
  - HTML5 Drag and Drop API: https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API
  - Three.js Editor Loader (参考文件处理模式): https://github.com/mrdoob/three.js/blob/dev/editor/js/Loader.js
  - GLTFLoader.parse(): https://threejs.org/docs/#examples/en/loaders/GLTFLoader.parse

  **WHY Each Reference Matters**:
  - Three.js Editor 的 Loader.js 是处理多种 3D 文件格式的参考实现
  - GLTFLoader.parse() 用于从 ArrayBuffer 直接解析（不需要 URL）

  **Acceptance Criteria**:
  - [ ] 拖入 .glb 文件 → 出现在侧边栏 "上传" 分组中 → 可查看
  - [ ] 拖入 .ply 文件 → 同上
  - [ ] 拖入 .jpg → 显示错误提示
  - [ ] 点击 "+" 按钮可弹出文件选择器

  **QA Scenarios**:

  ```
  Scenario: Drag and drop GLB file
    Tool: Playwright
    Preconditions: Dev server running
    Steps:
      1. Navigate to app
      2. Simulate file drop of a .glb file on the page
      3. Assert drop overlay appears during drag
      4. Assert new scene appears in sidebar under "Uploaded" section
      5. Click on uploaded scene → assert model renders
    Expected Result: File appears in sidebar and renders in viewer
    Failure Indicators: No overlay, file not added, or render failure
    Evidence: .sisyphus/evidence/task-10-drag-drop.png

  Scenario: Reject invalid file type
    Tool: Playwright
    Preconditions: Dev server running
    Steps:
      1. Simulate drop of a .jpg file
      2. Assert error toast/message appears
      3. Assert no new scene added to sidebar
    Expected Result: Error message shown, file rejected
    Failure Indicators: No error shown or file somehow added
    Evidence: .sisyphus/evidence/task-10-reject-invalid.png
  ```

  **Commit**: YES
  - Message: `feat: add drag-and-drop file upload for glb and ply`
  - Files: `src/components/upload/DropZone.tsx, src/hooks/useFileUpload.ts`
  - Pre-commit: `npx tsc --noEmit`

- [ ] 11. 截图/导出功能

  **What to do**:
  - 创建 `src/utils/screenshot.ts`：
    - `captureScreenshot(gl: WebGLRenderer, scene: Scene, camera: Camera, scale?: number): string`
    - 基础版：`gl.domElement.toDataURL('image/png')` — 需要 `preserveDrawingBuffer: true`（Task 7 的 Canvas 已设置）
    - 高分辨率版（scale=2 或 4）：临时调整 renderer size → render → capture → 恢复
    - 返回 data URL
  - 创建 `src/hooks/useScreenshot.ts`：
    - 使用 R3F 的 `useThree()` 获取 `gl`, `scene`, `camera`
    - `takeScreenshot(filename?: string, scale?: number)` — 调用 captureScreenshot → 触发下载
  - 在工具栏添加截图按钮（图标：Camera）
  - 下载文件名格式：`polycam-{sceneName}-{timestamp}.png`

  **Must NOT do**:
  - 不要实现视频录制
  - 不要实现其他格式导出（只 PNG）

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 相对简单的 Canvas → Image 功能
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 17
  - **Blocked By**: Tasks 1, 3

  **References**:

  **External References**:
  - R3F useThree: https://r3f.docs.pmnd.rs/api/hooks#usethree
  - Canvas toDataURL: https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toDataURL
  - 高分辨率截图参考: https://github.com/EaseCation/cube-3d-text/blob/main/src/components/ThreeCanvas.tsx — `gl.domElement.toDataURL("image/png")` 模式

  **WHY Each Reference Matters**:
  - useThree() 是在 R3F 组件中访问 renderer 的标准方式
  - preserveDrawingBuffer 必须为 true 否则 toDataURL 返回空白

  **Acceptance Criteria**:
  - [ ] 点击截图按钮 → 浏览器下载一张 PNG
  - [ ] PNG 内容与当前 Canvas 视角一致
  - [ ] 文件名包含场景名和时间戳

  **QA Scenarios**:

  ```
  Scenario: Screenshot downloads as PNG
    Tool: Playwright
    Preconditions: Model loaded in viewer
    Steps:
      1. Click screenshot button (selector: `[data-testid="screenshot-btn"]`)
      2. Assert download was triggered
      3. Check downloaded file is valid PNG (file size > 0)
      4. Check filename matches pattern `polycam-*.png`
    Expected Result: PNG file downloaded with correct content
    Failure Indicators: No download, empty file, or blank image
    Evidence: .sisyphus/evidence/task-11-screenshot.png
  ```

  **Commit**: YES (groups with T10)
  - Message: `feat: add screenshot export to png`
  - Files: `src/utils/screenshot.ts, src/hooks/useScreenshot.ts`
  - Pre-commit: `npx tsc --noEmit`

- [ ] 12. 点云 ↔ 网格切换

  **What to do**:
  - 在 `SceneCanvas.tsx` 中实现双模式渲染：
    - `viewMode === 'mesh'` → 只显示 GLBViewer
    - `viewMode === 'pointcloud'` → 只显示 PointCloudViewer
    - `viewMode === 'both'` → 同时显示（点云半透明叠加）
  - **坐标系对齐 (CRITICAL)**：
    - GLB 是 Y-up（glTF 标准），直接渲染即可
    - PLY 是 Z-up（Polycam 扫描约定），需要变换：
      ```tsx
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <PointCloudViewer ... />
      </group>
      ```
    - 变换公式：`PLY(x, y, z) → Scene(x, z, -y)`
  - 切换时保持相机位置不变（不重置视角）
  - 在侧边栏或工具栏添加 ViewMode toggle（三个选项：Mesh / Point Cloud / Both）
  - **相机自动适配**：切换场景时，根据 bounding box 自动调整相机位置
    - GLB 的 bounds 在 accessors 中已有（取出 min/max）
    - PLY 的 bounds 从 Worker 解析返回
    - 使用 `camera.position.set(...)` + `controls.target.set(center)` 来居中

  **Must NOT do**:
  - 不要同时加载所有 3 组扫描（一次只加载一组）
  - 不要在 both 模式下尝试精确对齐（有坐标变换就够了）

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 坐标系对齐是核心难点，需要深入理解 3D 变换
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 13,14,15,16)
  - **Blocks**: Task 17
  - **Blocked By**: Tasks 7, 8, 9

  **References**:

  **Pattern References**:
  - Metis 验证的坐标变换：`PLY(x,y,z) → Scene(x, z, -y)` = `rotation.x = -Math.PI/2`
  - Metis 验证的文件配对：`{A: {ply:'00.ply', glb:'01.glb'}, B: {ply:'01.ply', glb:'00.glb'}, C: {ply:'02.ply', glb:'02.glb'}}`
  - GLB bounds 示例 (00.glb): `min=[-7.06, -1.54, -9.42], max=[6.41, 2.91, 7.10]`
  - PLY bounds 示例 (00.ply): `X[-2.26, 2.96] Y[-6.62, 6.47] Z[-1.29, 1.77]`

  **External References**:
  - R3F group rotation: https://r3f.docs.pmnd.rs/api/objects
  - drei Bounds component: https://drei.docs.pmnd.rs/staging/bounds

  **WHY Each Reference Matters**:
  - 坐标变换是模式切换能否正确工作的关键（Metis 已验证）
  - Bounds 组件可自动调整相机到内容范围

  **Acceptance Criteria**:
  - [ ] 切换 mesh→pointcloud 后，模型在相同位置（视觉对齐）
  - [ ] 切换不重置相机视角
  - [ ] both 模式下两者叠加可见
  - [ ] 切换场景时相机自动适配

  **QA Scenarios**:

  ```
  Scenario: Toggle between mesh and point cloud
    Tool: Playwright
    Preconditions: Scan A loaded in mesh mode
    Steps:
      1. Screenshot current mesh view
      2. Click "Point Cloud" toggle button
      3. Wait 2s for point cloud to render
      4. Screenshot point cloud view
      5. Assert both screenshots show content (not blank)
      6. Assert screenshots are different (different rendering mode)
      7. Click "Mesh" to switch back
      8. Assert mesh mode restored
    Expected Result: Smooth toggle between modes, content always visible
    Failure Indicators: Blank after toggle, model in wrong position, or camera jump
    Evidence: .sisyphus/evidence/task-12-toggle-mesh.png, task-12-toggle-pc.png

  Scenario: Coordinate alignment verification
    Tool: Playwright
    Preconditions: Scan loaded in "Both" mode
    Steps:
      1. Switch to "Both" mode
      2. Screenshot — mesh and point cloud should overlap
      3. Rotate to side view and screenshot
      4. Assert both representations roughly aligned (same center area)
    Expected Result: Point cloud and mesh visually overlap
    Failure Indicators: Point cloud and mesh in completely different positions/orientations
    Evidence: .sisyphus/evidence/task-12-alignment-front.png, task-12-alignment-side.png
  ```

  **Commit**: YES
  - Message: `feat: add point cloud ↔ mesh toggle with coordinate alignment`
  - Files: `src/components/viewer/SceneCanvas.tsx (modified)`
  - Pre-commit: `npx tsc --noEmit`

- [ ] 13. 测量工具 — 两点距离

  **What to do**:
  - 创建 `src/components/tools/MeasurementTool.tsx`：
    - 当 `toolMode === 'measure'` 时激活
    - 点击场景中任意点放置测量点（通过 Raycaster）
    - **BVH 加速 (CRITICAL)**：对点云使用 drei `<Bvh>` 或 `three-mesh-bvh`
      - 无 BVH：5.1M 点 raycasting = 50-200ms → 卡顿
      - 有 BVH：O(log n) = 0.5-2ms → 流畅
    - 对点云：`raycaster.params.Points.threshold` 需动态调整
      - 近距离：threshold 小（精确点选）
      - 远距离：threshold 大（容易命中）
      - 公式：`threshold = 0.01 + distance * 0.005`
    - 第一次点击放置起点（显示红色小球标记）
    - 第二次点击放置终点 → 显示：
      - 两点之间的红色虚线
      - 中点处的距离标签（使用 drei `<Html>` 组件）
      - 标签内容：`"2.45 m"` 格式（米为单位）
    - 支持多次测量（每次新测量都保留之前的）
    - 测量结果存入 store.measurements
    - 右键或 Escape 清除当前未完成的测量
  - 创建 `src/utils/measurement.ts`：
    - `calculateDistance(p1: Vector3, p2: Vector3): number` — 欧几里得距离
    - `formatDistance(meters: number): string` — 格式化显示
  - **面积测量**：仅在 mesh 模式下可用
    - 连续点击 3+ 个点形成多边形
    - 使用 Newell's method 计算 3D 多边形面积
    - 点云模式下面积测量按钮灰色禁用（标注"仅网格模式可用"）

  **Must NOT do**:
  - 不要在点云上实现面积测量（Metis 指出：点云无面片拓扑，面积不可靠）
  - 不要做 3D 体积测量（超出范围）

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Raycaster + BVH + 动态阈值 + 几何计算
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 17
  - **Blocked By**: Tasks 7, 8

  **References**:

  **External References**:
  - Three.js webgl_interactive_raycasting_points: https://threejs.org/examples/#webgl_interactive_raycasting_points — `raycaster.params.Points.threshold` 用法
  - drei Bvh: https://drei.docs.pmnd.rs/performances/bvh — BVH 加速 raycasting
  - drei Html: https://drei.docs.pmnd.rs/misc/html — 3D 空间中嵌入 HTML 标签
  - drei Line: https://drei.docs.pmnd.rs/abstractions/line — 画线
  - Three.js Raycaster API: https://threejs.org/docs/#api/en/core/Raycaster
  - Newell's method for polygon area: https://en.wikipedia.org/wiki/Shoelace_formula

  **WHY Each Reference Matters**:
  - BVH 是 Metis 强调的 MUST — 没有它 5.1M 点 raycasting 不可用
  - threshold 动态调整防止近距离误选或远距离选不中
  - Html 组件是 R3F 中在 3D 位置显示 DOM 元素的标准方式

  **Acceptance Criteria**:
  - [ ] 在 mesh 上点击两点 → 显示距离线和标签
  - [ ] 在点云上点击两点 → 同上（BVH 加速，无卡顿）
  - [ ] 距离值以米为单位，保留 2 位小数
  - [ ] 面积测量在 mesh 模式可用
  - [ ] 面积测量在 pointcloud 模式禁用
  - [ ] Escape 取消当前未完成的测量

  **QA Scenarios**:

  ```
  Scenario: Distance measurement on mesh
    Tool: Playwright
    Preconditions: Scan loaded in mesh mode, measure tool active
    Steps:
      1. Activate measure tool
      2. Click on mesh at point A (center of canvas)
      3. Assert red sphere marker appears
      4. Click on mesh at point B (offset from A)
      5. Assert: red line between A and B visible
      6. Assert: distance label visible with format "X.XX m"
      7. Parse label text — assert numeric value > 0
    Expected Result: Line + label showing distance in meters
    Failure Indicators: No marker, no line, label shows "NaN" or "0.00"
    Evidence: .sisyphus/evidence/task-13-measure-mesh.png

  Scenario: Measurement on 5.1M point cloud is responsive
    Tool: Playwright
    Preconditions: Scan B (5.1M points) loaded in pointcloud mode
    Steps:
      1. Activate measure tool
      2. Click on point cloud
      3. Measure click-to-marker time (should be < 500ms)
      4. Assert marker appears
    Expected Result: Marker appears within 500ms (BVH accelerated)
    Failure Indicators: Click takes > 2s (no BVH) or no hit detected
    Evidence: .sisyphus/evidence/task-13-measure-pc-perf.txt
  ```

  **Commit**: YES
  - Message: `feat: add measurement tool with bvh-accelerated raycasting`
  - Files: `src/components/tools/MeasurementTool.tsx, src/utils/measurement.ts`
  - Pre-commit: `npx tsc --noEmit`

- [ ] 14. 截面切割平面

  **What to do**:
  - 创建 `src/components/tools/ClippingPlane.tsx`：
    - 当 `toolMode === 'clip'` 或 `clipPlane.enabled === true` 时激活
    - 使用 Three.js 原生 ClippingPlane API：
      ```typescript
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
      // 设置到 renderer
      gl.localClippingEnabled = true
      ```
    - 支持 3 个轴向裁切：X, Y, Z（对应 3 个法向量）
    - 侧边栏控件：
      - Axis 选择器（X / Y / Z 按钮组）
      - Position 滑块（归一化 0-1，映射到模型 bounding box 范围）
      - Flip 开关（翻转裁切方向）
      - Enable/Disable 开关
    - **GLB 材质修正 (CRITICAL)**：
      - Polycam GLB 的材质 `doubleSided: false`
      - 裁切后会看到空洞（没有背面）
      - 裁切激活时遍历所有 mesh：`material.side = THREE.DoubleSide`
      - 裁切关闭时恢复：`material.side = THREE.FrontSide`
    - **点云裁切**：ClippingPlane 同样作用于 `Points` 对象（GPU 在 fragment shader 中裁切），无需特殊处理
    - 可视化：在裁切位置显示半透明的参考平面（帮助用户理解裁切位置）

  **Must NOT do**:
  - 不要实现 "cap" 封口（裁切面处的填充面 — 太复杂）
  - 不要支持自由角度裁切（只支持轴向）
  - 不要同时支持多个裁切面

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Three.js ClippingPlane + 材质管理 + UI 交互
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 17
  - **Blocked By**: Tasks 7, 8

  **References**:

  **External References**:
  - Three.js webgl_clipping example: https://threejs.org/examples/#webgl_clipping — 基础裁切面设置
  - Three.js webgl_clipping_advanced: https://threejs.org/examples/#webgl_clipping_advanced — 多平面 + 变换 + PlaneHelper 可视化
  - Three.js Plane API: https://threejs.org/docs/#api/en/math/Plane
  - Material clippingPlanes: https://threejs.org/docs/#api/en/materials/Material.clippingPlanes
  - 关键代码模式（from explore agent）:
    ```javascript
    const localPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0.8);
    material.clippingPlanes = [localPlane];
    material.clipShadows = true;
    renderer.localClippingEnabled = true;
    ```

  **WHY Each Reference Matters**:
  - webgl_clipping 是 Three.js 官方的裁切面参考实现
  - Metis 特别指出 doubleSided 问题 — 裁切时必须切换

  **Acceptance Criteria**:
  - [ ] Y 轴裁切滑块拖动 → 模型被水平切开
  - [ ] 切换 X/Y/Z 轴 → 裁切方向改变
  - [ ] Flip 开关 → 裁切方向反转
  - [ ] 裁切后 mesh 内部可见（doubleSide 生效）
  - [ ] 点云也被正确裁切
  - [ ] 裁切关闭后模型完全恢复

  **QA Scenarios**:

  ```
  Scenario: Clipping plane slices mesh
    Tool: Playwright
    Preconditions: Scan loaded in mesh mode
    Steps:
      1. Enable clipping via UI
      2. Select Y axis
      3. Move slider to 50%
      4. Screenshot — model should be visibly cut in half
      5. Move slider to 0% — full model visible
      6. Move slider to 100% — model fully clipped
    Expected Result: Model progressively clipped as slider moves
    Failure Indicators: No visible clipping, or model disappears entirely at 50%
    Evidence: .sisyphus/evidence/task-14-clip-50pct.png

  Scenario: Clipping shows mesh interior (doubleSide)
    Tool: Playwright
    Preconditions: Clipping active at ~50%
    Steps:
      1. Rotate model to see cut face
      2. Screenshot
      3. Assert cut face is textured (not black/transparent hole)
    Expected Result: Interior faces visible with texture
    Failure Indicators: Black hole at cut location
    Evidence: .sisyphus/evidence/task-14-clip-interior.png
  ```

  **Commit**: YES
  - Message: `feat: add interactive clipping plane with axis control`
  - Files: `src/components/tools/ClippingPlane.tsx`
  - Pre-commit: `npx tsc --noEmit`

- [ ] 15. 点云颜色映射

  **What to do**:
  - 创建 `src/components/tools/ColorMapping.tsx`：
    - 控件面板（侧边栏 PropertyPanel 中）：
      - 模式选择：Original / Height / Intensity (RGB 亮度)
      - 颜色范围预览条（渐变色条显示 min→max 映射）
  - 创建 `src/utils/colorMapping.ts`：
    - `mapHeightColors(positions: Float32Array, bounds: Bounds): Float32Array`
      - 从 positions 数组提取 Y 值（变换后的高度轴）
      - 归一化到 [0, 1]
      - 映射到颜色梯度：蓝(低) → 青 → 绿 → 黄 → 红(高)
      - 返回新的 colors Float32Array
    - `mapIntensityColors(colors: Float32Array): Float32Array`
      - 从 RGB 计算亮度：`L = 0.299*R + 0.587*G + 0.114*B`
      - 映射到灰度或热力图渐变
    - `colorRamp(value: number): [number, number, number]`
      - 输入 0-1，输出 RGB (0-1)
      - 使用 HSL 色相旋转：`H = (1 - value) * 240`（蓝=240° → 红=0°）
  - 实现切换机制：
    - 在 PointCloudViewer 中保存 `originalColorsRef`（Task 8 已预留）
    - 切换到 Height/Intensity 时计算新 colors 并更新 BufferAttribute
    - 切换回 Original 时恢复 originalColorsRef
    - 使用 `geometry.attributes.color.needsUpdate = true` 触发 GPU 更新
  - **性能**：颜色计算在主线程 OK（纯数组操作，5M 点约 50ms）

  **Must NOT do**:
  - 不要实现 "custom attribute" 颜色映射（Metis 建议锁定范围）
  - 不要用 ShaderMaterial（PointsMaterial + vertexColors 足够，更简单）
  - 不要在每帧重算颜色

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 颜色空间计算 + BufferAttribute 动态更新
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 17
  - **Blocked By**: Task 8

  **References**:

  **External References**:
  - Three.js BufferAttribute.needsUpdate: https://threejs.org/docs/#api/en/core/BufferAttribute.needsUpdate
  - Three.js webgl_buffergeometry_points_interleaved: https://threejs.org/examples/#webgl_buffergeometry_points_interleaved — 动态顶点色更新
  - 颜色梯度代码参考 (from librarian research):
    ```typescript
    const colorRamp = (value: number): [number, number, number] => {
      const h = (1 - value) * 240 / 360; // blue→red
      const color = new THREE.Color().setHSL(h, 1, 0.5);
      return [color.r, color.g, color.b];
    }
    ```

  **WHY Each Reference Matters**:
  - `needsUpdate = true` 是触发 GPU 重新上传顶点数据的唯一方式
  - HSL 色相旋转是最直观的颜色梯度实现

  **Acceptance Criteria**:
  - [ ] 切换到 Height 模式 → 点云按高度显示蓝→红渐变
  - [ ] 切换到 Intensity 模式 → 点云按亮度显示
  - [ ] 切换回 Original → 恢复原始 RGB 颜色
  - [ ] 切换不卡顿（< 200ms）
  - [ ] 颜色范围预览条正确显示

  **QA Scenarios**:

  ```
  Scenario: Height color mapping
    Tool: Playwright
    Preconditions: Point cloud loaded (original colors)
    Steps:
      1. Screenshot (original colors)
      2. Switch color mode to "Height"
      3. Wait 500ms for color update
      4. Screenshot (height colors)
      5. Assert screenshots are different
      6. Assert height-mapped screenshot has blue and red regions (low=blue, high=red)
    Expected Result: Point cloud recolored in blue-to-red gradient by height
    Failure Indicators: No color change, all same color, or original colors persist
    Evidence: .sisyphus/evidence/task-15-color-original.png, task-15-color-height.png

  Scenario: Restore original colors
    Tool: Playwright
    Preconditions: Height color mapping active
    Steps:
      1. Switch back to "Original" mode
      2. Screenshot
      3. Compare with original screenshot from step 1 above
      4. Assert visual similarity (original colors restored)
    Expected Result: Original vertex colors restored
    Failure Indicators: Colors don't change back, or show a different state
    Evidence: .sisyphus/evidence/task-15-color-restored.png
  ```

  **Commit**: YES
  - Message: `feat: add point cloud color mapping (height, intensity)`
  - Files: `src/components/tools/ColorMapping.tsx, src/utils/colorMapping.ts`
  - Pre-commit: `npx tsc --noEmit`

- [ ] 16. 标注系统

  **What to do**:
  - 创建 `src/components/tools/AnnotationTool.tsx`：
    - 当 `toolMode === 'annotate'` 时激活
    - 点击场景中的点 → 弹出输入框 → 输入标注文字 → 放置
    - 使用 Raycaster 定位点击位置（复用 Task 13 的 BVH 加速逻辑）
    - 标注显示：使用 drei `<Html>` 在 3D 位置渲染 DOM 元素
      ```tsx
      <Html position={annotation.position} distanceFactor={10} transform>
        <div className="annotation-label">
          <span>{annotation.text}</span>
        </div>
      </Html>
      ```
    - 标注样式：圆角 badge + 连接线（从标签到锚点的细线）
    - 存储：annotations 数组存在 zustand store 中
    - 支持删除：点击标注显示删除按钮
    - **持久化**：使用 zustand persist middleware + localStorage
      - 每个场景的标注独立存储
      - 切换场景时保存/恢复
  - 创建 `src/components/tools/AnnotationLabel.tsx`：
    - 单个标注的 UI 组件
    - 支持编辑（双击编辑文字）
    - 支持拖拽移动（可选）

  **Must NOT do**:
  - 不要做协作标注
  - 不要支持标注导出（超出范围）
  - 不要做富文本标注

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 3D→DOM 混合交互 + 持久化
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: 标注的视觉设计需要审美

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 17
  - **Blocked By**: Tasks 7, 8

  **References**:

  **External References**:
  - drei Html: https://drei.docs.pmnd.rs/misc/html — 在 3D 空间嵌入 HTML
  - drei Html `distanceFactor`: 控制标签随距离缩放的行为
  - drei Html `transform`: 使标签跟随 3D 变换
  - zustand persist: https://zustand.docs.pmnd.rs/integrations/persisting-store-data

  **WHY Each Reference Matters**:
  - Html 组件是在 R3F 中做标注的标准方式（比 CSS2DRenderer 更好的 React 集成）
  - `distanceFactor` 确保远处标注不会太大
  - persist middleware 实现 localStorage 持久化

  **Acceptance Criteria**:
  - [ ] 激活标注工具 → 点击场景 → 输入框弹出
  - [ ] 输入文字确认后 → 标注出现在点击位置
  - [ ] 标注随场景旋转正确跟踪 3D 位置
  - [ ] 刷新页面后标注仍在（localStorage 持久化）
  - [ ] 点击标注可删除

  **QA Scenarios**:

  ```
  Scenario: Add and display annotation
    Tool: Playwright
    Preconditions: Model loaded, annotate tool active
    Steps:
      1. Click on model surface
      2. Assert input dialog appears
      3. Type "Test Annotation" and confirm
      4. Assert annotation label visible in 3D view with text "Test Annotation"
      5. Rotate view — assert annotation stays at correct 3D position
    Expected Result: Annotation placed at clicked point, tracks with rotation
    Failure Indicators: No dialog, label not visible, or label doesn't track rotation
    Evidence: .sisyphus/evidence/task-16-annotation-add.png

  Scenario: Annotations persist across refresh
    Tool: Playwright
    Preconditions: Annotation "Test" placed
    Steps:
      1. Reload page
      2. Wait for model to load
      3. Assert annotation "Test" is still visible
    Expected Result: Annotation survives page refresh
    Failure Indicators: Annotation disappears after refresh
    Evidence: .sisyphus/evidence/task-16-annotation-persist.png
  ```

  **Commit**: YES
  - Message: `feat: add 3d annotation system with localstorage persistence`
  - Files: `src/components/tools/AnnotationTool.tsx, src/components/tools/AnnotationLabel.tsx`
  - Pre-commit: `npx tsc --noEmit`

- [ ] 17. 工具栏 UI + 模式切换集成

  **What to do**:
  - 创建 `src/components/toolbar/Toolbar.tsx`：
    - 顶部工具栏，包含所有工具的图标按钮
    - 工具按钮组（互斥，同时只能激活一个）：
      - 🖱️ Orbit（默认，轨道控制）
      - 📏 Measure Distance（测量距离）
      - ✂️ Clip（截面切割）
      - 🏷️ Annotate（标注）
    - 视图模式切换（独立于工具）：
      - Mesh / Point Cloud / Both（三段式 toggle）
    - 右侧操作按钮：
      - 📷 Screenshot
      - ❓ Help（快捷键说明）
    - 激活状态高亮（active tool 有明显视觉区分）
    - Tooltip 显示工具名称和快捷键
  - 集成所有 Wave 3 工具到统一的 toolMode 状态机：
    - 切换工具时正确激活/停用对应组件
    - 切换工具时清理上一个工具的临时状态（如未完成的测量点）
  - 键盘快捷键：
    - `O` → Orbit
    - `M` → Measure
    - `C` → Clip
    - `A` → Annotate
    - `Escape` → 取消当前操作，回到 Orbit
    - `Cmd/Ctrl+S` → Screenshot
  - 侧边栏 PropertyPanel 根据当前工具显示对应控件：
    - Clip 激活时：显示轴选择 + 位置滑块 + Flip 开关
    - Color mapping 控件（始终可见，在 Point Cloud 模式下）
    - 测量结果列表（可删除单条）
    - 标注列表（可删除单条）

  **Must NOT do**:
  - 不要在此任务修改 3D 逻辑（只做 UI 集成）
  - 不要添加新功能

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: 工具栏 UI 设计 + 交互状态管理
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 18,19,20)
  - **Blocks**: Task F3
  - **Blocked By**: Tasks 12,13,14,15,16

  **References**:

  **External References**:
  - shadcn/ui Toggle Group: https://ui.shadcn.com/docs/components/toggle-group
  - shadcn/ui Tooltip: https://ui.shadcn.com/docs/components/tooltip
  - lucide-react 图标: Ruler, Scissors, Tag, Camera, HelpCircle, Orbit

  **Acceptance Criteria**:
  - [ ] 工具栏显示所有 4 个工具按钮 + 视图切换 + 截图按钮
  - [ ] 点击工具按钮 → 对应工具激活（高亮）
  - [ ] 键盘快捷键 O/M/C/A/Escape 正常工作
  - [ ] 侧边栏根据当前工具显示对应控件

  **QA Scenarios**:

  ```
  Scenario: Toolbar tool switching
    Tool: Playwright
    Preconditions: App loaded
    Steps:
      1. Assert "Orbit" button is active by default
      2. Click "Measure" button
      3. Assert "Measure" button has active style
      4. Assert "Orbit" button no longer active
      5. Press Escape key
      6. Assert "Orbit" button active again
    Expected Result: Tool switching works, Escape returns to Orbit
    Failure Indicators: No visual state change, or Escape doesn't work
    Evidence: .sisyphus/evidence/task-17-toolbar.png

  Scenario: Keyboard shortcuts
    Tool: Playwright
    Preconditions: App loaded
    Steps:
      1. Press "M" key → assert Measure tool active
      2. Press "C" key → assert Clip tool active
      3. Press "A" key → assert Annotate tool active
      4. Press "O" key → assert Orbit tool active
    Expected Result: All keyboard shortcuts work
    Failure Indicators: Key press has no effect
    Evidence: .sisyphus/evidence/task-17-shortcuts.txt
  ```

  **Commit**: YES
  - Message: `feat: add toolbar with tool switching and keyboard shortcuts`
  - Files: `src/components/toolbar/Toolbar.tsx`
  - Pre-commit: `npx tsc --noEmit`

- [ ] 18. 加载状态 + 错误处理 + 性能优化

  **What to do**:
  - 创建 `src/components/ui/LoadingOverlay.tsx`：
    - 全屏半透明遮罩 + 进度条 + 文字说明
    - 显示：文件名、点数/顶点数、已加载百分比
    - 动画：平滑进度条（不要跳跃）
    - 取消按钮（终止 Worker）
  - 创建 `src/components/ui/ErrorBoundary.tsx`：
    - React Error Boundary 包裹整个 Canvas
    - 捕获 3D 渲染错误（WebGL context lost 等）
    - 显示友好错误信息 + 重试按钮
  - 创建 `src/components/ui/Toast.tsx`（或使用 shadcn/ui Sonner）：
    - 成功/错误/警告 toast 通知
    - 用于：文件加载成功、上传错误、不支持的格式等
  - 性能优化：
    - `useGLTF.preload()` 预加载下一个场景（当前场景加载完后）
    - 切换场景时 dispose 旧的 geometry + material + texture
      ```typescript
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose()
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose())
          else obj.material.dispose()
        }
      })
      ```
    - 点云切换时 dispose 旧的 BufferGeometry
    - `renderer.info` 监控 draw calls（开发模式显示）
  - 底部状态栏更新：
    - 显示当前场景点数/三角面数
    - 显示 FPS（从 Stats 读取）
    - 显示相机位置（可选）

  **Must NOT do**:
  - 不要做复杂的内存池管理
  - 不要在生产模式显示 debug 信息

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 错误处理 + 内存管理 + 性能优化
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: Task F3
  - **Blocked By**: Tasks 7, 8, 10

  **References**:

  **External References**:
  - React Error Boundary: https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary
  - shadcn/ui Sonner (toast): https://ui.shadcn.com/docs/components/sonner
  - Three.js dispose pattern: https://threejs.org/docs/#manual/en/introduction/How-to-dispose-of-objects
  - R3F useThree renderer.info: https://r3f.docs.pmnd.rs/api/hooks#usethree

  **Acceptance Criteria**:
  - [ ] 加载大文件时显示进度条
  - [ ] 上传不支持的文件格式时显示 toast 错误
  - [ ] 切换场景时旧场景内存被释放（renderer.info.memory 不持续增长）
  - [ ] WebGL 错误被 ErrorBoundary 捕获，显示友好提示

  **QA Scenarios**:

  ```
  Scenario: Loading progress shown for large file
    Tool: Playwright
    Preconditions: App loaded
    Steps:
      1. Switch to Scan B (01.ply, 5.1M points)
      2. Assert loading overlay appears with progress bar
      3. Assert progress bar animates (not stuck at 0%)
      4. Wait for loading to complete
      5. Assert loading overlay disappears
      6. Assert point cloud visible
    Expected Result: Smooth loading progress, overlay disappears when done
    Failure Indicators: No overlay, stuck progress, or overlay never disappears
    Evidence: .sisyphus/evidence/task-18-loading.png

  Scenario: Memory released on scene switch
    Tool: Playwright + Bash
    Preconditions: Scan A loaded
    Steps:
      1. Load Scan A, note renderer.info.memory.geometries
      2. Switch to Scan B
      3. Wait 1s for disposal
      4. Assert renderer.info.memory.geometries not significantly higher
    Expected Result: Memory count stays stable across scene switches
    Failure Indicators: Memory count grows unboundedly
    Evidence: .sisyphus/evidence/task-18-memory.txt
  ```

  **Commit**: YES
  - Message: `feat: add loading states, error boundary, and memory disposal`
  - Files: `src/components/ui/LoadingOverlay.tsx, src/components/ui/ErrorBoundary.tsx`
  - Pre-commit: `npx tsc --noEmit`

- [ ] 19. Vitest 单元测试

  **What to do**:
  - 创建以下单元测试（覆盖核心逻辑，不测 UI）：

  **`src/__tests__/plyParser.test.ts`** — PLY 解析器测试：
  ```typescript
  // 构造一个最小的合法 PLY binary buffer（3个点）
  // 验证：count=3, positions Float32Array, colors 0-1 范围
  // 验证：float64 → float32 转换精度
  // 验证：坐标变换 PLY(x,y,z) → Scene(x,z,-y)
  ```

  **`src/__tests__/coordinateTransform.test.ts`** — 坐标变换测试：
  ```typescript
  // 验证 PLY(1, 2, 3) → Scene(1, 3, -2)
  // 验证 PLY(0, 0, 0) → Scene(0, 0, 0)
  // 验证 PLY(-1, -2, -3) → Scene(-1, -3, 2)
  ```

  **`src/__tests__/scanPairing.test.ts`** — 文件配对测试：
  ```typescript
  // 验证 PRESET_SCENES 配对正确
  // scan-a: ply='scan-a.ply', glb='scan-a.glb'（重命名后）
  // 验证 3 个场景都有 id, name, glbUrl, plyUrl
  ```

  **`src/__tests__/colorMapping.test.ts`** — 颜色映射测试：
  ```typescript
  // 验证 colorRamp(0) → 蓝色 [0, 0, 1]
  // 验证 colorRamp(1) → 红色 [1, 0, 0]
  // 验证 colorRamp(0.5) → 绿色附近
  // 验证 mapHeightColors 返回 Float32Array，长度 = positions.length
  ```

  **`src/__tests__/measurement.test.ts`** — 测量工具测试：
  ```typescript
  // 验证 calculateDistance([0,0,0], [3,4,0]) === 5
  // 验证 formatDistance(1.234) === "1.23 m"
  // 验证 formatDistance(0.001) === "0.00 m"（或 "1 mm"）
  ```

  **`src/__tests__/viewerStore.test.ts`** — Store 测试：
  ```typescript
  // 验证初始状态：viewMode='mesh', toolMode='orbit'
  // 验证 setViewMode 更新状态
  // 验证 addMeasurement 添加到数组
  // 验证 addAnnotation 添加到数组
  ```

  **Must NOT do**:
  - 不要测试 Three.js 内部（不是我们的代码）
  - 不要测试 React 组件渲染（用 Playwright E2E 代替）
  - 不要 mock Three.js（测试纯逻辑函数）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 需要理解所有模块的逻辑才能写出有意义的测试
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocked By**: Tasks 5, 7-16

  **References**:

  **External References**:
  - Vitest 文档: https://vitest.dev/guide/
  - Vitest + TypeScript: https://vitest.dev/guide/features.html#typescript

  **Acceptance Criteria**:
  - [ ] `npm run test` → 全部通过，零失败
  - [ ] 覆盖 6 个测试文件，至少 20 个测试用例
  - [ ] 坐标变换测试通过（验证 Metis 发现的关键变换）

  **QA Scenarios**:

  ```
  Scenario: All unit tests pass
    Tool: Bash
    Preconditions: All implementation tasks complete
    Steps:
      1. Run `npm run test -- --reporter=verbose`
      2. Assert exit code 0
      3. Assert output shows all tests passing
      4. Assert no "skipped" or "todo" tests
    Expected Result: All tests pass with verbose output
    Failure Indicators: Any test failure or error
    Evidence: .sisyphus/evidence/task-19-vitest.txt
  ```

  **Commit**: YES
  - Message: `test: add vitest unit tests for parser, transforms, store, and utils`
  - Files: `src/__tests__/*.test.ts`
  - Pre-commit: `npm run test`

- [ ] 20. Playwright E2E 测试

  **What to do**:
  - 创建以下 E2E 测试套件：

  **`e2e/smoke.test.ts`** — 基础冒烟测试：
  ```typescript
  // 1. 页面加载，canvas 出现
  // 2. 侧边栏显示 3 个预置扫描
  // 3. 工具栏显示所有工具按钮
  // 4. 默认加载 Scan A，canvas 不为空白
  ```

  **`e2e/viewer.test.ts`** — 查看器测试：
  ```typescript
  // 1. 加载 Scan A mesh → canvas 有内容
  // 2. 切换到 Point Cloud → canvas 有内容（不同于 mesh）
  // 3. 切换到 Both → canvas 有内容
  // 4. 切换到 Scan B → 加载进度显示 → 最终渲染
  // 5. Orbit 控制：拖拽旋转 → canvas 内容变化
  ```

  **`e2e/tools.test.ts`** — 工具测试：
  ```typescript
  // 1. 测量工具：点击两点 → 距离标签出现
  // 2. 裁切工具：移动滑块 → 模型被切割（canvas 变化）
  // 3. 颜色映射：切换 Height → canvas 颜色变化
  // 4. 标注：点击 → 输入 → 标注出现
  // 5. 截图：点击按钮 → 文件下载
  ```

  **`e2e/upload.test.ts`** — 上传测试：
  ```typescript
  // 1. 拖入 .glb 文件 → 出现在侧边栏
  // 2. 拖入 .ply 文件 → 出现在侧边栏
  // 3. 拖入 .jpg → 错误 toast 出现
  ```

  - 每个测试截图保存到 `.sisyphus/evidence/e2e/`
  - 使用 `data-testid` 属性定位元素（不用 CSS 类名）

  **Must NOT do**:
  - 不要测试像素级精确匹配（3D 渲染有抗锯齿差异）
  - 不要测试动画中间帧

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 需要理解整个应用流程
  - **Skills**: [`playwright`]
    - `playwright`: E2E 测试需要 Playwright 专业知识

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocked By**: Tasks 5, 17, 18

  **References**:

  **External References**:
  - Playwright 文档: https://playwright.dev/docs/writing-tests
  - Playwright 文件上传: https://playwright.dev/docs/input#upload-files
  - Playwright 下载: https://playwright.dev/docs/downloads

  **Acceptance Criteria**:
  - [ ] `npm run test:e2e` → 全部通过
  - [ ] 4 个测试文件，覆盖所有 9 个功能
  - [ ] 每个测试有截图证据

  **QA Scenarios**:

  ```
  Scenario: All E2E tests pass
    Tool: Bash
    Preconditions: Dev server running, all features implemented
    Steps:
      1. Run `npm run test:e2e -- --reporter=list`
      2. Assert exit code 0
      3. Assert all test suites pass
      4. Assert evidence screenshots exist in .sisyphus/evidence/e2e/
    Expected Result: All E2E tests pass with screenshots
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-20-e2e-results.txt
  ```

  **Commit**: YES
  - Message: `test: add playwright e2e tests for all features`
  - Files: `e2e/*.test.ts`
  - Pre-commit: `npm run test:e2e`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `npx tsc --noEmit` + `npm run lint` + `npm run test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
  Start from clean state (`npm run dev`). Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-feature integration (measurement while clipping active, annotation on point cloud, etc.). Test edge cases: empty drag-drop, invalid file, rapid toggle. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Wave 1 / T1+T2**: `chore: scaffold vite + react + ts project with layout skeleton`
- **Wave 1 / T3+T5**: `chore: add zustand store, typescript types, and test infrastructure`
- **Wave 1 / T4**: `feat: add webworker ply parser with float64→float32 and progress`
- **Wave 1 / T6**: *(no commit — files in .gitignore)*
- **Wave 2 / T7+T8**: `feat: add glb viewer and ply point cloud viewer`
- **Wave 2 / T9**: `feat: add file manager sidebar with scene switching`
- **Wave 2 / T10+T11**: `feat: add drag-drop upload and screenshot export`
- **Wave 3 / T12**: `feat: add point cloud ↔ mesh toggle with coordinate alignment`
- **Wave 3 / T13**: `feat: add measurement tool with bvh-accelerated raycasting`
- **Wave 3 / T14**: `feat: add interactive clipping plane with doubleside fix`
- **Wave 3 / T15**: `feat: add point cloud color mapping (height, intensity)`
- **Wave 3 / T16**: `feat: add 3d annotation system with localstorage persistence`
- **Wave 4 / T17**: `feat: add toolbar with tool switching and keyboard shortcuts`
- **Wave 4 / T18**: `feat: add loading states, error boundary, and memory disposal`
- **Wave 4 / T19**: `test: add vitest unit tests for parser, transforms, store, utils`
- **Wave 4 / T20**: `test: add playwright e2e tests for all 9 features`

---

## Success Criteria

### Verification Commands
```bash
npm run dev          # Expected: dev server at localhost:5173, 3D scene renders
npm run build        # Expected: dist/ created, zero errors
npx tsc --noEmit     # Expected: zero type errors
npm run test         # Expected: all vitest tests pass
npx playwright test  # Expected: all e2e tests pass
```

### Final Checklist
- [ ] scan-a.glb, scan-b.glb, scan-c.glb 全部渲染带纹理
- [ ] scan-a.ply, scan-b.ply, scan-c.ply 全部渲染带顶点色
- [ ] scan-b.ply (5.1M 点) 加载有进度条，UI 不卡顿
- [ ] 点云 ↔ 网格切换后视觉对齐（坐标变换正确）
- [ ] 侧边栏文件管理器切换 3 组扫描
- [ ] 两点距离测量显示米为单位的数值
- [ ] 截面切割平面可切割模型，内部可见（doubleSide）
- [ ] 颜色映射按高度重新着色点云
- [ ] 标注可在 3D 空间放置，刷新后保留
- [ ] 截图保存为 PNG
- [ ] 拖拽上传接受 .glb 和 .ply 文件
- [ ] `npm run build` 零错误
- [ ] `npm run test` 全部通过
- [ ] `npm run test:e2e` 全部通过
