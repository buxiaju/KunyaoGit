# Changelog

所有 KunyaoGit 的显著变更都记录在此文件。版本遵循 [Semantic Versioning](https://semver.org/)。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

---

## [0.6.0] - 2026-08-26

### Added
- 📎 **Release 附件上传 / 下载 / 删除**（GitHub + Gitee 双平台）
  - 创建 release 时可同时选择多个本地附件（`dialog.showOpen` 多选），提交后逐个上传
  - 已发布 release 可在详情抽屉继续上传 / 下载 / 删除附件
  - **GitHub**：`oct.repos.uploadReleaseAsset` + `deleteReleaseAsset`，单文件软限 2GB
  - **Gitee**：`POST .../releases/{id}/attach_files` multipart + `DELETE .../attach_files/{id}`，单文件 ≤ 100MB
  - **ReleaseAsset** 扩展：新增 `id` / `state` / `contentType` / `uploadedAt` / `htmlUrl` 字段（删除 / 后续操作依赖 `id`）
- ✏️ **Release 编辑** — 详情抽屉可改 `name` / `body` / `prerelease`；GitHub 支持 `draft` ↔ release 切换，Gitee 部分支持（不支持 `draft` 切换）
- 🎨 **Release 详情抽屉** — 640px 右侧抽屉，body 用 `marked` 渲染 Markdown（标题 / 列表 / 代码块 / 链接高亮），附件完整列表（大小 / 下载次数 / 下载 / 删除）+ 顶部「发布草稿」按钮（仅 GitHub draft）
- 🔍 **Release 列表搜索** — 顶部搜索框按 `tag` / `name` 实时过滤
- 🆕 **新建 IPC 通道** 3 个：`release:upload-asset` / `release:delete-asset` / `release:update`
- 🆕 **新建共享类型**：`ReleaseUpdateParams`（name? / body? / prerelease? / draft?）
- 🆕 **新对话框**：`release.detailDrawer` + `release.card` + `createReleaseForm` 三个组件（拆分自原 `ReleasesPage.tsx`）
- 🆕 **marked 依赖**（`marked@^15`，30KB 左右，替代引入 react-markdown 等重型方案）

### Changed
- `ReleasesPage.tsx` 重写：拆为 4 个组件（`ReleaseCard` / `ReleaseDetailDrawer` / `CreateReleaseForm` / `MarkdownBody`）
- `release.ts` 主进程实现：删内联 `parseRemoteUrl`，复用 `electron/lib/parseRemote.ts`（与 `src/lib/parseRemote.ts` 镜像实现）
- `ReleaseInfo.assets` 字段解析补全 `id` / `state` / `contentType` / `uploadedAt` / `htmlUrl`

### Tech
- `electron/lib/parseRemote.ts` **新增** — 与 `src/lib/parseRemote.ts` 镜像实现（主进程无法跨层 import 渲染层）
- `form-data@^4` 加入 dependencies（Gitee multipart 上传）
- `marked@^15` 加入 dependencies（Markdown 渲染）
- 自动化测试从 268 例扩到 **281 例**（+13：MarkdownBody 6 例 + ReleaseCard 7 例）
- 文档更新：`README.md` banner + 路线图 + 链接 / `CHANGELOG.md` v0.6 段 / `docs/features.md` §6 扩 / `docs/api-reference.md` §3.4 加 3 方法 + §2.13 扩字段 + `ReleaseUpdateParams` 子节

### Known Limitations
- **Gitee 单附件 ≤ 100MB**（平台限制；UI 在 Gitee 平台 + 大文件时给 amber 提示，建议改用 GitHub）
- **Release body Markdown 未 sanitize**（来源是仓库所有者自己编写，信任源；未来允许非 owner 编辑时应加 DOMPurify）
- **附件上传无进度条**（v0.6 不做；等真有大文件场景再加 progress event）

---

## [0.5.0] - 2026-08-25

### Added
- ⌨️ **Ctrl+P 跳转文件** — 复用命令面板组件，VS Code 式模糊搜索（连续字符加分 + 路径分隔符后字符加分）；git ls-files --cached --others --exclude-standard 上限 5000 文件
- 📜 **文件历史**（FileHistoryPanel 侧边抽屉）— 编辑器顶部「历史」按钮打开，commit 列表（git log --follow 跟踪重命名）+ 点开展开 diff
- 🔍 **Blame** — 点击 Monaco 行号 gutter 触发浮窗，显示该行 commit hash / 作者 / 日期 / message
- 🧪 **自动化测试** — 268 例（12 文件，3 秒跑完）：新增 FileHistoryPanel 13 例 + useShortcuts Ctrl+P 6 例 + fuzzyMatch 14 例 + gitService.listFiles 9 例

### Changed
- 命令面板增加 `mode: 'command' | 'file'` 状态
- `useShortcuts` 新增 `Ctrl/Cmd + P` / `Ctrl/Cmd + E`（v0.5+ 打开文件跳转模式）
- 共享类型新增 `GitFile`（path, status?）/ `BlameLine`（line, hash, author, email, date, message）
- IPC 通道新增 4 个：`git:ls-files` / `git:blame` / `git:file-log` / `git:file-diff`

### Tech
- 解析 `git blame --line-porcelain` 输出为 `BlameLine[]`（逐行扫描 + 块边界处理）
- 解析 `git log --follow --format=%H|%h|%an|%ae|%cI|%s` 输出为 `CommitInfo[]`
- 自实现 fuzzy match 算法（顺序子序列 + 多种加权）替代引入 fuse.js / fuzzysort
- `vitest.config.ts` 独立于 `vite.config.ts`（避开 vite-plugin-electron 的 renderer shim 在 ESM 下 `require` 崩溃）

---

## [0.4.0] - 2026-08-24

### Added
- 📊 **底部状态栏** — 三段式布局实时显示：左（仓库名/分支/↑N↓M 同步）、中（已暂存/未暂存/冲突 计数）、右（应用版本号）
- ⌨️ **全局快捷键** — Ctrl/Cmd+Shift+P 打开命令面板、Ctrl/Cmd+R 刷新、Shift+? 显示速查表（输入框内自动让位）
- 🔍 **命令面板** — VS Code 式 Ctrl+Shift+P 模态：4 类 20+ 命令（git/navigation/view/settings），支持模糊搜索 + 键盘导航
- 📦 **Stash 队列** — 折叠面板集成在 ChangesPanel 顶部，提供 Apply（保留）/ Pop（应用+删除）/ Show Diff（弹窗）/ Drop；message 自定义
- 🍒 **Cherry-pick / Revert** — Commit 历史每行 hover 工具条入口，冲突时 toast 引导到变更页（复用现有冲突解决流程）
- 🌐 **PR / MR 创建** — 解析远程 URL（https / ssh / 含凭据）→ 自动拉默认 base 分支 + 默认 title 取 log[0] subject → GitHub（含 draft）+ Gitee 双平台支持
- 👁️ **可发现性改进** — 侧边栏底部「快捷键 ?」+「命令面板 ⇧P」常驻双按钮；「创建 Pull Request」按钮从 hover 提到 BranchPanel 标题行 + RepoPage 顶部工具栏（双入口常驻）
- 🧪 **自动化测试** — 218 例单元 + 组件测试（10 文件，约 3 秒跑完）：Vitest 4 + happy-dom + Testing Library 16

### Changed
- Layout 改外层 flex column 布局，main 区域 flex-1，底部挂载 StatusBar

### Fixed
- v0.3.7 工作区状态解析错误（未暂存修改被误显示为已暂存）— 继续保留

### Tech
- `electron-store` 必须锁 v8.x（v10+ 是 ESM-only，与 CJS 主进程不兼容）
- 主进程 IPC 通道新增 13 个
- i18n 段：statusBar / command / cheatsheet / stash / commitActions / createPR / layout（共 100+ key）

---

## [0.3.8] - 2026-08-20

### Changed
- 📁 **项目目录清理** — 根目录 48 个日志文件统一归档到 `logs/` 目录（build/publish/debug 三类）
- 🔧 **变更面板布局修复** — 文件多时提交信息框不再被挤出可视区域，文件列表可正常滚动
- 📝 **文档完善** — 更新 ARCHITECTURE.md / development-guide.md / features.md 反映最新结构
- 🧹 **.gitignore 优化** — 合并冗余 release-v* 规则，统一日志忽略模式

---

## [0.3.7] - 2026-08-18

### Fixed
- 🔧 **修复未暂存修改被误显示为「已暂存」**（v0.4.0 保留此修复）
  - 根因：simple-git 的 `status()` 中 `modified` 数组**同时包含未暂存与已暂存修改**，旧代码把它全部标为 `staged: true`
  - 修复：`git:status` 改用 `git status --porcelain` 的 `index`（暂存区）/ `working_dir`（工作区）列**精确区分**
  - 效果：「变更」页现在真实反映暂存区；提交不再误报「nothing to commit」

---

## [0.3.6] - 2026-08-15

### Changed
- 🔧 **提交改用 `git commit` 原生执行 + 自解析** — 不再依赖 simple-git 的 commit 结果解析
  - 提交成功后自行解析 hash，支持 `--amend` / `--signoff`
  - 失败时错误信息显示 **git 原始输出 + 当前暂存区真实状态**
- 🔄 **提交失败后自动刷新工作区状态** — 「变更」面板在提交失败时强制重新读取 git 状态

---

## [0.3.5] - 2026-08-12

### Fixed
- 🔧 **修复「提交并推送」假成功**
  - 根因：`GitService.commit` 向 simple-git 传了 `['-m', message]`（数组被当作多条提交信息），实际执行 `git commit -m -m ...` 静默失败
  - 修复：改为 `commit([message], options)` 正确调用形式
  - **分支切换/创建一并修复**：`checkout`/`createBranch` 此前多传了 `checkout` 前缀

### Changed
- 📚 项目文档全面完善至 v0.3.4+ 功能

---

## [0.3.4] - 2026-08-10

### Added
- 🔍 **云端仓库搜索** — GitHub / Gitee 仓库页顶部栏新增搜索框
  - GitHub 走官方 Search API 全平台搜索
  - Gitee 官方搜索 API 已失效（恒返回空），自动降级为「我的仓库」本地过滤

---

## [0.3.3] - 2026-08-08

### Fixed
- 🔧 **应用内更新下载容错** — 探活最多 2 次，整轮最多 6 轮重试，同源重试 2 次

---

## [0.3.0] - 2026-08-01

### Added
- 📁 **本地文件管理** — 仓库「文件」页支持对本地仓库直接增删改
- 🚀 **多远程推送**（GitHub / Gitee）— Push 按钮下拉选择
- 🏠 **仓库入口优化** — 打开/克隆后自动进入仓库页
- 🔄 **保存即刷新** — 编辑器保存自动刷新工作区状态

### Fixed
- 🔧 构建修复 — 移除 package.json 的 UTF-8 BOM

---

## [0.2.0 ~ 0.2.6] - 2026-07

### Added
- v0.2.2 应用内自动更新
- v0.2.3 多语言支持（中/英切换）
- v0.2.4 下载速度大幅提升（3~6 倍）
- v0.2.5 三主题切换（暗色 / 深蓝 / 亮色）
- v0.2.6 探活改用 GET 替代 HEAD

---

## 历史版本

更早期版本（v0.1.0 ~ v0.1.x）见 [GitHub Releases](https://github.com/buxiaju/KunyaoGit/releases) 归档。
