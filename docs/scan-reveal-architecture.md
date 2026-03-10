# Scan Reveal System — 架构方案

> Status: Draft
> Date: 2026-03-10

---

## 零、设计原则

**零侵入（Non-Invasive）**：扫描揭示系统作为**纯增量模块**加入。不修改任何现有文件。

- 现有的 `GLBViewer`、`PointCloudViewer`、`viewerStore`、`SceneCanvas` 保持不动。
- 新系统通过**包装组件**和**独立 store**接入，在 `SceneCanvas` 中通过条件渲染切换。
- 关闭扫描模式 = 回到完全原始的渲染路径，无任何性能或行为副作用。

---

## 一、核心概念

扫描揭示（Scan Reveal）是一个**叙事装置**：一道光波从原点向外扩散，所过之处 3D 模型从虚无中被"构建"出来，空间中的标注节点在被触及的瞬间自动展开。配合镜头运动，观众经历的不是"打开一个网页"，而是"目睹一个数字空间的生成"。

### 三个子系统

```
┌───────────────────────────────────────────────────────────┐
│                  useScanOrchestrator                       │
│              （顶层编排 Hook，唯一对外接口）                   │
│                                                            │
│  ┌────────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  Scan Engine   │  │   Camera     │  │  Annotation   │  │
│  │  扫描引擎       │  │   Director   │  │  Trigger      │  │
│  │                │  │   运镜导演    │  │  节点触发器    │  │
│  │  scanT (0→1)   │──│  position    │  │  hitTest()    │  │
│  │  scanRadius    │  │  lookAt      │  │  queue        │  │
│  │  scanPhase     │  │  FOV         │  │  triggeredSet │  │
│  └───────┬────────┘  └──────┬───────┘  └───────┬───────┘  │
│          │                  │                   │          │
│     GPU Uniforms      camera/controls      store actions   │
│     (shared ref)      (useThree)           (existing API)  │
└───────────────────────────────────────────────────────────┘
```

---

## 二、架构逻辑

### 2.1 数据流

```
scanStore.startScan()
       │
       ▼
  useFrame loop (每帧)
       │
       ├──→ scanT += dt / duration
       │         │
       │         ├──→ scanRadius = easing(scanT) * maxRadius
       │         │
       │         ├──→ [GPU] uniformsRef.current.uScanRadius.value = scanRadius
       │         │         ├──→ Mesh shader: 距离 < scanRadius 的片段显示
       │         │         └──→ Points shader: 距离 < scanRadius 的点激活
       │         │
       │         ├──→ [CPU] annotations.filter(a => dist(a.pos, origin) <= scanRadius)
       │         │         └──→ 新命中的 annotation → triggerQueue
       │         │
       │         └──→ [Camera] 根据 scanPhase 插值 camera position/target
       │
       ▼
  scanT >= 1 → scanPhase = 'complete' → 交还控制权
```

### 2.2 状态管理：独立 Store

**不污染 viewerStore**。创建独立的 `scanStore`：

```typescript
interface ScanState {
  // 生命周期
  isScanning: boolean
  scanPhase: 'idle' | 'origin' | 'expansion' | 'complete'
  scanT: number              // 0→1 归一化进度

  // 扫描参数
  scanOrigin: [number, number, number]  // 默认 [0, 0, 0]
  scanRadius: number                     // 当前扫描半径（世界坐标）
  maxRadius: number                      // 场景包围盒半径
  duration: number                       // 扫描总时长（秒）

  // 节点触发
  triggeredAnnotationIds: Set<string>    // 已触发的 annotation ID
  activeAnnotationId: string | null      // 当前展示中的 annotation

  // Actions
  startScan: (maxRadius: number) => void
  stopScan: () => void
  resetScan: () => void
  triggerAnnotation: (id: string) => void
}
```

### 2.3 与现有代码的唯一接触点

整个系统与现有代码的接触面**仅限 `SceneCanvas.tsx` 的条件渲染**：

```
SceneCanvas 当前：
  <GLBViewer url={...} />
  <PointCloudViewer url={...} />

加入扫描后：
  {isScanning
    ? <ScanRevealGLBViewer url={...} uniformsRef={...} />
    : <GLBViewer url={...} />
  }
  {isScanning
    ? <ScanRevealPointCloudViewer url={...} uniformsRef={...} />
    : <PointCloudViewer url={...} />
  }
  {isScanning && <ScanOrchestrator />}
```

扫描关闭时，渲染路径与原来**完全一致**。

---

## 三、效果逻辑

### 3.1 Mesh 扫描效果（实体显影）

通过 `onBeforeCompile` 注入到 glTF 原始 `MeshStandardMaterial`。

**三层视觉结构**：

| 区域 | 条件 | 效果 |
|------|------|------|
| 前锋（Wavefront） | `abs(dist - scanRadius) < edgeWidth` | 高亮光带（青色/白色），`smoothstep` 羽化边缘 |
| 中段（Construct） | `dist < scanRadius && dist > scanRadius - transitionWidth` | 半透明全息态：降低 opacity，提升 emissive，线框/噪点溶解感 |
| 后方（Reality） | `dist < scanRadius - transitionWidth` | 完整 PBR 材质，正常渲染 |
| 未扫描 | `dist > scanRadius + edgeWidth` | `discard`（片段丢弃，完全不可见） |

**Shader 注入点**（fragment shader）：

```glsl
// 注入到 #include <common> 之后
uniform float uScanRadius;
uniform vec3  uScanOrigin;
uniform vec3  uWavefrontColor;
uniform float uEdgeWidth;
uniform float uTransitionWidth;
varying vec3  vWorldPosition;

// 注入到 #include <dithering_fragment> 之前
float dist = length(vWorldPosition - uScanOrigin);

// 未扫描区域：丢弃
if (dist > uScanRadius + uEdgeWidth) discard;

// 前锋光带
float edgeFactor = 1.0 - smoothstep(uScanRadius - uEdgeWidth, uScanRadius, dist);
gl_FragColor.rgb += uWavefrontColor * (1.0 - edgeFactor) * 0.8;

// 中段过渡
float constructFactor = smoothstep(
  uScanRadius - uTransitionWidth - uEdgeWidth,
  uScanRadius - uEdgeWidth,
  dist
);
gl_FragColor.a = mix(1.0, 0.4, constructFactor);
gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * 0.6 + uWavefrontColor * 0.15, constructFactor);
```

**Vertex shader 注入**（传递世界坐标）：

```glsl
// 注入到 #include <common> 之后
varying vec3 vWorldPosition;

// 注入到 #include <begin_vertex> 之后
vWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
```

### 3.2 Point Cloud 扫描效果（粒子激活）

替换 `PointsMaterial` 为自定义 `ShaderMaterial`，保持 `vertexColors` 和 `sizeAttenuation` 行为。

**每个点的状态**（基于距离）：

| 状态 | 条件 | 效果 |
|------|------|------|
| 未激活 | `dist > scanRadius` | `gl_PointSize = 0.0`（不渲染） |
| 激活瞬间 | `abs(dist - scanRadius) < activationWidth` | size × 1.5，颜色 = wavefrontColor，alpha 从 0 渐入 |
| 已激活 | `dist < scanRadius - activationWidth` | 正常 size，原始 vertexColor，alpha = 1.0 |

**关键 GLSL 逻辑**（vertex shader）：

```glsl
uniform float uScanRadius;
uniform vec3  uScanOrigin;
uniform float uPointSize;
uniform float uActivationWidth;

attribute vec3 color;
varying vec3  vColor;
varying float vAlpha;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  float dist = length(worldPos.xyz - uScanOrigin);

  // 未激活：隐藏
  if (dist > uScanRadius + uActivationWidth) {
    gl_PointSize = 0.0;
    gl_Position = vec4(0.0);
    vAlpha = 0.0;
    return;
  }

  // 激活过渡
  float activationT = 1.0 - smoothstep(
    uScanRadius - uActivationWidth,
    uScanRadius + uActivationWidth,
    dist
  );
  float sizePop = mix(1.5, 1.0, activationT);
  vAlpha = activationT;
  vColor = mix(vec3(0.0, 1.0, 0.9), color, activationT);

  // 标准 sizeAttenuation 计算
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uPointSize * sizePop * (300.0 / -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
}
```

### 3.3 坐标系注意事项

- GLB 材质中 `vWorldPosition` 已经是 Y-up 世界坐标。
- PLY 点云在 `<group rotation={[-Math.PI / 2, 0, 0]}>` 内，`modelMatrix` 已包含旋转变换，因此 `worldPos = modelMatrix * vec4(position, 1.0)` 输出的也是 Y-up 世界坐标。
- Annotation 的 `position: [x, y, z]` 是 Y-up 世界坐标。
- **结论**：所有距离计算在同一坐标系下，无需额外转换。

---

## 四、节点触发逻辑

### 4.1 碰撞检测（CPU 侧，每帧）

```
在 useFrame 中：

1. 获取当前 scanRadius 和 scanOrigin
2. 获取当前 activeSceneId 的所有 annotations
3. 遍历 annotations：
   - 跳过已在 triggeredSet 中的
   - 计算 dist = |annotation.position - scanOrigin|
   - 如果 dist <= scanRadius → 命中
4. 命中处理：
   - 加入 triggeredSet
   - 推入 triggerQueue
```

### 4.2 触发策略："聚焦导览"模式

采用方案 B（推荐）— 扫到新节点时，关闭旧面板，聚焦新面板：

```
收到新命中 annotation：
  1. closeAnnotationPanel(activeAnnotationId)   ← 关闭上一个
  2. marker 脉冲动画（放大 → 缩回）              ← 视觉反馈
  3. 短暂延迟 (~300ms)
  4. openAnnotationPanel(newId)                  ← 打开新面板
  5. selectAnnotation(newId)                     ← 高亮选中
  6. activeAnnotationId = newId                  ← 更新扫描 store
```

调用的 `openAnnotationPanel`、`closeAnnotationPanel`、`selectAnnotation` 均为 viewerStore 已有 action，不需要修改。

### 4.3 边界情况

- **同一帧多个命中**：按距离排序，只取最近的一个进入 queue，其余延后到下一帧。
- **扫描速度过快**：如果两个 annotation 距离很近（< 2 世界单位），合并为一次触发，同时高亮两个 marker 但只展开距离更近的面板。
- **扫描结束后**：`triggeredSet` 不清空，所有 marker 保持可见状态。面板回归手动交互模式。

---

## 五、运镜导演（Camera Director）

### 5.1 四阶段运镜脚本

| 阶段 | scanT 范围 | 镜头行为 | 参数 |
|------|-----------|---------|------|
| **Origin** | 0.00 — 0.05 | 特写，低角度，极慢水平漂移 | pos: (0, 1.5, 3), lookAt: (0, 0, 0) |
| **Expansion** | 0.05 — 0.85 | 跟随扫描后退 + 缓慢环绕上升 | dist = baseDist + scanRadius × 0.7, azimuth += 0.1 rad/s |
| **Encounter** | （事件驱动） | 微调 lookAt 权重偏向命中节点 | lookAt = lerp(center, annotationPos, 0.2), 持续 1s |
| **Complete** | 0.85 — 1.00 | 退到全景，进入 idle 自转 | dist = maxDist × 1.2, autoRotate: 0.05 rad/s |

### 5.2 控制权交接

```
扫描启动：
  → setCameraControlsEnabled(false)     ← 禁用 OrbitControls
  → Camera Director 接管

扫描中用户拖拽（pointerdown 事件）：
  → 标记 userInterrupted = true
  → 0.5s 内 lerp 当前运镜状态 → OrbitControls 状态
  → setCameraControlsEnabled(true)      ← 交还控制权
  → Camera Director 停止（但扫描引擎继续运行）

扫描结束：
  → setCameraControlsEnabled(true)      ← 交还控制权
  → Camera Director 进入 idle 自转（如用户未中断）
```

### 5.3 与现有 CameraController 的关系

现有 `CameraController`（SceneCanvas 内部组件）在 scene 切换时重置 camera position。扫描启动时：
- 如果 scene 切换触发了 CameraController 的 reset → 这是正确的，因为扫描应该从默认视角开始。
- Camera Director 在 CameraController reset 之后接管，两者不冲突。

---

## 六、文件结构

所有新文件，不修改现有文件：

```
src/
  store/
    scanStore.ts                        # 独立 zustand store（扫描状态）

  hooks/
    useScanEngine.ts                    # 核心时间轴 + uniforms 管理
    useScanAnnotationTrigger.ts         # CPU 侧碰撞检测 + 触发队列
    useCameraDirector.ts                # 运镜脚本 + 控制权交接
    useScanOrchestrator.ts              # 顶层编排 hook（组合上述三个）

  shaders/
    scanRevealMesh.ts                   # Mesh onBeforeCompile 注入逻辑
    scanRevealPoints.ts                 # Point cloud 自定义 ShaderMaterial

  components/viewer/
    ScanRevealGLBViewer.tsx             # 包装：加载 GLB + 注入 scan shader
    ScanRevealPointCloudViewer.tsx      # 包装：加载 PLY + 自定义 ShaderMaterial
    ScanOrchestrator.tsx                # 空渲染组件，挂载 useScanOrchestrator
```

### 与 SceneCanvas 的集成方式

`SceneCanvas.tsx` 是唯一需要修改的现有文件，改动极小：

```tsx
// 新增 import
import { ScanRevealGLBViewer } from './ScanRevealGLBViewer'
import { ScanRevealPointCloudViewer } from './ScanRevealPointCloudViewer'
import { ScanOrchestrator } from './ScanOrchestrator'
import { useScanStore } from '@/store/scanStore'

// 在组件内新增一行
const isScanning = useScanStore((s) => s.isScanning)

// 替换条件渲染（mesh）
{activeScene && sceneReady && (viewMode === 'mesh' || viewMode === 'both') && (
  isScanning
    ? <ScanRevealGLBViewer url={activeScene.glbUrl} />
    : <GLBViewer url={activeScene.glbUrl} />
)}

// 替换条件渲染（points）
{activeScene && sceneReady && (viewMode === 'pointcloud' || viewMode === 'both') && (
  isScanning
    ? <ScanRevealPointCloudViewer url={activeScene.plyUrl} />
    : <PointCloudViewer url={activeScene.plyUrl} />
)}

// 新增 orchestrator
{isScanning && <ScanOrchestrator />}
```

---

## 七、实施阶段

### P0：Scan Engine + Mesh Shader（可独立验证）

**目标**：光波从原点扩散，GLB 模型从虚无中被"扫描"出来。

**交付物**：
- `scanStore.ts` — 基础状态（isScanning, scanT, scanRadius）
- `useScanEngine.ts` — useFrame 驱动 scanT，更新 shared uniforms
- `scanRevealMesh.ts` — onBeforeCompile 注入逻辑
- `ScanRevealGLBViewer.tsx` — 包装组件

**验证方式**：开发环境下手动调用 `scanStore.getState().startScan()`，观察 GLB 模型的扫描揭示效果。

### P1：Point Cloud Shader（共享 uniforms）

**目标**：点云与 mesh 同步被扫描光波"激活"。

**交付物**：
- `scanRevealPoints.ts` — 自定义 ShaderMaterial
- `ScanRevealPointCloudViewer.tsx` — 包装组件

**验证方式**：`viewMode: 'both'`，mesh 和点云的扫描边界视觉同步。

### P2：Annotation Trigger（逻辑层）

**目标**：扫描波触及 annotation 时自动打开面板。

**交付物**：
- `useScanAnnotationTrigger.ts` — 碰撞检测 + 触发队列
- `ScanOrchestrator.tsx` — 组合所有 hooks

**验证方式**：扫描过程中 annotation 面板按距离顺序自动弹出。

### P3：Camera Director（叙事层）

**目标**：镜头跟随扫描进程自动运镜，用户可随时打断。

**交付物**：
- `useCameraDirector.ts` — 运镜脚本 + 控制权交接

**验证方式**：全流程从黑屏到全景的"纪录片"体验。

---

## 八、Shared Uniforms 机制

所有 shader 共享同一组 uniform 值，通过 `useRef` 持有：

```typescript
// useScanEngine.ts 内部
const uniformsRef = useRef({
  uScanRadius:      { value: 0 },
  uScanOrigin:      { value: new THREE.Vector3(0, 0, 0) },
  uWavefrontColor:  { value: new THREE.Color(0x00fff0) },
  uEdgeWidth:       { value: 0.5 },
  uTransitionWidth: { value: 2.0 },
})

// useFrame 中更新
useFrame((_, delta) => {
  // 只更新 .value，不重建对象
  uniformsRef.current.uScanRadius.value = currentRadius
})
```

Mesh 的 `onBeforeCompile` 和 Points 的 `ShaderMaterial` 引用同一个 `uniformsRef.current` 中的对象。由于 Three.js uniform 是通过引用传递的，更新 `.value` 即可同步到所有材质，**无需遍历材质列表**。

---

## 九、性能预算

| 开销 | 来源 | 预期影响 |
|------|------|---------|
| Uniform 更新 | 每帧 5 个 float/vec3 | 可忽略 |
| 碰撞检测 | 每帧遍历 ~20 annotations | 可忽略（纯 JS 距离计算） |
| Shader 复杂度 | 每片段增加 1 次 `length()` + 2 次 `smoothstep` | 极低 |
| 额外 draw call | 0（替换材质，不增加 mesh） | 无 |
| 内存 | ShaderMaterial 编译缓存 | 一次性，~几 KB |

**瓶颈不在扫描系统**。现有的大型 PLY（百万级点）本身已是性能瓶颈，扫描 shader 增加的开销远小于顶点处理本身。

---

## 十、风险与缓解

| 风险 | 缓解策略 |
|------|---------|
| glTF 材质多样性（Standard, Physical, 带/不带 map） | `onBeforeCompile` 注入的 chunk 名称在所有 PBR 材质中通用。首次集成时 log shader source 确认注入点存在 |
| 扫描中切换 scene | 监听 `activeSceneId` 变化 → 自动 `resetScan()`，回到 idle |
| 扫描中切换 viewMode | Scan viewer 和 normal viewer 都在 Suspense 内，切换时 Suspense fallback 处理过渡 |
| Camera Director 与用户输入冲突 | pointerdown 检测 → 0.5s lerp 交还。Camera Director 停止但扫描引擎继续 |
| onBeforeCompile 在 Three.js 升级后失效 | 注入点使用稳定的 `#include <...>` chunk 名称（common, begin_vertex, dithering_fragment），这些在 Three.js 主版本内不会变 |

---

*文档更新时间：2026年3月10日*
