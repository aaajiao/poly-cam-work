# Intro Preset Authoring Spec

> Status: Draft
> Date: 2026-03-10

---

## 零、结论先行

首访体验不做一整段 timeline 录制，而做一个**作者捕捉的首访状态（Intro Preset）**。

- 作者登录后，手动调整模型角度、扫描进度、节点打开状态。
- 在满意的瞬间点击 **Capture Intro**。
- 系统将当前状态序列化为一个**单独的 JSON 文件**并存入 Vercel Blob。
- 访客进入网站时，不再看到默认相机和完整模型，而是先恢复这个 preset。
- 用户点击 `Continue Scan` 后，再从这个 preset 的扫描进度继续完成后续 reveal。

**关键原则**：

- 这是一个 **authored state**，不是程序推导出的通用首访效果。
- 这是一个 **separate asset**，不是塞进现有 `SceneDraft` 主体里的字段。
- 这是一个 **homepage-load artifact**，与注释草稿、发布正文分离，但与发布版本绑定。

---

## 一、为什么要单独存一个文件

当前系统里已经有三类东西：

1. **场景资源**：`glbUrl` / `plyUrl`
2. **内容数据**：`SceneDraft.annotations`
3. **运行时视觉状态**：camera、scan progress、open panels、triggered ids

Intro Preset 属于第 3 类。

它有两个特征：

- 它服务的是**首访载入体验**，不是注释内容本身。
- 它是一个**单独可替换、可重做、可禁用**的开场状态。

所以它不应该混进：

- `ScanMetadata`（技术元数据，不是策展状态）
- `SceneDraft.annotations`（内容正文，不是入口态）

### 设计判断

Intro Preset 应该是：

```text
scene assets      ← glb / ply
scene content     ← draft / release annotations
intro preset      ← homepage-load state (separate JSON)
```

这样做的好处：

- **结构清晰**：首访逻辑和正文内容解耦
- **缓存友好**：intro preset 可单独读取、单独失效
- **迭代灵活**：作者可以只重录 intro，不必修改 annotation 内容
- **版本明确**：可以和发布版本一一对应，不会漂移

---

## 二、非目标（Non-Goals）

本阶段明确**不做**：

### 2.1 不做 Timeline Recording

不录：

- 每一帧 camera
- 每一帧 scanT
- 每一帧 annotation 事件
- 完整播放轨道 / 插值 / 关键帧系统

原因：

- 当前没有 Camera Director
- 当前没有 playback timeline schema
- 当前的价值重点在“作者选中的开场瞬间”，不是一整段电影

### 2.2 不做自动智能构图

不根据 bounds 自动生成“最佳角度”。

原因：

- 作品之间差异很大
- 首访构图本质上是策展决策，不是几何推导

### 2.3 不做节点自动导演系统

不做“首访自动播放多个节点的定时叙事链”。

MVP 只支持：

- 0 个节点打开
- 1 个 hero 节点打开
- 可选多个 `triggeredAnnotationIds` 已点亮

---

## 三、Blob 对象结构

Intro Preset 必须进 Vercel Blob，但与现有 draft/release 结构分开。

### 3.1 建议路径

```text
scenes/{sceneId}/draft.json                          ← 现有正文草稿
scenes/{sceneId}/releases/{version}.json             ← 现有正文发布快照
scenes/{sceneId}/live.json                           ← 现有 live pointer

scenes/{sceneId}/intro/draft.json                    ← 新增：intro 草稿
scenes/{sceneId}/intro/releases/{version}.json       ← 新增：与正文发布版本对应的 intro 快照
```

### 3.2 为什么不用单独的 intro live pointer

不建议再建：

```text
scenes/{sceneId}/intro/live.json
```

原因：

- intro 的“live 版本”应该天然跟正文 `live.json` 对齐
- 访客加载 release N 时，也应该加载 intro release N
- 避免正文是 version 7，intro 却误用 version 5

### 3.3 发布时的行为

发布 scene draft 为 release `N` 时：

1. 正文写入 `scenes/{sceneId}/releases/{N}.json`
2. 当前 intro 草稿写入 `scenes/{sceneId}/intro/releases/{N}.json`
3. `live.json` 仍只维护正文版本号

访客读取时：

1. 先读 `live.json` → 得到 `version = N`
2. 再读正文 release `N`
3. 再读 intro release `N`
4. 若 intro 不存在，则 fallback 到默认 viewer

---

## 四、数据结构

Intro Preset 是一个**冻结状态**，不是 timeline。

### 4.1 核心类型

```ts
export interface IntroPreset {
  version: 1

  sceneId: string
  enabled: boolean

  camera: {
    position: [number, number, number]
    target: [number, number, number]
    fov?: number
  }

  viewer: {
    viewMode: 'mesh' | 'pointcloud' | 'both'
  }

  scan: {
    progress: number          // 0..1, 例如 0.25
    radius: number            // 对应当前 scanRadius
    phase: 'origin' | 'expansion' | 'complete'
    origin: [number, number, number]
    maxRadius: number
    duration: number          // 后续 Continue Scan 用的总时长
  }

  annotations: {
    openIds: string[]
    triggeredIds: string[]
    activeId: string | null
  }

  ui: {
    ctaLabel?: string         // 默认 'Continue Scan'
  }

  createdAt: number
  updatedAt: number
}
```

### 4.2 为什么既存 `progress` 又存 `radius`

都要存。

- `progress` 用于后续 resume / UI 计算
- `radius` 用于恢复时立即渲染正确 shader 状态

两者可以互校验，但不要只存一个。

### 4.3 为什么要存 `triggeredIds`

因为首访状态不只是“画面停在 25%”。

它还包含：

- 哪些节点已经被 scan 激活
- 哪些面板已打开
- 哪个节点是当前焦点

否则访客会看到“局部扫描态”，但 marker / panel 状态不一致。

---

## 五、Authoring Workflow

### 5.1 入口

仅登录用户可见。

建议提供一组简单动作：

- `Start Scan`
- `Pause Scan`
- `Capture Intro`
- `Clear Intro`

其中关键动作不是“录制”，而是：

## `Capture Current Intro State`

### 5.2 操作流程

1. 作者进入编辑模式
2. 手动调整 camera 到满意角度
3. 开始扫描
4. 在某个进度点击暂停 / 停止在当前帧
5. 手动打开 0~1 个 hero annotation panel
6. 点击 `Capture Intro`
7. 系统读取当前运行时状态并写入 `intro/draft.json`

### 5.3 Capture 时要读取的现有资源

来自当前系统的已有状态：

- `camera.position`
- `OrbitControls.target`
- `useViewerStore().viewMode`
- `useScanStore().scanT`
- `useScanStore().scanRadius`
- `useScanStore().scanOrigin`
- `useScanStore().maxRadius`
- `useScanStore().duration`
- `useScanStore().triggeredAnnotationIds`
- `useScanStore().activeAnnotationId`
- `useViewerStore().openAnnotationPanelIds`

也就是说，这不是新造数据，而是把**现有运行时状态冻结成 JSON**。

---

## 六、访客端播放流程

### 6.1 访客首访加载流程

```text
Page Load
  ↓
loadCloudScenes()
  ↓
sceneReady = true
  ↓
load current live release
  ↓
load matching intro preset release
  ↓
if intro preset exists:
  apply intro preset
else:
  fallback to current default viewer
```

### 6.2 Apply Intro Preset 的顺序（关键）

当前 `CameraController` 会在 scene change 时强制 reset：

- `camera.position.set(0, 5, 15)`
- `camera.lookAt(0, 0, 0)`

所以 intro preset 恢复必须遵守：

1. scene 资源完成挂载
2. 默认 camera reset 完成
3. 再应用 intro preset 的 camera / target / viewMode / scan state / open panels

否则作者构图会被默认相机覆盖。

### 6.3 访客端看到什么

用户进入后先看到：

- 作者选定角度
- 作者选定的部分扫描进度
- 作者选定的 hero panel（可选）
- CTA：`Continue Scan`

这不是自动播一段动画，而是一个被策展过的 opening tableau。

---

## 七、Continue Scan 行为

### 7.1 这不是 Replay

`Replay` 是从 0 重新开始。

`Continue Scan` 应该是：

- 从 intro preset 的 `scan.progress` 继续往后扫
- 保留已经触发的 annotation ids
- 继续使用当前 `duration` / `maxRadius`

### 7.2 需要的新能力

当前 scan 更偏向：

- `startScan()` → 从 0 开始

要支持 intro preset，需要新增类似：

```ts
resumeScanFromPreset(preset: IntroPreset)
```

它需要：

- 初始化 `scanT`
- 初始化 `scanRadius`
- 初始化 `scanOrigin`
- 初始化 `triggeredAnnotationIds`
- 初始化 `activeAnnotationId`
- 将 `isScanning` 设为 `true`
- 从 preset progress 继续推进，而不是从 0 起步

### 7.3 Continue 与 Replay 的语义区分

- `Continue Scan`：从 preset 继续
- `Replay`：从 0 重新扫一遍

两者不能共用一个词。

---

## 八、API 设计建议

### 8.1 新增 API

```text
GET  /api/intro/:sceneId              ← 读 intro 草稿（登录）
PUT  /api/intro/:sceneId              ← 写 intro 草稿（登录）
GET  /api/intro/:sceneId?version=N    ← 读 intro release（公开）
```

### 8.2 不新增单独 publish API

不需要 `/api/intro/publish/:sceneId`。

更合理的是：

- `POST /api/publish/:sceneId`
  - 发布正文 release N 时
  - 同时复制当前 `intro/draft.json` → `intro/releases/N.json`

这样 intro 和正文天然同步。

---

## 九、MVP 范围

### 9.1 必做

- intro preset 独立 JSON 结构
- Blob 中独立存储
- 作者可 Capture 当前状态
- 发布时生成 versioned intro preset
- 访客首访恢复 intro preset
- CTA：`Continue Scan`
- 从 preset progress 恢复扫描

### 9.2 可选但不必首版就做

- 每个 scene 多个 intro presets
- introPreset editor 历史记录
- introPreset 禁用/启用切换
- per-device intro variants（mobile / desktop）

### 9.3 明确延期

- timeline recording
- camera keyframe playback
- 多段自动节点叙事
- 摄影机自动运镜（P3 Camera Director）

---

## 十、Fallback 策略

如果某个 scene 没有 intro preset：

### fallback 1（推荐）
- 直接进入当前默认 viewer
- 不自动扫描

### fallback 2（后续可选）
- 使用程序化 partial scan 作为通用 fallback

MVP 阶段建议先用 fallback 1，避免引入两个首访逻辑并存。

---

## 十一、与当前系统的关系

### 已有系统复用

- `scanStore`：扫描进度与 reveal 状态
- `viewerStore`：面板打开状态 / viewMode
- `ScanControls`：Scan / Stop / Replay UI 基础
- `draft` / `publish` / `release`：Blob 持久化主链路

### 新增但轻量的内容

- `IntroPreset` 类型
- intro draft / release blob 文件
- capture 当前状态的 authoring action
- apply preset / continue preset 的 visitor logic

这意味着它是**建立在现有资源之上的扩展**，不是另起一套系统。

---

## 十二、推荐实施顺序

### Phase A — Data & Persistence

1. 定义 `IntroPreset` 类型
2. 增加 intro draft / release Blob 路径
3. 增加 `GET/PUT /api/intro/:sceneId`
4. 在 publish 时一并复制 intro preset 到 release version

### Phase B — Authoring

1. 登录态下加入 `Capture Intro`
2. 从当前 camera + scan + panel 状态生成 preset
3. 存到 intro draft

### Phase C — Playback

1. 访客端加载 release 对应 intro preset
2. sceneReady 后恢复 preset
3. 提供 `Continue Scan`
4. 从 preset progress 继续 reveal

---

## 十三、一句话定义

Intro Preset 不是一段录制视频，也不是一套 timeline 系统。

它是：

**一个由作者捕捉、独立存储在 Blob 中、专门用于首页载入的首访状态文件。**

它与正文结构分离，但与发布版本绑定。

这就是当前最合适、最可控、也最符合现有系统资源的方案。
