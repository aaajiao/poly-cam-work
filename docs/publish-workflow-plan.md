# Rich Media Annotation Publish Workflow — Implementation Plan

> Stack: Vercel Functions + Vercel Blob (全 Vercel 路线)  
> Status: Draft  
> Date: 2026-03-07

---

## 一、整体架构

```
编辑者浏览器                    Vercel
┌──────────────┐       ┌─────────────────────────┐
│ React App    │──────▶│ /api/auth/login          │ ← 密码校验，发 cookie
│ (Vite SPA)   │──────▶│ /api/draft/:sceneId      │ ← GET/PUT 草稿 JSON
│              │──────▶│ /api/media/upload         │ ← 拿 client upload token
│              │──────▶│ /api/publish/:sceneId     │ ← 冻结 draft → release
│              │──────▶│ /api/release/:sceneId     │ ← GET latest（公开）
│              │──────▶│ /api/rollback/:sceneId    │ ← 切回旧版本
└──────────────┘       └─────────────────────────┘
                                │
                        ┌───────┴───────┐
                        │  Vercel Blob  │
                        │  (CDN 自带)    │
                        └───────────────┘
```

- 前端：Vite SPA（现有），部署到 Vercel 静态托管。
- 后端：Vercel Functions（`api/` 目录），处理鉴权、草稿读写、发布、回滚。
- 存储：Vercel Blob，存草稿 JSON、发布快照 JSON、媒体文件（图片）。
- 部署代码和发布内容完全解耦：`git push` 只更新前端；内容通过 Publish API 独立发布。

---

## 二、Vercel Blob 对象结构

```
scenes/{sceneId}/draft.json              ← 当前草稿（含 revision 字段）
scenes/{sceneId}/releases/{version}.json ← 不可变发布快照
scenes/{sceneId}/live.json               ← { "version": 3 }
media/{sha256-prefix}.{ext}              ← 图片（内容哈希文件名，永久缓存）
```

---

## 三、数据 Schema

### draft.json / releases/{version}.json（结构相同）

```ts
interface SceneDraft {
  sceneId: string
  revision: number            // 乐观并发控制（每次 PUT +1）
  annotations: Annotation[]   // 复用现有 Annotation 类型，images 里改用 Blob URL
  updatedAt: number           // timestamp ms
  publishedAt?: number        // 仅 release 有
  publishedBy?: string        // 仅 release 有
  message?: string            // 发布备注
}
```

### live.json

```ts
interface LivePointer {
  version: number
}
```

### Annotation.images 变化

当前：`AnnotationImage.id` 指向 IndexedDB key，`thumbnailId` 指向缩略图 key。  
改为：`AnnotationImage.url` 指向 Vercel Blob 公开 URL，删除 `thumbnailId`（CDN 直接访问，前端用 CSS 做缩略）。

```ts
// Before
interface AnnotationImage {
  id: string           // IndexedDB key
  filename: string
  thumbnailId: string  // IndexedDB thumbnail key
}

// After
interface AnnotationImage {
  url: string          // Vercel Blob public URL
  filename: string
}
```

---

## 四、API Contract

### 鉴权

| Endpoint | Method | Auth | Request Body | Response |
|---|---|---|---|---|
| `/api/auth/login` | POST | 无 | `{ password: string }` | Set `HttpOnly` cookie; `{ ok: true }` |
| `/api/auth/logout` | POST | cookie | — | Clear cookie; `{ ok: true }` |

### 草稿

| Endpoint | Method | Auth | Request Body | Response |
|---|---|---|---|---|
| `/api/draft/:sceneId` | GET | cookie | — | `SceneDraft` JSON |
| `/api/draft/:sceneId` | PUT | cookie | `{ draft: SceneDraft, expectedRevision: number }` | `{ ok: true, revision: number }` or `409 Conflict` |

### 媒体上传

| Endpoint | Method | Auth | Request Body | Response |
|---|---|---|---|---|
| `/api/media/upload` | POST | cookie | `{ filename: string, contentType: string }` | `{ clientToken: string }` (Vercel Blob client upload token) |

### 发布 / 回滚

| Endpoint | Method | Auth | Request Body | Response |
|---|---|---|---|---|
| `/api/publish/:sceneId` | POST | cookie | `{ message?: string }` | `{ ok: true, version: number }` |
| `/api/release/:sceneId` | GET | **公开** | Query: `?version=N` (可选) | `SceneDraft` JSON (默认 latest) |
| `/api/rollback/:sceneId` | POST | cookie | `{ version: number }` | `{ ok: true, version: number }` |

---

## 五、鉴权方案（最小实现）

- 环境变量 `ADMIN_PASSWORD`（Vercel Dashboard 设置，不入代码库）。
- `POST /api/auth/login`：校验密码 → 签发 HMAC-SHA256 签名的 `HttpOnly`、`Secure`、`SameSite=Strict` cookie（有效期 7 天）。
- 签名密钥：环境变量 `AUTH_SECRET`（随机 32+ 字符）。
- 所有写接口（draft PUT、media upload、publish、rollback）校验 cookie 签名 → 未通过返回 `401`。
- 读 release 接口 **不校验**（公开可访问）。

---

## 六、前端改造点

| 文件 | 改动描述 |
|---|---|
| `src/types/index.ts` | `AnnotationImage`：`id` + `thumbnailId` → `url`（Blob URL） |
| `src/storage/imageStorage.ts` | 新增 `VercelBlobImageStorage` 实现 `ImageStorage` 接口；上传走 `@vercel/blob/client` |
| `src/store/viewerStore.ts` | `partialize` 不再 persist `annotations`；新增 `loadDraft` / `saveDraft` / `publishDraft` actions |
| `src/components/ui/ImageUpload.tsx` | 上传改走 Vercel Blob client upload（拿 token → 直传） |
| `src/components/ui/ImagePreview.tsx` | 从 IndexedDB blob → 直接用 `<img src={url}>` |
| `src/components/sidebar/` | 新增 `PublishButton` + `LoginDialog` 组件 |
| `src/components/toolbar/Toolbar.tsx` | 集成 Publish / Login 入口 |
| `api/` 目录（新建） | 7 个 Vercel Function 文件 |
| `vercel.json`（新建） | 路由配置 + 环境变量引用 |

---

## 七、迁移方案（本地数据导入）

做一次性 "Import Local Data" 按钮（登录后可见）：

1. 读 `localStorage['polycam-viewer-state']` 里的 `annotations`。
2. 遍历每个 annotation 的 `images`，从 IndexedDB 读 blob → 上传 Vercel Blob → 替换为远端 URL。
3. 整合写入远端 `draft.json`。
4. 成功后清除本地 `localStorage` annotation 数据 + IndexedDB `polycam-images`。

---

## 八、并发保护

即使单编辑者也建议做（防多窗口覆盖）：

- `draft.json` 带 `revision` 字段。
- `PUT /api/draft/:sceneId` 要求携带 `expectedRevision`。
- 服务端校验 `expectedRevision === currentRevision`，不匹配返回 `409 Conflict`。
- 前端收到 409 后提示"内容已被其他窗口修改，请刷新"。

---

## 九、实施顺序（按 PR 粒度）

### PR 1: API 骨架 + 鉴权
- `api/auth/login.ts`、`api/auth/logout.ts`
- Cookie 签名/校验工具函数
- `vercel.json` 基础配置
- 环境变量文档（`.env.example`）

### PR 2: Blob 存储层 API
- `api/media/upload.ts`（生成 client upload token）
- `api/draft/[sceneId].ts`（GET / PUT）
- `api/publish/[sceneId].ts`
- `api/release/[sceneId].ts`（公开读）
- `api/rollback/[sceneId].ts`

### PR 3: 前端接入草稿
- 改 `src/types/index.ts`（AnnotationImage schema）
- 新增 `VercelBlobImageStorage` 实现
- 改 store persist 策略 → 远端 draft load/save
- 改 `ImageUpload.tsx` → Vercel Blob client upload
- 改 `ImagePreview.tsx` → URL 直接渲染

### PR 4: 前端接入发布
- `PublishButton` 组件
- `LoginDialog` 组件
- Release 读取逻辑（未登录用户看 latest release）
- Toolbar 集成

### PR 5: 本地迁移工具
- `ImportLocalData` 按钮组件
- IndexedDB → Blob 批量上传
- localStorage → draft 写入
- 迁移成功后清理本地数据

### PR 6: 部署验证
- Vercel 环境变量配置（`POLYCAM_BLOB_READ_WRITE_TOKEN`、`ADMIN_PASSWORD`、`AUTH_SECRET`）
- 端到端冒烟测试
- AGENTS.md 更新（补充部署/发布相关文档）

---

## 十、环境变量

| 变量名 | 用途 | 设置位置 |
|---|---|---|
| `POLYCAM_BLOB_READ_WRITE_TOKEN` | Vercel Blob 读写 token（推荐） | Vercel Dashboard → Storage → Blob |
| `ADMIN_PASSWORD` | 编辑者登录密码 | Vercel Dashboard → Settings → Environment Variables |
| `AUTH_SECRET` | Cookie 签名密钥（随机 32+ 字符） | Vercel Dashboard → Settings → Environment Variables |

兼容说明：旧的 `BLOB_READ_WRITE_TOKEN` 仍可作为回退变量名使用。

---

## 十一、依赖新增

```json
{
  "dependencies": {
    "@vercel/blob": "^2.0.0"
  }
}
```

无其他新依赖。鉴权用原生 `crypto` HMAC，不需要 JWT 库。
