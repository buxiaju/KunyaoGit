# KunyaoGit 功能详解

> 面向用户与开发者的完整功能清单。当前版本：**v0.2.2**（见 `package.json`）。
> 所有功能均通过 Electron IPC 实现，渲染进程仅通过 `window.gitgui.*` 调用，主进程负责真正的本地 Git / 远程 API / 文件系统操作。

---

## 目录

1. [本地 Git 操作](#1-本地-git-操作)
2. [GitHub / Gitee 双平台集成](#2-github--gitee-双平台集成)
3. [Monaco Editor 代码编辑](#3-monaco-editor-代码编辑)
4. [Diff 视图（unified / split 双模式）](#4-diff-视图unified--split-双模式)
5. [拖拽上传](#5-拖拽上传)
6. [Release 管理 + CHANGELOG 自动生成](#6-release-管理--changelog-自动生成)
7. [应用内自动更新（v0.2.2 新特性）](#7-应用内自动更新v022-新特性)
8. [设置页功能](#8-设置页功能)
9. [安全特性](#9-安全特性)

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
| 列 Release | `release:list` | 返回 `ReleaseInfo[]` |
| 创建 Release | `release:create` | 含 Tag / Name / Body / draft / prerelease |
| 删除 Release | `release:delete` | - |
| 获取详情 | `release:get` | - |
| 发布 | `release:publish` | - |

主进程 `electron/ipc/release.ts`，GitHub 与 Gitee 双平台同步管理。界面入口 `src/pages/ReleasesPage.tsx`，针对当前本地仓库的 Release。

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

## 7. 应用内自动更新（v0.2.2 新特性）

> v0.2.2 引入真正的「应用内下载 + 自动安装」能力，用户无需手动去浏览器下载安装包。

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
    - 立即下载并安装 → 应用内下载 → 自动启动安装包 → 退出应用
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
  totalBytes: number;     // 0 表示未知
  source?: 'gitee' | 'github';
  message?: string;
  filePath?: string;       // done 阶段返回的本地安装包路径
}
```

界面 `src/components/common/UpdateDialog.tsx` 的 `DownloadPanel`：
- 已知大小时显示百分比进度条
- 未知大小时显示脉动动画
- 显示已接收 / 总字节数（B / KB / MB）
- 标注当前下载源（Gitee / GitHub）

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
| `electron/ipc/update.ts` | IPC handler + 应用内下载安装 + 进度推送 |
| `src/hooks/useUpdateCheck.ts` | 启动 1.5s 后静默检查 |
| `src/stores/update.ts` | zustand store，驱动下载流程 |
| `src/components/common/UpdateDialog.tsx` | 弹窗 UI（询问 / 下载中 / 完成 / 错误） |

---

## 8. 设置页功能

界面入口 `src/pages/SettingsPage.tsx`，包含「关于 + 检查更新」卡片。

### 8.1 主题与 Git 配置

| 项 | 说明 |
| --- | --- |
| 主题 | `dark` / `light`（`AppSettings.theme`） |
| Git 可执行路径 | 自定义 `git` 路径（`AppSettings.gitPath`） |
| 默认克隆目录 | `AppSettings.defaultCloneDir` |
| 作者信息 | `authorName` / `authorEmail` |
| Diff 视图模式 | `unified` / `split` |

### 8.2 双平台 Token 管理

- GitHub / Gitee 标签分别填入 Personal Access Token
- 「测试并保存」：调 `settings:test-auth` 验证有效性后写入 electron-store
- **GitHub Token 权限建议**：`repo`、`read:user`（不需要 `admin:org`、`delete_repo`）
- **Gitee Token 权限建议**：`projects`、`pull_requests`、`issues`

### 8.3 Git 路径测试

- 通道：`settings:test-git`
- 校验指定路径是否为有效 `git` 可执行

### 8.4 关于 + 检查更新

- 显示当前版本（`app:get-version`）
- 「立即检查更新」按钮：调 `update:check`（主动检查，无视节流）
- v0.2.2 新增「立即下载并安装」入口，可随时触发更新流程

---

## 9. 安全特性

### 9.1 contextIsolation

- `contextIsolation: true` + `nodeIntegration: false`
- 渲染进程（Chromium）**不能** 直接 `require('fs')` 或访问任何 Node / Electron API
- 所有 Node 能力必须走 IPC，渲染层只看到 `window.gitgui.*`（由 `electron/preload.ts` 的 `contextBridge` 暴露）

### 9.2 Content Security Policy（CSP）

- 在主进程 `setupCsp()` 中通过响应头注入
- dev / prod 模式配置不同，限制脚本来源、内联脚本等

### 9.3 Token 安全存储

- Token 永远只在主进程使用，渲染层**不接触**原始 token 字符串
- 渲染层只能 `gitgui.settings.setAuth()` 间接存入 electron-store
- 存储位置：`%APPDATA%\gitgui\gitgui-settings.json`
- 缺失 token 的远程请求在 IPC handler 提前拦截并返回中文友好错误，避免暴露 token 或 GitHub 英文 401

### 9.4 IPC 通道防 typo

- 所有通道名集中定义在 `shared/ipc-channels.ts` 的 `IPC` 常量对象
- 渲染层与主进程共用同一份字符串常量，杜绝手写通道名拼错

### 9.5 openExternal 白名单

- `update:open` 等 `shell.openExternal` 调用会校验 URL 协议（`/^https?:\/\//`），避免任意协议跳转

---

## 附录：技术栈速览

| 维度 | 选型 |
| --- | --- |
| 运行时 | Electron 33 |
| UI | React 18 + TypeScript 5 + Vite 6 |
| 样式 | Tailwind CSS 3 |
| 状态 | Zustand |
| Git | simple-git（封装本地 git CLI） |
| GitHub API | @octokit/rest |
| Gitee API | axios 直连 v5 |
| 编辑器 | Monaco Editor（VS Code 同款） |
| Diff | 自实现 unified diff + 并排 / 统一渲染 |
| 配置存储 | electron-store v8（必须 v8，见开发指南陷阱） |
| 打包 | electron-builder（NSIS） |

---

**说明**：本文档与 `package.json`、`shared/ipc-channels.ts`、`shared/types.ts`、`electron/` 同源。改任何功能，请同步本文档。
