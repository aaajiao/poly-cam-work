# poly.cam.work 文档中心

欢迎来到 `poly.cam.work` 的文档中心。本项目是艺术家 aaajiao 长期项目 *Symbiosis*（共生）的技术基础与数字化档案库。

[**English Root README**](../README.md)

## 作品语境 (Work Context)

- [**项目宣言 (Manifesto)**](manifesto.md) - 阐述本项目的立场、核心概念（入神与出神）以及艺术实践的背景。
- [**Symbiosis 项目背景**](aaajiao_symbiosis_project.md) - 深入了解 *Symbiosis* 项目的十年历程、研究内容、核心冲突以及相关视觉素材。

## 方法与阅读入口 (Methods/Entry)

`poly.cam.work` 不仅仅是一个 3D 查看器。它是一个将物理劳动与数字表现连接起来的数字化档案与研究平台。

- **3D 场景浏览**: 通过整合高精度 LiDAR 扫描与上下文媒体，为 *Symbiosis* 项目提供了一个多维度的探索空间。
- **富媒体标注**: 记录工业生产、青年群体的不确定性以及全球贸易格局的变迁。
- **叙事逻辑**: 在算法治理与地缘政治的宏大叙事中，寻找人与材料、人与人之间真实的连接。

## 技术结构 (Technical Structure)

有关开发、部署和工作流的详细技术说明，请参阅根目录下的 [README.md](../README.md)。

补充说明：项目代码可以在 macOS 和 Linux 上运行，但 `node_modules` 目录不能跨操作系统直接复用。由于 Rollup 会按平台安装原生包，在不同机器之间移动仓库后，应当在当前机器上重新执行一次 `bun install`；如果复制过来的 `node_modules/` 仍然报平台不匹配，就删除后再重新安装。

- **核心架构**: 基于 Vite 6 + React 19 + Three.js 的可视化平台。
- **数据流**: 采用 IndexedDB 本地优先存储与 Vercel Blob 云端同步的发布机制。
- **工作流**: 包含场景发布、版本管理、回滚机制以及官方场景的资产同步流程。
- **测试工作流**: 参阅 [TESTING.md](TESTING.md)，了解 Vitest 与 Playwright 的分层职责、命令选择，以及本地卡住时的排查路径。

## 外部链接 (External Links)

- [**1bit 游戏**](https://1bit-zeta.vercel.app) - 可漫游的数字废墟，由制造业崩塌的残骸生成。
- [**Two Rituals 视频**](https://vimeo.com/1138253490) - 记录“入神”与“出神”两种状态的影像作品。
- [**WorldLabs 3D**](https://marble.worldlabs.ai/world/3ed003df-ee7f-46d6-950b-3d16c9b31a18) - 使用 WorldLabs 构建的 3D 世界。

---

*文档更新时间：2026年3月8日*
