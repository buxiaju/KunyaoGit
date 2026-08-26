# KunyaoGit 功能详解

> 面向用户与开发者的完整功能清单。当前版本：**v0.6.0**（见 `package.json`）。
> 所有功能均通过 Electron IPC 实现，渲染进程仅通过 `window.gitgui.*` 调用，主进程负责真正的本地 Git / 远程 API / 文件系统操作。

---

## 目录

1. [本地 Git 操作](#1-本地-git-操作)
2. [GitHub / Gitee 双平台集成](#2-github--gitee-双平台集成)
3. [Monaco Editor 代码编辑](#3-monaco-editor-代码编辑)
4. [Diff 视图（unified / split 双模式）](#4-diff-视图unified--split-双模式)
5. [拖拽上传](#5-拖拽上传)
6. [Release 管理 + CHANGELOG 自动生成](#6-release-管理--changelog-自动生成)
7. [应用内自动更新](#7-应用内自动更新)
8. [多语言支持（v0.2.3）](#8-多语言支持v023)
9. [三主题切换（v0.2.5）](#9-三主题切换v025)
10. [设置页功能](#10-设置页功能)
11. [安全特性](#11-安全特性)
12. [本地文件管理（v0.3.0）](#12-本地文件管理v030)
13. [多远程推送（v0.3.0）](#13-多远程推送v030)
14. [云端仓库搜索（v0.3.4）](#14-云端仓库搜索v034)
15. [Stash 队列管理（v0.4）](#15-stash-队列管理v04)
16. [Cherry-pick / Revert（v0.4）](#16-cherry-pick--revertv04)
17. [创建 PR / MR（v0.4）](#17-创建-pr--mrv04)
18. [命令面板与快捷键（v0.4）](#18-命令面板与快捷键v04)
19. [底部状态栏（v0.4）](#19-底部状态栏v04)
20. [Ctrl+P 跳转文件（v0.5）](#20-ctrlp-跳转文件v05)
21. [文件历史 + Blame（v0.5）](#21-文件历史--blamev05)

> **v0.6 增量**在 [§6 Release 管理](#6-release-管理--changelog-自动生成) 内就地扩写（附件上传/下载/删除、Release 编辑、Markdown 渲染详情抽屉、列表搜索、发布草稿），未单列新章节。

---

## 1. 本地 Git 操作

本地 Git 操作基于 [`simple-git`](https://github.com/steveukx/git-js) 封装本地 `git` 命令行，主进程在 `electron/services/git.ts` 的 `GitService` 类中实现，IPC 处理器位于 `electron/ipc/git.ts`，通道常量定义在 `shared/ipc-channels.ts`。

应用不实现 Git 协议本身，而是通过子进程调用系统 `git`，因此要求用户机器上 `git` 在 PATH 中（见 `README.md` 系统要求）。

### 1.1 仓库管理

| 功能 | 渲染层调用 | 说明 |
| --- | --- | --- |
| 打开本地仓库 | `gitgui.repo.openDialog()` | 弹出原生目录选择对话框 |
| 校验并打开 | `gitgui.repo.open(path)` | 校验是否为 git 目录，写入最近列表 |
| 最近仓库列表 | `gitgui.repo.listRecent()` | 从 electron-store 读取 |
| 移除最近项 | `gitgui.repo.removeRecent(path)` | 仅清记录，不删仓库 |
| 克隆远程仓库 | `gitgui.repo.clone(url, dest)` | `simple-git` clone |
| 初始化新仓库 | `gitgui.repo.init(path)` | `simple-git` init |
| 读取仓库信息 | `gitgui.repo.getInfo(path)` | 名称 / 当前分支 / remote URL |

### 1.2 工作区与变更（Changes）

| 功能 | IPC 通道 | 说明 |
| --- | --- | --- |
| 查看文件状态 | `git:status` | 返回 `FileStatus[]`，含 added / modified / deleted / renamed / untracked / conflicted |
| 暂存 | `git:stage` | 暂存单个文件或全部 |
| 取消暂存 | `git:unstage` | 撤回暂存区 |
| 丢弃修改 | `git:discard` | 危险操作，丢弃工作区改动 |

界面入口为 `src/components/repo/ChangesPanel.tsx`，列出工作区文件状态，支持批量暂存 / 取消 / 丢弃。

### 1.3 提交历史与日志

| 功能 | IPC 通道 | 说明 |
| --- | --- | --- |
| 提交历史 | `git:log` | 返回 `CommitInfo[]`，含 hash / author / date / message / refs / parents |
| 提交 | `git:commit` | 支持 amend、sign-off |
| Diff | `git:diff` / `git:diff-file` | 主进程自实现 unified diff 解析 |

界面入口 `src/components/repo/CommitHistory.tsx`，以时间线形式展示，并标记 Tag 与分支引用。

### 1.4 分支管理

| 功能 | IPC 通道 | 说明 |
| --- | --- | --- |
| 分支列表 | `git:branches` | 含 `ahead` / `behind`、upstream、最后提交 |
| 切换分支 | `git:checkout` | - |
| 新建分支 | `git:create-branch` | - |
| 删除分支 | `git:delete-branch` | - |
| 合并 | `git:merge` | 支持 no-FF / squash / 自定义 message |

界面入口 `src/components/repo/BranchPanel.tsx`，提供 checkout / new / delete / merge 操作。

### 1.5 远程同步与 remote 管理

| 功能 | IPC 通道 | 说明 |
| --- | --- | --- |
| 推送 | `git:push` | 支持 force、setUpstream |
| 拉取 | `git:pull` | - |
| 抓取 | `git:fetch` | - |
| 列 remote | `git:remote-list` | 返回 `RemoteInfo[]`，自动识别 github / gitee / other |
| 添加 remote | `git:remote-add` | - |
| 移除 remote | `git:remote-remove` | - |

### 1.6 Stash、Reset 与冲突解决

| 功能 | IPC 通道 | 说明 |
| --- | --- | --- |
| 暂存工作区 | `git:stash` | - |
| 恢复暂存 | `git:stash-pop` | - |
| 重置 | `git:reset` | 支持 soft / mixed / hard |
| 读取冲突 | `git:read-conflict` | 读取 ours / theirs 内容 |
| 解决冲突 | `git:resolve-conflict` | 一键采用 ours 或 theirs |

冲突解决支持「一键 ours / theirs」，避免手动编辑冲突标记。

---

## 2. GitHub / Gitee 双平台集成

双平台通过 REST API 集成，不依赖各自 SDK：GitHub 用 [`@octokit/rest`](https://github.com/octokit/rest.js)，Gitee 没有官方 SDK，用 `axios` 直连 `https://gitee.com/api/v5/...`。IPC 处理器分别在 `electron/ipc/github.ts` 和 `electron/ipc/gitee.ts`。

### 2.1 仓库管理

| 功能 | GitHub 通道 | Gitee 通道 | 说明 |
| --- | --- | --- | --- |
| 仓库列表 | `gh:list-repos` | `gt:list-repos` | 支持过滤、搜索 |
| 创建仓库 | `gh:create-repo` | `gt:create-repo` | - |
| 删除仓库 | `gh:delete-repo` | `gt:delete-repo` | 危险操作 |

界面入口 `src/pages/RemotePage.tsx`，列出双平台仓库。

> ★ v0.3.4：RemotePage 顶部栏新增搜索框，可云端搜索仓库（GitHub 官方 Search API；Gitee 降级为「我的仓库」本地过滤），详见 §14。

### 2.2 PR 与 Issue

| 功能 | GitHub 通道 | Gitee 通道 |
| --- | --- | --- |
| 列出 PR | `gh:list-prs` | `gt:list-prs` |
| 列出 Issue | `gh:list-issues` | `gt:list-issues` |

返回类型为 `PullRequestInfo` / `IssueInfo`，含编号、标题、状态、作者、base/head 分支等。

### 2.3 Contents API（远程文件浏览 / 编辑 / 删除）

| 功能 | GitHub 通道 | Gitee 通道 | 说明 |
| --- | --- | --- | --- |
| 列目录 | `gh:contents-list` | `gt:contents-list` | 返回 `RemoteFile[]` |
| 读取文件 | `gh:contents-read` | `gt:contents-read` | 返回 `RemoteFileContent`（解码后文本） |
| 写入 / 新建 | `gh:contents-write` | `gt:contents-write` | 含 commit message |
| 删除文件 | `gh:contents-delete` | `gt:contents-delete` | 含 commit message |

界面入口 `src/pages/RepoDetailPage.tsx`，提供远程仓库的 Contents 浏览器 + Monaco 在线编辑，保存即调 Contents API 提交。

### 2.4 Token 安全存储

- Token 永远只在主进程使用，渲染层只能通过 `gitgui.settings.setAuth()` 间接写入
- 存储于 `%APPDATA%\gitgui\gitgui-settings.json` 的 `auth.github.token` / `auth.gitee.token`
- 缺失 token 的请求会在 IPC handler 提前拦截，返回 `{ ok: false, error: '未配置 GitHub Token' }`，避免把原始 token 透露给渲染层或暴露 GitHub 的英文 401 错误

---

## 3. Monaco Editor 代码编辑

集成 [`@monaco-editor/react`](https://github.com/suren-atoyan/monaco-editor)（VS Code 同款编辑器）。

- 组件：`src/components/repo/EditorPane.tsx`（Monaco 包装）
- 用途：本地文件编辑 + 远程仓库文件在线编辑（RepoDetailPage）
- Vite 配置：`vite.config.ts` 中 `optimizeDeps.exclude: ['monaco-editor']`，由 ESM 按需加载，避免巨型包参与预优化
- 工作流：本地文件保存即暂存（`git add`），可一键「提交并推送」
- 远程文件：保存直接调 Contents API（带 commit message），无需本地 clone

支持常见语言的语法高亮与基础编辑能力。

---

## 4. Diff 视图（unified / split 双模式）

- 组件：`src/components/repo/DiffViewer.tsx`（自实现，非 diff2html 渲染）
- 解析：主进程 `git:diff` / `git:diff-file` 自实现 unified diff 解析，返回 `FileDiff` → `DiffHunk[]` → `DiffLine[]`
- 模式：`unified`（统一）/ `split`（并排），由 `AppSettings.diffView` 控制，可在设置页切换
- 展示：暂存 / 未暂存变更查看，区分 add / del / context 行

```ts
// shared/types.ts
export interface DiffLine {
  type: 'add' | 'del' | 'context';
  content: string;
  oldLine?: number;
  newLine?: number;
}
```

`diff2html` 作为依赖保留备用，但主项目里 DiffViewer 是自实现 unified diff。

---

## 5. 拖拽上传

支持将本地文件 / 文件夹拖拽到远程仓库视图，自动：

- 保留目录结构
- 执行 `git add`
- 调 Contents API 逐个上传

> 见 `README.md`：「拖拽上传本地文件 / 文件夹（自动保留目录结构 + `git add`）」。

适合批量把本地代码推到远程仓库，免去逐个新建文件的繁琐操作。

---

## 6. Release 管理 + CHANGELOG 自动生成

### 6.1 Release 管理

| 功能 | IPC 通道 | 说明 |
| --- | --- | --- |
| 列 Release | `release:list` | 返回 `ReleaseInfo[]`（含附件完整字段） |
| 创建 Release | `release:create` | 含 Tag / Name / Body / draft / prerelease |
| 删除 Release | `release:delete` | - |
| 获取详情 | `release:get` | - |
| 发布草稿 | `release:publish` | draft → 正式发布（GitHub）；Gitee 创建即发布 |
| **★ v0.6+ 编辑** | `release:update` | 改 name / body / prerelease / draft |
| **★ v0.6+ 上传附件** | `release:upload-asset` | GitHub：Octokit `uploadReleaseAsset`；Gitee：`POST .../attach_files` multipart |
| **★ v0.6+ 删除附件** | `release:delete-asset` | GitHub：Octokit `deleteReleaseAsset`；Gitee：`DELETE .../attach_files/{id}` |

主进程 `electron/ipc/release.ts`，GitHub 与 Gitee 双平台同步管理。界面入口 `src/pages/ReleasesPage.tsx`，针对当前本地仓库的 Release。

**附件大小限制**：
- GitHub：单文件软限 2GB（实际可用更大）
- Gitee：单文件 ≤ 100MB；超过建议改用 GitHub（UI 会给提示）

**v0.6+ UI 完善**：
- 列表顶部搜索框（按 tag / name 过滤）
- 每条 release 卡片：「详情」入口开右侧 640px 抽屉
- 详情抽屉：Markdown 渲染 body + 附件完整列表（下载/删除/上传新）+ 编辑模式（改 name/body/prerelease）+ 发布草稿
- 创建表单：可同时选择多个附件，先创建 release 再逐个上传
- Release body 通过 `marked` 渲染（v0.6+），源码来自仓库所有者，可信任，暂不做 sanitize

### 6.2 CHANGELOG 自动生成

- 通道：`changelog:generate`
- 服务：`electron/services/changelog.ts`（Conventional Commits 分类器）
- 规范：遵循 [Conventional Commits](https://www.conventionalcommits.org/)
- 分组类型：`feat` / `fix` / `docs` / `refactor` / `perf` / `chore` / `other`

```ts
// shared/types.ts
export interface ChangelogGroup {
  type: 'feat' | 'fix' | 'docs' | 'refactor' | 'perf' | 'chore' | 'other';
  commits: CommitInfo[];
}
```

按提交信息前缀自动归类，生成结构化的版本更新说明，可直接填入 Release Body。

---

## 7. 应用内自动更新

> v0.2.2 引入真正的「应用内下载 + 自动安装」能力，v0.2.4 大幅提速（3~6 倍），v0.2.6 修复探活在某些 CDN 上的失败，v0.3.1 切换 Gitee 下载源并新增连接超时，v0.3.3 修复 requestFollow 致命 bug 并加入下载容错。
> 用户无需手动去浏览器下载安装包；本节按版本演进顺序说明。

### 7.1 整体流程

### 7.1 整体流程

```
App 启动
   ↓
useUpdateCheck（useEffect，启动 1.5s 后触发）
   ↓
window.gitgui.update.checkSilent()
   ↓
ipcMain UPDATE_CHECK_SILENT
   ↓
checkForUpdate()  // electron/services/update.ts
   ├─ fetchGithub()  → https://api.github.com/repos/buxiaju/KunyaoGit/releases/latest
   └─ fetchGitee()   → https://gitee.com/api/v5/repos/buxiaju/KunyaoGit/releases/latest
                       （使用 settings.auth.gitee.token，若有）
   ↓
compareVersion(current, latest) 选两个平台中版本最高的
   ↓
返回 { hasUpdate, currentVersion, latest, sources, dismissed }
   ↓
App 层逻辑：
  - 无更新 → 静默
  - 有更新 + 未 dismiss → UpdateDialog 弹窗
    - 立即下载并安装 → 应用内下载（v0.2.4 多连接提速 + v0.2.6 探活修复 + v0.3.1 源切换与连接超时 + v0.3.3 容错重试）→ 自动启动安装包 → 退出应用
    - 稍后 → 关闭弹窗
    - 浏览器打开 → shell.openExternal
    - 取消 / 错误重试
```

### 7.2 多源下载（Gitee 优先、GitHub 兜底）

主进程 `electron/ipc/update.ts` 中 `downloadSources(version)` 定义下载源顺序：

```ts
// 下载源：Gitee raw（国内快）优先，GitHub CDN 兜底
function downloadSources(ver) {
  return [
    { platform: 'gitee',
      url: `https://gitee.com/buxiaju/KunyaoGit/raw/master/.release-assets/KunyaoGit-Setup-${ver}-x64.exe` },
    { platform: 'github',
      url: `https://github.com/buxiaju/KunyaoGit/releases/download/v${ver}/KunyaoGit-Setup-${ver}-x64.exe` },
  ];
}
```

> ★ v0.3.1 起：Gitee 源已改为 **Release 附件下载 URL**（raw 对 >50MB 文件返回 403），上方代码块为 v0.3.0 及更早版本的下载源定义，详见 §7.11。

- **Gitee 优先**：国内下载速度快，安装包入库在 `.release-assets/`，通过 git raw 分发
- **GitHub 兜底**：Gitee 失败 / 返回 HTML（大文件受限）/ 超时，自动切换 GitHub Release CDN
- 跟随 3xx 重定向（最多 8 次），20s 连接超时
- 通过 `Content-Type` 判断：Gitee raw 对大文件可能返回 HTML 下载页而非真实文件，识别后自动切源

### 7.3 实时进度条

- 通道：`update:download-progress`（主进程 → 渲染进程，事件推送）
- 载荷：`DownloadProgress`

```ts
// shared/types.ts
export type DownloadPhase = 'preparing' | 'downloading' | 'done' | 'error' | 'cancelled';
export interface DownloadProgress {
  phase: DownloadPhase;
  percent: number;        // 0-100，totalBytes 未知时为 -1
  bytesReceived: number;
  totalBytes: number;      // 0 表示未知
  source?: 'gitee' | 'github';  // 当前正在下载的源
  message?: string;       // error/done 阶段的说明
  filePath?: string;      // done 阶段返回的本地安装包路径
  speedBps?: number;      // ★ v0.2.4：瞬时下载速率（字节/秒，downloading 阶段填）
}
```

界面 `src/components/common/UpdateDialog.tsx` 的 `DownloadPanel`：
- 已知大小时显示百分比进度条
- 未知大小时显示脉动动画
- 显示已接收 / 总字节数（B / KB / MB）
- 标注当前下载源（Gitee / GitHub）
- ★ v0.2.4 起额外显示瞬时下载速率（B/s / KB/s / MB/s）

### 7.4 自动安装

- 通道：`update:install`
- 流程：`shell.openPath(filePath)` 启动下载好的 NSIS 安装包 → 延迟 1.5s → `app.quit()`
- 退出当前应用以释放 exe 文件锁，让 NSIS 安装器覆盖替换文件
- 用户在弹窗确认后全自动完成，无需手动操作

### 7.5 取消下载

- 通道：`update:cancel-download`
- 实现：模块级 `active` 状态保存当前 `ClientRequest`，取消时置 `cancelled = true` 并 `req.destroy()`，同时删除已下载的临时文件
- 关闭弹窗（下载中）等价于取消下载

### 7.6 错误重试与浏览器兜底

- 下载失败进入 `error` 阶段，弹窗显示具体错误信息
- 「重试」按钮：重新触发 `startDownload()`，从首个源重新尝试
- 「浏览器下载」按钮：`shell.openExternal(htmlUrl)` 兜底手动下载

### 7.7 节流与忽略版本

- 静默检查 6 小时节流：基于 electron-store 的 `updateLastCheck` 时间戳
- 忽略版本：`update:dismiss(version)` 持久化到 `updateDismissedVersion`，下次同版本不再弹窗
- 主动检查：设置页 → 关于 → 立即检查更新（无视节流）

### 7.8 相关文件

| 文件 | 职责 |
| --- | --- |
| `electron/services/update.ts` | 版本检查、版本比较、GitHub/Gitee release API |
| `electron/ipc/update.ts` | IPC handler + 应用内下载安装 + 进度推送 + ★ v0.2.4 Range 多连接下载 + ★ v0.2.6 Range 探活 + ★ v0.3.1 下载源切换与连接超时 + ★ v0.3.3 requestFollow 修复与下载容错 |
| `src/hooks/useUpdateCheck.ts` | 启动 1.5s 后静默检查 |
| `src/stores/update.ts` | zustand store，驱动下载流程 |
| `src/components/common/UpdateDialog.tsx` | 弹窗 UI（询问 / 下载中 / 完成 / 错误） |

### 7.9 ★ v0.2.4：下载速度优化（3~6 倍提速）

v0.2.2 的单连接下载在 90MB 安装包上要 15~25s。v0.2.4 重构 `electron/ipc/update.ts` 的下载核心，解决 4 个瓶颈：

1. **多源 HEAD 探活并行** — Gitee raw + GitHub CDN 同时探活，省掉 Gitee 死等 8s
2. **HTTP Range 多连接分段下载**（4 路并发） — 单连接瓶颈消失
3. **keep-alive Agent 复用 TLS / TCP 句柄** — 免去重复握手
4. **进度事件 100ms 节流** — 避免 IPC 通道被刷爆（90MB ≈ 1400 次事件 → 10 次/秒）
5. **单 chunk 失败重试**（指数退避，最多 3 次） — 网络抖动不再崩整个下载
6. **瞬时速率计算** — 每 100ms 算一次，写入 `DownloadProgress.speedBps`

测试场景：从 GitHub release CDN 拉取 90MB 实际数据，4 路并发把单连接 18s 降到 4-6s。

### 7.10 ★ v0.2.6：探活兼容性修复

v0.2.2~v0.2.5 的下载器用 HEAD 请求探活，但部分 CDN / 防火墙对 HEAD 更敏感（直接 403 或超时），导致某些网络环境下 GitHub 探活失败、用户只能看到「github: HEAD 失败」这种误导性错误。

v0.2.6 改为 **`Range: bytes=0-0` GET 探活**（兼容性远好于 HEAD）：

- 206 响应：`Content-Range: bytes 0-0/{total}` 直接给到 total size
- 200 响应：忽略 Range 时，Content-Length 仍是 total size
- 读完 header 立即 `res.destroy()`，避免 200 情况把整文件拉下来
- 探活超时 8s → 15s（GET 比 HEAD 慢一点，给宽点）
- 错误信息**汇总所有源**失败原因（之前只显示最后一个错的源）

**典型错误信息示例**（v0.2.6）：

```
所有下载源都失败：github（请求失败（超时/网络））; gitee（Gitee raw 返 HTML（大文件受限））
```

可以一眼看出是「GitHub 走不通 + Gitee 大文件受限」还是「两个源都连不上」，方便诊断是网络问题还是源问题。

### 7.11 ★ v0.3.1：Gitee 下载源切换 + 连接超时

- Gitee 下载源从 raw 直链改为 **Release 附件下载 URL**（raw 对 >50MB 文件返回 403，安装包无法再通过 raw 分发）
- 新增连接建立阶段超时，网络异常时不再长时间挂起

### 7.12 ★ v0.3.3：修复 requestFollow 致命 bug + 下载容错

- **修复历史致命 bug**：`requestFollow` 使用 `https.request` 但缺少 `req.end()`，请求从未真正发送，下载必报「所有下载源都失败」
- **下载容错**：
  - 每源探活重试 2 次（8s 超时）
  - 全部失败整轮重试最多 6 轮（约 2 分钟），界面显示「网络波动，第 N/6 轮重试…」
  - 下载中断同源重试 2 次

---

## 8. 多语言支持（v0.2.3）

v0.2.3 引入中英双语切换，基于 **React Context + `useI18n` hook**，所有 UI 文案均可切换。

### 8.1 实现机制

- Provider：`src/i18n/index.tsx` 提供 `I18nProvider` + `useI18n()` hook
- 翻译字典：`src/i18n/zh.ts`（中文）+ `src/i18n/en.ts`（英文），按 namespace 分组（`common.*` / `settings.*` / `repo.*` / `update.*` / ...）
- 切换入口：设置页「语言」区块的两个按钮，或侧边栏底部语言快捷切换
- 占位符：支持 `{name}` / `{count}` 等参数化插值

```ts
// 组件内使用
const { t, lang, setLang } = useI18n();
t('settings.saved');                       // '已保存'
t('repo.stagedCount', { count: 3 });        // '已暂存 3 个文件'
```

### 8.2 相关文件

| 文件 | 职责 |
| --- | --- |
| `src/i18n/index.tsx` | I18nProvider / useI18n hook / t() 函数 |
| `src/i18n/zh.ts` | 中文翻译字典 |
| `src/i18n/en.ts` | 英文翻译字典 |
| `src/App.tsx` | 在根挂 `<I18nProvider lang={lang} setLang={setLang}>` |

---

## 9. 三主题切换（v0.2.5）

v0.2.5 引入 3 套 UI 主题：**暗色（默认）** / **深蓝** / **亮色**，通过 CSS 变量 + 选择器覆盖实现，零业务代码迁移。

### 9.1 三套主题

| 主题 | 主色 | 背景 | 文字 | 适合 |
| --- | --- | --- | --- | --- |
| **暗色** `dark`（默认） | 🟢 Emerald | gray-900 | gray-100 | 长时间编码护眼 |
| **深蓝** `ocean` | 🔵 Blue | sky-900 | sky-50 | 想要点色彩又稳重的 |
| **亮色** `light` | 🟢 Emerald | 纯白 | gray-900 | 白天 / 投影仪 |

### 9.2 实现机制

```css
/* src/styles/index.css */
:root[data-theme="dark"]  { --bg-app: rgb(17 24 39);  --primary-500: rgb(16 185 129); ... }
:root[data-theme="ocean"] { --bg-app: rgb(8 47 73);   --primary-500: rgb(59 130 246); ... }
:root[data-theme="light"] { --bg-app: rgb(255 255 255); --primary-500: rgb(16 185 129); ... }

[data-theme] .bg-gray-900 { background-color: var(--bg-app); }
[data-theme] .text-gray-100 { color: var(--text-primary); }
/* ... 30+ 覆盖规则，覆盖最常用的 gray-XXX / 透明色 / primary / danger */
```

特异性 `[data-theme] .class` = (0,2,0) > Tailwind `.class` (0,1,0)，所以覆盖稳定胜出。

### 9.3 主题切换流程

1. 用户在设置页点主题色卡 → `setTheme(theme)`
2. 立即调 `applyThemeToDOM(theme)`：写 `<html data-theme="...">` + 派发 `kg-theme-change` 事件
3. 异步 `settings.save({ theme })` 持久化到 electron-store
4. Monaco 编辑器收到事件后调 `monaco.editor.setTheme('vs-dark' | 'vs')` 跟切
5. CSS 变量切换，所有 `[data-theme] .bg-gray-XXX` 等覆盖规则即时生效

### 9.4 相关文件

| 文件 | 职责 |
| --- | --- |
| `shared/types.ts` | `Theme = 'dark' \| 'ocean' \| 'light'` |
| `src/hooks/useTheme.ts` | `useThemeSync` / `setTheme` / `monacoThemeFor` / `THEME_LIST` |
| `src/styles/index.css` | 3 套 CSS 变量 + 选择器覆盖 + 组件 utility |
| `src/components/Layout/Layout.tsx` | 根 div 挂 data-theme（由 `useThemeSync` 全局处理） |
| `src/pages/SettingsPage.tsx` | 主题切换 UI（3 个色卡） |

---

## 10. 设置页功能

界面入口 `src/pages/SettingsPage.tsx`，包含「关于 + 检查更新」卡片。

### 10.1 主题与 Git 配置

| 项 | 说明 |
| --- | --- |
| ★ 主题 | `dark` / `ocean` / `light`（`AppSettings.theme`），见 §9 |
| 语言 | `zh` / `en`（`AppSettings.language`），见 §8 |
| Git 可执行路径 | 自定义 `git` 路径（`AppSettings.gitPath`） |
| 默认克隆目录 | `AppSettings.defaultCloneDir` |
| 作者信息 | `authorName` / `authorEmail` |
| Diff 视图模式 | `unified` / `split` |

### 10.2 双平台 Token 管理

- GitHub / Gitee 标签分别填入 Personal Access Token
- 「测试并保存」：调 `settings:test-auth` 验证有效性后写入 electron-store
- **GitHub Token 权限建议**：`repo`、`read:user`（不需要 `admin:org`、`delete_repo`）
- **Gitee Token 权限建议**：`projects`、`pull_requests`、`issues`

### 10.3 Git 路径测试

- 通道：`settings:test-git`
- 校验指定路径是否为有效 `git` 可执行

### 10.4 关于 + 检查更新

- 显示当前版本（`app:get-version`）
- 「立即检查更新」按钮：调 `update:check`（主动检查，无视节流）
- v0.2.2 新增「立即下载并安装」入口，可随时触发更新流程
- v0.2.4+ 下载进度条带实时速率，详见 §7

---

## 11. 安全特性

### 11.1 contextIsolation

- `contextIsolation: true` + `nodeIntegration: false`
- 渲染进程（Chromium）**不能** 直接 `require('fs')` 或访问任何 Node / Electron API
- 所有 Node 能力必须走 IPC，渲染层只看到 `window.gitgui.*`（由 `electron/preload.ts` 的 `contextBridge` 暴露）

### 11.2 Content Security Policy（CSP）

- 在主进程 `setupCsp()` 中通过响应头注入
- dev / prod 模式配置不同，限制脚本来源、内联脚本等

### 11.3 Token 安全存储

- Token 永远只在主进程使用，渲染层**不接触**原始 token 字符串
- 渲染层只能 `gitgui.settings.setAuth()` 间接存入 electron-store
- 存储位置：`%APPDATA%\gitgui\gitgui-settings.json`
- 缺失 token 的远程请求在 IPC handler 提前拦截并返回中文友好错误，避免暴露 token 或 GitHub 英文 401

### 11.4 IPC 通道防 typo

- 所有通道名集中定义在 `shared/ipc-channels.ts` 的 `IPC` 常量对象
- 渲染层与主进程共用同一份字符串常量，杜绝手写通道名拼错

### 11.5 openExternal 白名单

- `update:open` 等 `shell.openExternal` 调用会校验 URL 协议（`/^https?:\/\//`），避免任意协议跳转

---

## 12. 本地文件管理（v0.3.0）

v0.3.0 在仓库「文件」页引入本地文件树，可在应用内直接管理仓库文件，无需切换到系统文件管理器。

### 12.1 文件树操作

| 操作 | 入口 | 说明 |
| --- | --- | --- |
| 新建文件 | 工具栏按钮 / 右键菜单 | 自动在 Monaco 中打开（见 §3） |
| 新建文件夹 | 工具栏按钮 / 右键菜单 | - |
| 重命名 | 右键菜单 | - |
| 删除 | 右键菜单 | - |
| 在编辑器中打开 | 右键菜单 | 复用 Monaco 编辑器 |

- 新建 / 重命名 / 删除后自动刷新 git 状态，变更页（Changes）立即可见
- v0.3.2 起文件树默认全部折叠，仓库文件较多时不再一打开就铺满整屏

### 12.2 相关 IPC

| IPC 通道 | 说明 |
| --- | --- |
| `fs:file-tree` | 读取仓库文件树 |
| `fs:read-file` | 读取文件内容 |
| `fs:write-file` | 写入 / 新建文件 |
| `fs:mkdir-p` | 递归创建文件夹 |
| `fs:delete` | 删除文件 / 文件夹 |
| `fs:rename` | 重命名文件 / 文件夹 |

---

## 13. 多远程推送（v0.3.0）

v0.3.0 起支持向多个 remote 分别推送，方便同时维护 GitHub / Gitee 双平台镜像。

| 入口 | 行为 |
| --- | --- |
| RepoPage 头部 Push 按钮 | 改为下拉菜单，列出所有 remote（GitHub 灰色图标 / Gitee 红色图标）；点击「推送到 {name}」执行 `git push -u {remote} {branch}`，自动建立 upstream |
| ChangesPanel「提交并推送」 | 同样支持下拉选择 remote 后提交并推送 |
| RemotePanel | 仍可添加 / 删除 remote（见 §1.5） |

---

## 14. 云端仓库搜索（v0.3.4）

v0.3.4 在 GitHub / Gitee 仓库页（RemotePage）顶部栏新增搜索框，输入防抖 300ms 后调用云端搜索，不再局限于本地已拉取的仓库列表。

### 14.1 搜索实现

| 平台 | 实现 | 说明 |
| --- | --- | --- |
| GitHub | 官方 Search API（`octokit.search.repos`） | 全平台搜索，不限「我的仓库」 |
| Gitee | 官方 `/search/repositories` API 已失效（恒返回空数组） | 自动降级为「我的仓库」本地过滤，按名称 / 描述匹配 |

- 显示搜索结果数量与空结果提示
- 清空搜索框恢复「我的仓库」列表

### 14.2 相关 IPC

| IPC 通道 | 说明 |
| --- | --- |
| `gh:search-repos` | GitHub 云端仓库搜索 |
| `gt:search-repos` | Gitee 仓库搜索（降级为「我的仓库」本地过滤） |

---

## 附录：技术栈速览

| 维度 | 选型 |
| --- | --- |
| 运行时 | Electron 33 |
| UI | React 18 + TypeScript 5 + Vite 6 |
| 样式 | Tailwind CSS 3（+ CSS 变量主题系统） |
| 状态 | Zustand |
| 国际化 | React Context + useI18n hook（v0.2.3） |
| Git | simple-git（封装本地 git CLI） |
| GitHub API | @octokit/rest |
| Gitee API | axios 直连 v5 |
| 编辑器 | Monaco Editor（VS Code 同款，跟随主题） |
| Diff | 自实现 unified diff + 并排 / 统一渲染 |
| 配置存储 | electron-store v8（必须 v8，见开发指南陷阱） |
| 打包 | electron-builder（NSIS） |

---

## 15. Stash 队列管理（v0.4）

v0.4 起，stash 从「只能 push / pop 最新的」升级为完整队列管理。

### 15.1 新增 IPC 通道

| 通道 | 实现 |
|---|---|
| `git:stash-list` | `git stash list --format=%gd\|%h\|%cI\|%s` → `StashEntry[]` |
| `git:stash-show` | `git stash show -p --no-color <ref>` → `FileDiff[]`（复用 diff 解析） |
| `git:stash-apply` | `git stash apply <ref>`（不删 stash） |
| `git:stash-drop` | `git stash drop <ref>` |

### 15.2 StashEntry 类型

```ts
// shared/types.ts
export interface StashEntry {
  index: number;          // 0-based（stash@{0}）
  ref: string;            // 'stash@{0}'
  message: string;        // 提交说明（去掉 "WIP on branch: hash" 前缀）
  branch: string;         // 创建时的分支
  hash: string;           // 完整 SHA
  date: string;           // ISO
}
```

### 15.3 UI 集成

- 入口：仓库页 → 变更 Tab → 顶部「Stash 队列」折叠面板
- 操作：
  - **保存当前修改**：输入可选描述 → 推入队列
  - **应用（保留）**：把 stash 应用到工作区，stash 仍在队列
  - **应用并移除**：等于「应用 + 删除」（组合实现，避免再加 IPC）
  - **查看 diff**：弹窗显示该 stash 包含的文件变更
  - **删除**：二次确认后从队列移除

### 15.4 相关文件

| 文件 | 职责 |
|---|---|
| `electron/services/git.ts` | `stashList` / `stashShow` / `stashApply` / `stashDrop` |
| `electron/ipc/git.ts` | 注册 4 个 handler |
| `electron/preload.ts` | 暴露 4 个 API（`gitgui.git.stashList` 等） |
| `src/components/repo/StashList.tsx` | Stash 队列 UI |
| `src/components/repo/ChangesPanel.tsx` | 顶部集成 StashList |
| `src/i18n/{zh,en}.ts` | `stash.*` 段（22 条 key） |

---

## 16. Cherry-pick / Revert（v0.4）

v0.4 起，提交历史支持「拣一个 commit」和「回退一个 commit」两条高频命令。

### 16.1 新增 IPC 通道

| 通道 | 实现 |
|---|---|
| `git:cherry-pick` | `git cherry-pick [-m N] <hash>` |
| `git:revert` | `git revert [-m N] <hash>` |

`mainline` 参数用于合并提交（merge commit），指定保留哪个 parent（`-m 1` 取第一个 parent）。

### 16.2 UI 集成

- 入口：仓库页 → 历史 Tab → 每个 commit 行 hover 显示工具条（复制 hash / Cherry-pick / Revert）
- 复制 hash：用 `navigator.clipboard.writeText()` 复制完整 SHA
- Cherry-pick / Revert：弹通用确认弹窗（CommitActionsModal）→ 显示 hash / 作者 / 主题 → 确认后执行
- 冲突处理：错误信息中识别 "conflict" 关键字 → toast 黄色提示「请在变更页解决」

### 16.3 安全设计

- Revert 弹窗标记为 `danger`（红色边框 + 黄色警告条）
- 所有操作通过通用 CommitActionsModal，便于未来扩展 force-push 等危险动作

### 16.4 相关文件

| 文件 | 职责 |
|---|---|
| `electron/services/git.ts` | `cherryPick` / `revert` |
| `electron/ipc/git.ts` | 注册 2 个 handler |
| `electron/preload.ts` | 暴露 2 个 API |
| `src/components/repo/CommitHistory.tsx` | hover 工具条 + 弹窗触发 |
| `src/components/repo/CommitActionsModal.tsx` | 通用确认弹窗（v0.4+ 复用） |
| `src/i18n/{zh,en}.ts` | `commitActions.*` 段（18 条 key） |

---

## 17. 创建 PR / MR（v0.4）

v0.4 起，从「只能看 PR」升级到「应用内创建 PR / MR」，凸显双平台差异化优势。

### 17.1 新增 IPC 通道

| 通道 | 实现 |
|---|---|
| `gh:create-pr` | `octokit.pulls.create({ owner, repo, title, body, head, base, draft })` |
| `gh:get-default-branch` | `octokit.repos.get({ owner, repo }).default_branch` |
| `gt:create-pr` | `POST /repos/{owner}/{repo}/pulls`（Gitee 没有 draft 概念） |
| `gt:get-default-branch` | `GET /repos/{owner}/{repo}` 读 `default_branch` |

### 17.2 远程 URL 解析

新增 `src/lib/parseRemote.ts`，从 git remote URL 推断 owner/repo/platform，支持：
- `https://github.com/owner/repo.git`
- `git@github.com:owner/repo.git`
- `ssh://git@github.com/owner/repo.git`
- `https://username:password@github.com/owner/repo.git`（自动剥离 user:pass）
- Gitee 同样支持

### 17.3 UI 集成

- 入口：仓库页 → 分支 Tab → 当前分支行（仅当 `ahead > 0` 且存在 GitHub / Gitee remote 时显示 `<GitPullRequest>` 按钮）
- 弹窗流程：
  1. 自动选中第一个 GitHub / Gitee remote（多 remote 时让用户选）
  2. 并行：调 `getDefaultBranch` 拉默认 base + 取最后一次 commit message 作为默认 title
  3. 用户填写 title / body / 选 base / GitHub 可勾选 draft
  4. 提交 → 成功页显示 `htmlUrl` + 「在浏览器打开」按钮

### 17.4 相关文件

| 文件 | 职责 |
|---|---|
| `electron/ipc/github.ts` | `createPR` + `getDefaultBranch` |
| `electron/ipc/gitee.ts` | `createPR` + `getDefaultBranch` |
| `electron/preload.ts` | 暴露 4 个 API |
| `src/lib/parseRemote.ts` | URL → { owner, repo, platform } 解析 |
| `src/components/repo/CreatePRDialog.tsx` | 创建 PR 模态 |
| `src/components/repo/BranchPanel.tsx` | 当前分支行加 `<GitPullRequest>` 按钮 |
| `src/i18n/{zh,en}.ts` | `createPR.*` 段（17 条 key） |

---

## 18. 命令面板与快捷键（v0.4）

v0.4 起，引入 VS Code 式命令面板和全局快捷键，把高频动作收口到统一入口。

### 18.1 全局快捷键

| 快捷键 | 动作 | 作用域 |
|---|---|---|
| `Ctrl/Cmd + Shift + P` | 打开命令面板 | 全局 |
| `Ctrl/Cmd + R` | 刷新仓库 | 不在 input 内 |
| `?`（需 Shift） | 显示快捷键速查表 | 不在 input 内 |

### 18.2 命令面板

- 入口：按 `Ctrl/Cmd + Shift + P` 或 `?` 速查表里的提示
- 模态弹窗：顶部搜索框 + 下方按 4 类分组的命令列表（git / navigation / view / settings）
- 键盘导航：↑↓ 移动、Enter 执行、Esc 关闭
- 命令清单（约 15 条）：见 `src/config/commands.ts`
  - Git：fetch / pull / push / refresh / stash / openChanges
  - Navigation：home / repo / github / gitee / releases / settings / openRepo
  - View：theme.{dark,ocean,light} / lang.{zh,en}
  - Settings：checkUpdate / openDataDir

### 18.3 快捷键速查表

按 `?` 打开，列出所有可用快捷键 + 作用域说明。

### 18.4 输入框让位

`useShortcuts` 在 `INPUT` / `TEXTAREA` / `contentEditable` 内自动让位，避免影响输入。

### 18.5 相关文件

| 文件 | 职责 |
|---|---|
| `src/hooks/useShortcuts.ts` | 全局快捷键（keydown 监听 + input 让位） |
| `src/hooks/useCommandPalette.ts` | 命令面板状态（open / close / toggle） |
| `src/components/common/CommandPalette.tsx` | 模态弹窗 UI |
| `src/components/common/Cheatsheet.tsx` | 快捷键速查表 |
| `src/config/commands.ts` | 命令注册表 |
| `src/pages/RepoPage.tsx` | 1-5 切 tab + 监听 `kg:navigate:tab` / `kg:shortcut:refresh` 事件 |
| `src/App.tsx` | 挂载 CommandPalette + Cheatsheet + useGlobalShortcuts |
| `src/i18n/{zh,en}.ts` | `command.*` + `cheatsheet.*` 段（30 条 key） |

---

## 19. 底部状态栏（v0.4）

v0.4 起，底部 24px 状态栏常驻显示当前仓库运行态（VS Code / GitKraken 风格）。

### 19.1 三段式

| 段 | 内容 |
|---|---|
| **左** | 仓库名（带 `FolderGit2` 图标）+ 当前分支（带 `GitBranch` 图标）+ 同步状态（`↑N` 领先 / `↓N` 落后，颜色区分） |
| **中** | 已暂存 N（emerald 绿）/ 未暂存 N（amber 黄）/ 冲突 N（red 红） |
| **右** | `KunyaoGit v{version}`（从主进程 `app:get-version` 拉） |

### 19.2 实现细节

- 订阅 `useRepoStore` 自动响应仓库变化
- 高度固定 24px（`.statusbar` CSS 工具类）
- 主题色通过 `var(--bg-panel)` 跟随三主题
- 应用版本异步加载（不阻塞首屏）

### 19.3 相关文件

| 文件 | 职责 |
|---|---|
| `src/components/common/StatusBar.tsx` | 组件本体 |
| `src/components/Layout/Layout.tsx` | 底部挂载 |
| `src/styles/index.css` | `.statusbar` 工具类 |
| `src/i18n/{zh,en}.ts` | `statusBar.*` 段（11 条 key） |

---

## 20. Ctrl+P 跳转文件（v0.5）

v0.5 兑现 v0.4 release body 里的预告「v0.5 补 `Ctrl+P` 快速跳转」。复用 v0.4 的命令面板组件，加一个 file 模式；5 千文件的仓库实测从打开到跳转 < 200 ms。

### 20.1 快捷键

| 快捷键 | 模式 | 说明 |
|---|---|---|
| `Ctrl/Cmd + P` | file | ★ v0.5+ 打开文件跳转模式 |
| `Ctrl/Cmd + E` | file | 同上（VS Code 兼容键） |
| `Ctrl/Cmd + Shift + P` | command | v0.4+ 打开命令搜索模式（不变） |

### 20.2 UI 行为

- 顶部 input 占位符切到「输入文件名跳转…」
- 模式徽标从「命令」切到「文件」（顶部 FileText / Hash 图标）
- 打开 file 模式时自动调 `git:ls-files` 拉当前仓库 tracked + untracked 文件
- 模糊搜索：自实现 `fuzzyMatch`（顺序子序列匹配 + 连续字符加分 + 路径分隔符后字符加分）
- 匹配字符高亮（emerald 色）
- 选中文件后：调 `useRepoStore.selectFileForEdit` + 派发 `kg:navigate:tab:files` 切到「文件」Tab
- 顶部状态栏 / 底部状态栏 / 各种弹窗里的输入框**不受影响**（`useShortcuts` 在 input 内让位）

### 20.3 后端实现

新增 IPC `git:ls-files`，主进程用 `git ls-files --cached --others --exclude-standard -z --full-name`：

| 参数 | 含义 |
|---|---|
| `--cached` | 列出所有 tracked 文件 |
| `--others` | 列出 untracked 但未被 `.gitignore` 忽略的文件 |
| `--exclude-standard` | 应用所有 `.gitignore` 规则 |
| `-z` | NUL 分隔（避免文件名含空格） |
| `--full-name` | 相对仓库根，不带 `a/` `b/` 前缀 |

可选 `opts.withStatus: true` 时附调 `git status`，把每个文件的当前暂存 / 工作区状态拼装到 `GitFile.status`（用于将来在结果旁标 ❗ 等标记；v0.5 UI 暂未展示）。

`maxCount` 默认 5000 — 防止 10k+ 文件仓库把渲染层打爆。

### 20.4 模糊匹配算法

`src/lib/fuzzyMatch.ts`（~50 行）：

```ts
export function fuzzyMatch(query: string, target: string): FuzzyResult | null
export function fuzzySearch<T>(query: string, items: T[], getKey: (x: T) => string, topN?: number): { item, result }[]
```

- **顺序子序列**：query 字符必须按顺序在 target 中出现
- **连续字符加分**：连续命中权重高于分散命中（5+连续×3）
- **路径分隔符后首字符加分**：`/`、`.` 后第一个字符额外 +8（文件名开头 > 目录名）
- **完全大小写匹配**：再加 +1
- **target 越短越好**：同等分数下，target 越短分越高（每字符 +0.1）
- **不匹配返 null**（过滤掉）

实测：5 千文件目录搜索「btn」< 50ms（无任何依赖，fuse.js / fuzzysort 都没必要引）。

### 20.5 相关文件

| 文件 | 职责 |
|---|---|
| `shared/types.ts` | + `GitFile` 类型（path, status?） |
| `shared/ipc-channels.ts` | + `GIT_LS_FILES` 通道 |
| `electron/services/git.ts` | + `listFiles()`（ls-files + 可选 status 拼装） |
| `electron/ipc/git.ts` | 注册 handler |
| `electron/preload.ts` | 暴露 `listFiles` API |
| `src/hooks/useCommandPalette.ts` | + `mode: 'command' \| 'file'` 状态 + `openPalette(mode?)` |
| `src/hooks/useShortcuts.ts` | + `Ctrl/Cmd + P` / `Ctrl/Cmd + E` 打开 file 模式 |
| `src/lib/fuzzyMatch.ts` | ★ 模糊搜索算法 |
| `src/components/common/CommandPalette.tsx` | + file 模式 UI（FileText / Hash 图标 + 模式徽标 + 高亮） |
| `src/i18n/{zh,en}.ts` | + `command.filePlaceholder` / `fileHint`（2 条） |

### 20.6 已知限制

- 暂不支持 `:` 行号跳转（VS Code 的 `file.ts:42` 语法；v0.6 候选）
- 不支持 `git grep`（全文内容搜索；v0.5 候选）
- 大仓库（> 50k 文件）当前会全量加载到内存（5000 上限只是默认）；未来考虑流式 / 增量

---

## 21. 文件历史 + Blame（v0.5）

v0.5 起，编辑器的文件上下文增强——你能直接看到"这一行谁改的 / 这个文件经历过什么"。

### 21.1 Blame（行号 gutter 点击查询）

#### 触发

编辑器打开文件后，**点击 Monaco 行号 gutter**（行号左侧 16px 区域）→ 屏幕右下角弹出浮窗，显示：
- commit hash（短 7 位 + 绿色）
- 作者 + 日期（YYYY-MM-DD）
- 当前行号
- commit message 第一行

再点击任意处关闭。

#### 后端

新增 IPC `git:blame`，主进程用 `git blame --line-porcelain -- <file>`，按 porcelain 格式解析为 `BlameLine[]`：

```
<sha> <原始行号> <最终行号>
author <name>
author-mail <<email>>
author-time <unix-timestamp>
author-tz <tz>
summary <message 第一行>
<空行>
<上一行继续>
```

解析器逐行扫描，遇到头部行（`<sha> <orig> <final>`）开始新块，遇到空行结束块。处理边界行缺失字段（无 author-time / 无 summary）→ 填空字符串而非抛错。

#### 性能

- 全量 blame 一次性拉取（不按需懒加载）→ 切文件后立即可用
- 解析后存 `Map<line, info>` 内存索引，gutter 点击 O(1) 查询
- 大文件（> 3000 行）v0.5 不加阈值，由用户自行评估——实测 5000 行 < 100ms

#### BlameLine 类型

```ts
// shared/types.ts
export interface BlameLine {
  line: number;      // 1-based
  hash: string;      // 完整 SHA
  author: string;
  email: string;
  date: string;      // ISO（从 author-time unix 秒换算）
  message: string;   // summary 第一行
}
```

### 21.2 文件历史（FileHistoryPanel 侧边抽屉）

#### 触发

编辑器顶部工具栏新增「历史」图标按钮（History icon）→ 打开 560px 宽的侧边抽屉。

#### 抽屉内容

- 头部：文件路径 + 关闭 X
- 中部：commit 列表（最多 50 条）
  - 每条：message 第一行 + 短 hash + 作者 + 相对时间（"3 天前"）
  - 点击展开 diff（懒加载，第一次展开时调 `fileDiff` API）
- 展开后：自实现 diff 渲染（add/del 绿/红色块，简化版 DiffViewer）

#### 后端

两个 IPC：

| 通道 | 实现 |
|---|---|
| `git:file-log` | `git log --follow --max-count=50 --format=%H\|%h\|%an\|%ae\|%cI\|%s -- <file>` |
| `git:file-diff` | `git diff --no-color <fromHash>^..<toHash> -- <file>`（复用 `parseUnifiedDiff`） |

`--follow` 让 git 自动跟踪重命名（v0.4 PR dialog 复用，行为一致）。

#### 交互细节

- **打开抽屉** → 调 `fileLog` 拉列表；之前的展开项清空
- **点击 commit** → 调 `fileDiff` 拉 diff（懒加载 + 缓存到 React state）
- **再次点同一行** → 折叠
- **Abortable**：用 `cancelled` flag 替代 AbortController（v0.5 简化：渲染层无需要 abort 真实请求，仅过滤 setState）

### 21.3 相关文件

| 文件 | 职责 |
|---|---|
| `shared/types.ts` | + `BlameLine` 类型 |
| `shared/ipc-channels.ts` | + `GIT_BLAME` / `GIT_FILE_LOG` / `GIT_FILE_DIFF` |
| `electron/services/git.ts` | + `blame(file)` / `fileLog(file, opts)` / `fileDiff(file, opts)` 三个方法 |
| `electron/ipc/git.ts` | 注册 3 个 handler |
| `electron/preload.ts` | 暴露 3 个 API（`gitgui.git.blame` / `fileLog` / `fileDiff`） |
| `src/components/repo/FileHistoryPanel.tsx` | ★ 侧边抽屉组件 |
| `src/components/repo/EditorPane.tsx` | + 「历史」按钮 + 拉 blame + gutter 点击 + 浮窗 |
| `src/i18n/{zh,en}.ts` | + `fileHistory.*` 段（7 条 key） |

### 21.4 已知限制

- Blame 不支持点击 commit hash 直接跳到历史 tab（v0.5 仅显示信息；v0.6 候选）
- 文件历史 diff 不支持跨文件 / 多文件 commit（v0.5 仅显示当前文件变化）
- 二进制文件 Blame 不可用（git blame 默认行为）

---

**说明**：本文档与 `package.json`、`shared/ipc-channels.ts`、`shared/types.ts`、`electron/` 同源。改任何功能，请同步本文档。
