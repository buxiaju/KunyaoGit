# KunyaoGit API 参考文档

> 本文档面向 KunyaoGit Electron 应用的开发者，全面描述渲染进程可用的 `window.gitgui` API、共享类型定义、主进程配置以及 IPC 通道清单。
>
> 适用版本：**v0.6.3**（v0.2.3+ 主题与语言、v0.2.4+ 下载速度优化、v0.2.5+ 三主题切换、v0.2.6+ 探活修复、v0.3.0+ 文件管理/多远程推送、v0.3.1+/v0.3.3+ 更新下载修复、v0.3.4+ 云端搜索、v0.4+ 命令面板/快捷键/Stash 队列/Cherry-pick/Revert/PR 创建/状态栏、v0.5+ Ctrl+P 跳转文件/文件历史 +Blame、v0.6.0~0.6.2 Release 附件管理/编辑/Markdown 渲染/SSH 按 host 路由、**v0.6.3 真实使用 bug 修复（8 项）**）
>
> 源码依据：
> - `shared/ipc-channels.ts`
> - `shared/types.ts`
> - `electron/preload.ts`
> - `electron/main.ts`

---

## 目录

1. [概述](#1-概述)
2. [类型定义](#2-类型定义)
3. [API 命名空间](#3-api-命名空间)
   - [3.1 `repo` — 仓库管理](#31-repo--仓库管理)
   - [3.2 `git` — Git 操作](#32-git--git-操作)
   - [3.3 `fs` — 文件系统](#33-fs--文件系统)
   - [3.4 `release` — Release 与 Changelog](#34-release--release-与-changelog)
   - [3.5 `github` — GitHub 平台](#35-github--github-平台)
   - [3.6 `gitee` — Gitee 平台](#36-gitee--gitee-平台)
   - [3.7 `settings` — 应用设置](#37-settings--应用设置)
   - [3.8 `app` — 通用应用接口](#38-app--通用应用接口)
   - [3.9 `update` — 更新检查与下载安装](#39-update--更新检查与下载安装)
4. [主进程配置](#4-主进程配置)
5. [IPC 通道清单](#5-ipc-通道清单)

---

## 1. 概述

KunyaoGit 是基于 Electron 构建的图形化 Git 客户端，支持 GitHub 与 Gitee 双平台。所有跨进程能力通过 `contextBridge.exposeInMainWorld('gitgui', api)` 暴露的 `window.gitgui` 对外提供。

### 1.1 安全模型

主窗口在 `electron/main.ts` 中以严格的安全策略创建：

| 配置项 | 值 | 说明 |
| --- | --- | --- |
| `contextIsolation` | `true` | 渲染进程与 preload 隔离运行，避免渲染层污染 Node 全局 |
| `nodeIntegration` | `false` | 渲染进程不直接持有 Node.js API |
| `sandbox` | `false` | 关闭 sandbox 以允许 preload 加载 npm 模块（仍受 contextIsolation 约束） |
| `preload` | `electron/preload.js` | 唯一的预加载脚本，定义 `window.gitgui` |

**核心原则：渲染进程永远不直接访问 Node/Electron API，所有 Node/Electron 能力都必须通过 IPC 走主进程。** preload 仅以 `ipcRenderer.invoke` 封装对外 API，不泄漏 `ipcRenderer` 本身。

### 1.2 调用约定

- 所有方法返回 `Promise`，绝大多数业务方法返回 `Promise<Result<T>>`。
- `Result<T>` 是联合类型：成功为 `{ ok: true; data: T }`，失败为 `{ ok: false; error: string }`，调用方应先判断 `ok` 字段。
- 部分纯查询方法（如 `app.getPlatform`、`app.getVersion`）直接返回 `Promise<T>`。
- 订阅式 API（如 `update.download`）通过回调参数接收主进程推送的进度事件。

### 1.3 全局类型声明

渲染层使用前需在 `src/global.d.ts` 中声明全局 `window.gitgui` 类型，类型定义导出自 `shared/types.ts` 的 `GitGuiApi`（由 `electron/preload.ts` 通过 `export type GitGuiApi = typeof api` 推断）。

---

## 2. 类型定义

以下类型均从 `shared/types.ts` 导出，供渲染进程与主进程共享。

### 2.1 `RepoInfo`

仓库元信息，用于最近仓库列表与当前仓库状态展示。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `path` | `string` | 仓库本地绝对路径 |
| `name` | `string` | 仓库名称（通常为目录名） |
| `remoteUrl?` | `string` | 默认远程 URL，可选 |
| `currentBranch?` | `string` | 当前分支名，可选 |
| `isGitRepo` | `boolean` | 是否为有效的 Git 仓库 |
| `lastOpenedAt` | `number` | 最近一次打开的时间戳（毫秒） |

### 2.2 `CommitInfo`

单条提交记录。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `hash` | `string` | 完整 commit SHA |
| `shortHash` | `string` | 短 SHA |
| `author` | `string` | 提交者姓名 |
| `email` | `string` | 提交者邮箱 |
| `date` | `string` | ISO 格式时间字符串 |
| `message` | `string` | 提交信息（含标题与正文） |
| `refs?` | `string[]` | 指向该提交的引用（分支/标签） |
| `parents?` | `string[]` | 父提交 SHA 列表 |

### 2.3 `BranchInfo`

分支信息。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `name` | `string` | 分支名 |
| `current` | `boolean` | 是否为当前检出分支 |
| `remote` | `boolean` | 是否为远程跟踪分支 |
| `upstream?` | `string` | 上游跟踪引用，如 `origin/main` |
| `ahead?` | `number` | 领先上游的提交数 |
| `behind?` | `number` | 落后上游的提交数 |
| `lastCommit?` | `string` | 最近一次提交的 SHA |

### 2.4 `FileStatus`

工作区/暂存区中单个文件的变更状态。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `path` | `string` | 文件路径（相对仓库根） |
| `status` | `'added' \| 'modified' \| 'deleted' \| 'renamed' \| 'untracked' \| 'conflicted'` | 变更类型 |
| `oldPath?` | `string` | 重命名场景下的原路径 |
| `staged` | `boolean` | 是否已加入暂存区 |

### 2.5 `FileTreeNode`

文件树节点，用于仓库文件浏览。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `name` | `string` | 显示名 |
| `path` | `string` | 相对路径 |
| `type` | `'file' \| 'folder'` | 节点类型 |
| `children?` | `FileTreeNode[]` | 子节点（仅 folder） |
| `status?` | `FileStatus['status']` | 文件变更状态（可选） |

### 2.6 `DiffHunk`

单个 diff hunk 的元信息与行集合。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `oldStart` | `number` | 旧文件起始行号 |
| `oldLines` | `number` | 旧文件行数 |
| `newStart` | `number` | 新文件起始行号 |
| `newLines` | `number` | 新文件行数 |
| `lines` | `DiffLine[]` | 该 hunk 包含的行 |

### 2.7 `DiffLine`

单行 diff 内容。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `type` | `'add' \| 'del' \| 'context'` | 新增 / 删除 / 上下文 |
| `content` | `string` | 行文本内容 |
| `oldLine?` | `number` | 旧文件中的行号 |
| `newLine?` | `number` | 新文件中的行号 |

### 2.8 `FileDiff`

单个文件的完整 diff。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `path` | `string` | 文件路径 |
| `oldPath?` | `string` | 重命名前的路径 |
| `isBinary` | `boolean` | 是否为二进制文件 |
| `hunks` | `DiffHunk[]` | hunk 列表 |

### 2.9 `RemoteInfo`

远程仓库信息。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `name` | `string` | 远程名称（如 `origin`） |
| `url` | `string` | 远程 URL |
| `type` | `'github' \| 'gitee' \| 'other'` | 平台类型 |

### 2.10 `AuthConfig`

鉴权配置，包含可选的 GitHub/Gitee 令牌。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `github?` | `{ token: string; user?: string }` | GitHub 令牌与可选用户名 |
| `gitee?` | `{ token: string; user?: string }` | Gitee 令牌与可选用户名 |

### 2.11 `AppSettings`

完整的应用设置。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `theme` | `'dark' \| 'ocean' \| 'light'` | ★ v0.2.5：UI 主题（暗色 / 深蓝 / 亮色），默认 `'dark'` |
| `language` | `'zh' \| 'en'` | ★ v0.2.3：界面语言，默认 `'zh'` |
| `gitPath?` | `string` | 自定义 git 可执行文件路径 |
| `defaultCloneDir` | `string` | 默认克隆目录 |
| `authorName?` | `string` | 提交者姓名覆盖 |
| `authorEmail?` | `string` | 提交者邮箱覆盖 |
| `diffView` | `'unified' \| 'split'` | diff 视图样式 |
| `auth` | `AuthConfig` | 平台鉴权配置 |

> 配套类型 `Theme = 'dark' \| 'ocean' \| 'light'`（独立 export）。

### 2.12 `ReleaseInfo`

Release 信息（适配 GitHub 与 Gitee）。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `tag` | `string` | 标签名 |
| `name` | `string` | Release 标题 |
| `body` | `string` | Release 正文 |
| `draft` | `boolean` | 是否为草稿 |
| `prerelease` | `boolean` | 是否为预发布 |
| `createdAt` | `string` | 创建时间 ISO |
| `publishedAt?` | `string` | 发布时间 ISO |
| `assets` | `ReleaseAsset[]` | 附件资源列表 |
| `platform` | `'github' \| 'gitee'` | 来源平台 |

### 2.13 `ReleaseAsset`

Release 附件资源（v0.6+ 扩展字段）。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `number` | ★ v0.6+ 平台侧 asset id（删除 / 后续操作依赖） |
| `name` | `string` | 资源名 |
| `size` | `number` | 字节数 |
| `downloadCount` | `number` | 下载次数 |
| `downloadUrl` | `string` | 下载地址 |
| `state?` | `string` | ★ v0.6+ GitHub：`'uploaded' \| 'open' \| 'new'`；Gitee 不返回 |
| `contentType?` | `string` | ★ v0.6+ MIME 类型 |
| `uploadedAt?` | `string` | ★ v0.6+ 上传时间 ISO |
| `htmlUrl?` | `string` | ★ v0.6+ GitHub 页面地址 |

#### `ReleaseUpdateParams`（★ v0.6+）

`release.update` 入参。GitHub 全支持；Gitee 仅 `name` / `body` / `prerelease`，`draft` 被忽略。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `name?` | `string` | Release 标题 |
| `body?` | `string` | Release 正文（Markdown） |
| `prerelease?` | `boolean` | 是否为预发布 |
| `draft?` | `boolean` | 是否为草稿（仅 GitHub 生效） |

### 2.14 `PullRequestInfo`

Pull Request / MR 信息。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `number` | `number` | PR 编号 |
| `title` | `string` | 标题 |
| `state` | `'open' \| 'closed' \| 'merged'` | 状态 |
| `author` | `string` | 作者 |
| `createdAt` | `string` | 创建时间 ISO |
| `updatedAt` | `string` | 更新时间 ISO |
| `url` | `string` | 网页地址 |
| `base` | `string` | 目标分支 |
| `head` | `string` | 来源分支 |
| `platform` | `'github' \| 'gitee'` | 来源平台 |

### 2.15 `IssueInfo`

Issue 信息。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `number` | `number` | Issue 编号 |
| `title` | `string` | 标题 |
| `state` | `'open' \| 'closed'` | 状态 |
| `author` | `string` | 作者 |
| `createdAt` | `string` | 创建时间 ISO |
| `url` | `string` | 网页地址 |
| `labels` | `string[]` | 标签列表 |
| `platform` | `'github' \| 'gitee'` | 来源平台 |

### 2.16 `RemoteFile`

远程仓库目录中的文件/目录条目。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `name` | `string` | 显示名 |
| `path` | `string` | 仓库内路径 |
| `type` | `'file' \| 'dir'` | 类型 |
| `size` | `number` | 字节数 |
| `sha` | `string` | Git blob/tree SHA |
| `url` | `string` | API URL |
| `htmlUrl?` | `string` | 网页地址 |

### 2.17 `RemoteFileContent`

远程文件内容读取结果。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `path` | `string` | 仓库内路径 |
| `sha` | `string` | Git blob SHA |
| `content` | `string` | 解码后的文本内容 |
| `encoding` | `'utf-8' \| 'base64'` | 编码方式 |
| `size` | `number` | 字节数 |
| `isBinary` | `boolean` | 是否为二进制 |

### 2.18 `ChangelogGroup`

Changelog 生成结果中按 conventional-commits 类型分组的条目。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `type` | `'feat' \| 'fix' \| 'docs' \| 'refactor' \| 'perf' \| 'chore' \| 'other'` | 提交类型 |
| `commits` | `CommitInfo[]` | 该类型下的提交列表 |

### 2.19 `StashEntry`（★ v0.4+）

Stash 队列条目，描述一次 stash 暂存的元信息。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `index` | `number` | 0-based 索引（`stash@{0}` 对应 0） |
| `ref` | `string` | 完整 ref，如 `'stash@{0}'` |
| `message` | `string` | 提交说明（已剥离 `WIP on branch: hash` 前缀） |
| `branch` | `string` | 创建时的分支名 |
| `hash` | `string` | 完整 SHA |
| `date` | `string` | ISO 时间 |

### 2.20 `GitFile`（★ v0.5+）

`git.listFiles` 返回的工作区文件条目。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `path` | `string` | 相对仓库根的路径 |
| `status?` | `FileStatus['status']` | 仅当 `listFiles` 传 `withStatus: true` 时附带：表示该文件当前暂存/工作区状态；纯 clean tracked 文件为 `undefined` |

### 2.21 `BlameLine`（★ v0.5+）

`git.blame` 返回的单行 blame 记录。每一行对应一个文件行号，包含引入该行的 commit 元信息。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `line` | `number` | 1-based 行号 |
| `hash` | `string` | 引入该行的 commit 完整 SHA |
| `author` | `string` | 作者名 |
| `email` | `string` | 作者邮箱 |
| `date` | `string` | ISO 时间（从 `author-time` unix 时间戳换算） |
| `message` | `string` | commit message 第一行（`summary` 字段） |

### 2.22 `Result<T>`

统一返回包装类型。

```ts
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
```

- 成功：`{ ok: true, data: T }`
- 失败：`{ ok: false, error: string }`

### 2.21 `AppUpdateInfo`

应用更新检查结果。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `hasUpdate` | `boolean` | 是否存在可用更新 |
| `currentVersion` | `string` | 当前应用版本 |
| `latest` | `object \| null` | 最新版本信息（见下） |
| `latest.tag` | `string` | 标签名 |
| `latest.version` | `string` | 语义化版本号 |
| `latest.name` | `string` | Release 标题 |
| `latest.body` | `string` | Release 正文 |
| `latest.htmlUrl` | `string` | 网页地址 |
| `latest.publishedAt?` | `string` | 发布时间 ISO |
| `latest.platform` | `'github' \| 'gitee'` | 来源平台 |
| `latest.assets` | `{ name: string; size: number; downloadUrl: string }[]` | 附件资源 |
| `sources` | `object[]` | 各平台来源的检查结果 |
| `sources[].platform` | `'github' \| 'gitee'` | 来源平台 |
| `sources[].ok` | `boolean` | 该来源是否检查成功 |
| `sources[].error?` | `string` | 错误信息 |
| `sources[].release?` | `AppUpdateInfo['latest']` | 该来源对应的 Release |
| `dismissed?` | `boolean` | 当前版本是否已被用户忽略 |

### 2.22 `DownloadPhase` 与 `DownloadProgress`

应用内安装包下载进度相关类型。

`DownloadPhase` 表示下载阶段：

```ts
export type DownloadPhase = 'preparing' | 'downloading' | 'done' | 'error' | 'cancelled';
```

`DownloadProgress` 表示一次进度事件载荷：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `phase` | `DownloadPhase` | 当前阶段 |
| `percent` | `number` | 进度百分比 0–100；`totalBytes` 未知时为 `-1` |
| `bytesReceived` | `number` | 已接收字节数 |
| `totalBytes` | `number` | 总字节数，`0` 表示未知 |
| `source?` | `'gitee' \| 'github'` | 当前正在下载的源 |
| `message?` | `string` | `error` / `done` 阶段的说明 |
| `filePath?` | `string` | `done` 阶段返回的本地安装包路径 |
| `speedBps?` | `number` | ★ v0.2.4：瞬时下载速率（字节/秒），`downloading` 阶段填 |

---

## 3. API 命名空间

`window.gitgui` 暴露如下命名空间：

| 命名空间 | 用途 |
| --- | --- |
| `repo` | 本地仓库打开/克隆/初始化、最近仓库列表 |
| `git` | Git 命令封装（status、log、commit、push、pull、diff 等） |
| `fs` | 受限文件系统操作 |
| `release` | Release 列表、创建、删除、发布与 Changelog 生成 |
| `github` | GitHub 平台 API（仓库、PR、Issue、文件内容） |
| `gitee` | Gitee 平台 API（仓库、PR、Issue、文件内容） |
| `settings` | 应用设置读写与连通性测试 |
| `app` | 通用应用接口（平台、版本、外部链接） |
| `update` | 更新检查、应用内下载安装 |

> 说明：除特殊标注外，下列方法的返回类型均为 `Promise<Result<T>>`，其中 `T` 为方法返回的数据类型。`repo` / `git` / `fs` / `release` / `github` / `gitee` / `settings` 命名空间绝大多数方法均返回 `Result<T>`；`app` 与 `update` 部分方法直接返回原始值。

---

### 3.1 `repo` — 仓库管理

| 方法 | IPC 通道 | 签名 | 说明 |
| --- | --- | --- | --- |
| `openDialog` | `repo:open-dialog` | `() => Promise<Result<RepoInfo \| null>>` | 弹出系统目录选择对话框，选中后返回该路径的 `RepoInfo`；用户取消则返回 `null` |
| `open` | `repo:open` | `(path: string) => Promise<Result<RepoInfo>>` | 打开指定路径的仓库，加入最近列表 |
| `listRecent` | `repo:list-recent` | `() => Promise<Result<RepoInfo[]>>` | 列出最近打开过的仓库 |
| `removeRecent` | `repo:remove-recent` | `(path: string) => Promise<Result<void>>` | 从最近列表中移除指定路径 |
| `clone` | `repo:clone` | `(url: string, dest: string) => Promise<Result<RepoInfo>>` | 克隆远程仓库到 `dest` |
| `init` | `repo:init` | `(path: string) => Promise<Result<RepoInfo>>` | 在指定路径初始化一个新的 Git 仓库 |
| `getInfo` | `repo:get-info` | `(path: string) => Promise<Result<RepoInfo>>` | 获取指定路径的仓库元信息 |

参数说明：
- `path` / `dest`：本地绝对路径。
- `url`：远程仓库 URL（支持 HTTPS 与 SSH）。

---

### 3.2 `git` — Git 操作

所有方法的第一参数 `repoPath` 均为仓库本地绝对路径。

| 方法 | IPC 通道 | 签名 | 说明 |
| --- | --- | --- | --- |
| `status` | `git:status` | `(repoPath: string) => Promise<Result<FileStatus[]>>` | 获取工作区与暂存区的文件状态 |
| `log` | `git:log` | `(repoPath: string, opts?: { maxCount?: number; branch?: string }) => Promise<Result<CommitInfo[]>>` | 获取提交历史，可限制条数并指定分支 |
| `branches` | `git:branches` | `(repoPath: string) => Promise<Result<BranchInfo[]>>` | 列出本地与远程分支 |
| `stage` | `git:stage` | `(repoPath: string, paths: string[]) => Promise<Result<void>>` | 将指定文件加入暂存区 |
| `unstage` | `git:unstage` | `(repoPath: string, paths: string[]) => Promise<Result<void>>` | 将指定文件移出暂存区 |
| `discard` | `git:discard` | `(repoPath: string, paths: string[]) => Promise<Result<void>>` | 丢弃指定文件的工作区修改 |
| `commit` | `git:commit` | `(repoPath: string, message: string, opts?: { amend?: boolean; signOff?: boolean }) => Promise<Result<CommitInfo>>` | 创建提交；`amend` 修订上次提交，`signOff` 添加 Signed-off-by |
| `push` | `git:push` | `(repoPath: string, opts?: { remote?: string; branch?: string; setUpstream?: boolean; force?: boolean }) => Promise<Result<void>>` | 推送提交；可指定远程、分支、是否设置上游、是否强制 |
| `pull` | `git:pull` | `(repoPath: string, opts?: { remote?: string; branch?: string; rebase?: boolean }) => Promise<Result<void>>` | 拉取并合并；`rebase` 使用 `--rebase` |
| `fetch` | `git:fetch` | `(repoPath: string, opts?: { remote?: string; prune?: boolean }) => Promise<Result<void>>` | 拉取远端引用；`prune` 清理已删除的远程分支 |
| `checkout` | `git:checkout` | `(repoPath: string, target: string, opts?: { create?: boolean }) => Promise<Result<void>>` | 检出分支/标签/SHA；`create` 为 true 时新建分支并检出 |
| `createBranch` | `git:create-branch` | `(repoPath: string, name: string, from?: string) => Promise<Result<void>>` | 创建分支，可指定起点 |
| `deleteBranch` | `git:delete-branch` | `(repoPath: string, name: string, force?: boolean) => Promise<Result<void>>` | 删除分支；`force` 强制删除 |
| `merge` | `git:merge` | `(repoPath: string, branch: string, opts?: { noFF?: boolean; squash?: boolean; message?: string }) => Promise<Result<void>>` | 合并指定分支；支持 `--no-ff`、`--squash` 与自定义提交信息 |
| `diff` | `git:diff` | `(repoPath: string, opts?: { staged?: boolean; from?: string; to?: string }) => Promise<Result<FileDiff[]>>` | 获取多文件 diff；`staged` 比较暂存区与 HEAD，`from`/`to` 比较任意引用 |
| `diffFile` | `git:diff-file` | `(repoPath: string, file: string, opts?: { staged?: boolean }) => Promise<Result<FileDiff>>` | 获取单文件 diff |
| `stash` | `git:stash` | `(repoPath: string, message?: string) => Promise<Result<void>>` | 储藏当前工作区修改 |
| `stashPop` | `git:stash-pop` | `(repoPath: string) => Promise<Result<void>>` | 弹出最近一次储藏 |
| `reset` | `git:reset` | `(repoPath: string, target: string, mode?: 'soft' \| 'mixed' \| 'hard') => Promise<Result<void>>` | 重置到 `target`，可指定模式 |
| `resolveConflict` | `git:resolve-conflict` | `(repoPath: string, file: string, side: 'ours' \| 'theirs') => Promise<Result<void>>` | 以 `ours` 或 `theirs` 方式解决冲突文件 |
| `cherryPick` ★ v0.4+ | `git:cherry-pick` | `(repoPath: string, hash: string, opts?: { mainline?: number }) => Promise<Result<{ hash?: string }>>` | Cherry-pick 一个 commit 到当前分支；`mainline` 用于合并提交 |
| `revert` ★ v0.4+ | `git:revert` | `(repoPath: string, hash: string, opts?: { mainline?: number }) => Promise<Result<{ hash?: string }>>` | 回退一个 commit（生成反向 commit） |
| `stashList` ★ v0.4+ | `git:stash-list` | `(repoPath: string) => Promise<Result<StashEntry[]>>` | 列出 stash 队列 |
| `stashShow` ★ v0.4+ | `git:stash-show` | `(repoPath: string, ref: string) => Promise<Result<FileDiff[]>>` | 显示某个 stash 的 diff |
| `stashApply` ★ v0.4+ | `git:stash-apply` | `(repoPath: string, ref: string) => Promise<Result<void>>` | 应用 stash（保留在队列） |
| `stashDrop` ★ v0.4+ | `git:stash-drop` | `(repoPath: string, ref: string) => Promise<Result<void>>` | 从队列删除 stash |
| `readConflict` | `git:read-conflict` | `(repoPath: string, file: string) => Promise<Result<FileDiff>>` | 读取冲突文件 diff（用于三向视图） |
| `remoteList` | `git:remote-list` | `(repoPath: string) => Promise<Result<RemoteInfo[]>>` | 列出所有远程 |
| `remoteAdd` | `git:remote-add` | `(repoPath: string, name: string, url: string) => Promise<Result<void>>` | 添加远程 |
| `remoteRemove` | `git:remote-remove` | `(repoPath: string, name: string) => Promise<Result<void>>` | 移除远程 |
| `listFiles` ★ v0.5+ | `git:ls-files` | `(repoPath: string, opts?: { maxCount?: number; withStatus?: boolean }) => Promise<Result<GitFile[]>>` | 列出仓库所有工作区文件（tracked + untracked，`.gitignore` 已应用）。`maxCount` 默认 5000；`withStatus: true` 时附带 `status` 字段（从 `git status` 拼装）。用于 Ctrl+P 跳转文件 |
| `blame` ★ v0.5+ | `git:blame` | `(repoPath: string, file: string) => Promise<Result<BlameLine[]>>` | git blame，使用 `--line-porcelain` 解析为 `BlameLine[]`。用于编辑器行号 gutter 点击查询 |
| `fileLog` ★ v0.5+ | `git:file-log` | `(repoPath: string, file: string, opts?: { maxCount?: number; follow?: boolean }) => Promise<Result<CommitInfo[]>>` | 文件历史（默认 `--follow` 跟踪重命名；`maxCount` 默认 50）。用于 FileHistoryPanel commit 列表 |
| `fileDiff` ★ v0.5+ | `git:file-diff` | `(repoPath: string, file: string, opts?: { fromHash?: string; toHash?: string }) => Promise<Result<FileDiff \| null>>` | 文件某次 commit 与上一版的 diff（`fromHash^..toHash`）。用于 FileHistoryPanel 点开 commit 查看详情 |

---

### 3.3 `fs` — 文件系统

受限的文件系统操作，仅允许在仓库/工作区相关路径上使用。

| 方法 | IPC 通道 | 签名 | 说明 |
| --- | --- | --- | --- |
| `readDir` | `fs:read-dir` | `(path: string) => Promise<Result<string[]>>` | 读取目录下的条目名 |
| `readFile` | `fs:read-file` | `(path: string) => Promise<Result<string>>` | 读取文本文件内容 |
| `writeFile` | `fs:write-file` | `(path: string, content: string) => Promise<Result<void>>` | 写入文本文件 |
| `writeBinary` | `fs:write-binary` | `(path: string, content: number[]) => Promise<Result<void>>` | 写入二进制文件（字节数组） |
| `mkdirp` | `fs:mkdir-p` | `(path: string) => Promise<Result<void>>` | 递归创建目录 |
| `fileTree` | `fs:file-tree` | `(path: string, depth?: number) => Promise<Result<FileTreeNode[]>>` | 构建文件树，可限制深度 |
| `delete` | `fs:delete` | `(path: string) => Promise<Result<void>>` | 删除文件或目录 |
| `rename` | `fs:rename` | `(oldPath: string, newPath: string) => Promise<Result<void>>` | 重命名/移动 |

---

### 3.4 `release` — Release 与 Changelog

| 方法 | IPC 通道 | 签名 | 说明 |
| --- | --- | --- | --- |
| `list` | `release:list` | `(repoPath: string, platform?: 'github' \| 'gitee') => Promise<Result<ReleaseInfo[]>>` | 列出指定仓库的 Release；可按平台过滤 |
| `create` | `release:create` | `(params: { repoPath: string; tag: string; name: string; body: string; draft?: boolean; prerelease?: boolean; platform?: 'github' \| 'gitee' }) => Promise<Result<ReleaseInfo>>` | 创建 Release |
| `delete` | `release:delete` | `(repoPath: string, tag: string, platform?: 'github' \| 'gitee') => Promise<Result<void>>` | 删除指定 tag 的 Release |
| `get` | `release:get` | `(repoPath: string, tag: string, platform?: 'github' \| 'gitee') => Promise<Result<ReleaseInfo>>` | 获取指定 tag 的 Release 详情 |
| `publish` | `release:publish` | `(repoPath: string, tag: string, platform?: 'github' \| 'gitee') => Promise<Result<ReleaseInfo>>` | 将草稿 Release 正式发布 |
| `update` ★ v0.6+ | `release:update` | `(params: { repoPath: string; tag: string; name?: string; body?: string; prerelease?: boolean; draft?: boolean; platform?: 'github' \| 'gitee' }) => Promise<Result<ReleaseInfo>>` | 编辑已发布 Release 的 name / body / prerelease（GitHub 全支持；Gitee 不支持 draft 切换） |
| `uploadAsset` ★ v0.6+ | `release:upload-asset` | `(params: { repoPath: string; tag: string; filePath: string; label?: string; platform?: 'github' \| 'gitee' }) => Promise<Result<ReleaseAsset>>` | 上传本地文件为 Release 附件 |
| `deleteAsset` ★ v0.6+ | `release:delete-asset` | `(params: { repoPath: string; tag: string; assetId: number; platform?: 'github' \| 'gitee' }) => Promise<Result<void>>` | 删除指定 id 的附件 |
| `changelog` | `changelog:generate` | `(params: { repoPath: string; from?: string; to?: string }) => Promise<Result<ChangelogGroup[]>>` | 基于 conventional-commits 生成 Changelog 分组 |

`create` 参数说明：
- `tag`：必填，标签名。
- `name`：必填，Release 标题。
- `body`：必填，Release 正文。
- `draft`：可选，是否为草稿（Gitee 不支持，自动忽略）。
- `prerelease`：可选，是否为预发布。
- `platform`：可选，目标平台，缺省时由仓库远程推断。

`update` 参数说明：
- 至少传一个可编辑字段（`name` / `body` / `prerelease` / `draft`）。
- Gitee：`draft` 字段被忽略（Gitee 不支持 draft 切换）。

`uploadAsset` 参数说明：
- `filePath`：本地文件绝对路径（主进程会自己读 Buffer，不需要渲染层上传）。
- `label`：可选，附件显示名；缺省时用文件 basename。
- 大小限制：GitHub 软限 2GB；Gitee 实际约 100MB。

`changelog` 参数说明：
- `from` / `to`：可选，比较范围（引用或 SHA）；缺省时按默认范围生成。

---

### 3.5 `github` — GitHub 平台

> Gitee 命名空间的方法签名与 GitHub 基本一致，差异已在 3.6 节标注。

| 方法 | IPC 通道 | 签名 | 说明 |
| --- | --- | --- | --- |
| `listRepos` | `gh:list-repos` | `(params?: { visibility?: 'all' \| 'public' \| 'private'; sort?: 'updated' \| 'pushed' \| 'created' }) => Promise<Result<RemoteInfo[]>>` | 列出当前鉴权用户的 GitHub 仓库 |
| `createRepo` | `gh:create-repo` | `(params: { name: string; description?: string; private?: boolean; autoInit?: boolean; gitignoreTemplate?: string; licenseTemplate?: string }) => Promise<Result<RemoteInfo>>` | 在 GitHub 上创建新仓库 |
| `deleteRepo` | `gh:delete-repo` | `(owner: string, repo: string) => Promise<Result<void>>` | 删除指定仓库 |
| `searchRepos` | `gh:search-repos` | `(query: string, sort?: string) => Promise<Result<any[]>>` | ★ v0.3.4：搜索 GitHub 仓库（GitHub Search API，`octokit.search.repos`）；`q` 为搜索关键词，`per_page` 固定 50，返回仓库 `items` 数组 |
| `listPRs` | `gh:list-prs` | `(owner: string, repo: string, state?: 'open' \| 'closed' \| 'all') => Promise<Result<PullRequestInfo[]>>` | 列出仓库的 Pull Request |
| `listIssues` | `gh:list-issues` | `(owner: string, repo: string, state?: 'open' \| 'closed' \| 'all') => Promise<Result<IssueInfo[]>>` | 列出仓库的 Issue |
| `contentsList` | `gh:contents-list` | `(owner: string, repo: string, path?: string, ref?: string) => Promise<Result<RemoteFile[]>>` | 列出仓库目录下的条目 |
| `contentsRead` | `gh:contents-read` | `(owner: string, repo: string, path: string, ref?: string) => Promise<Result<RemoteFileContent>>` | 读取远程文件内容 |
| `contentsWrite` | `gh:contents-write` | `(params: { owner: string; repo: string; path: string; content: string; message: string; sha?: string; branch?: string }) => Promise<Result<void>>` | 创建/更新远程文件（更新时需提供 `sha`） |
| `contentsDelete` | `gh:contents-delete` | `(params: { owner: string; repo: string; path: string; message: string; sha: string; branch?: string }) => Promise<Result<void>>` | 删除远程文件（必填 `sha`） |
| `createPR` ★ v0.4+ | `gh:create-pr` | `(params: { owner: string; repo: string; title: string; body?: string; head: string; base: string; draft?: boolean }) => Promise<Result<{ number: number; url: string; htmlUrl: string }>>` | 创建 GitHub PR；返回 PR 编号和 URL |
| `getDefaultBranch` ★ v0.4+ | `gh:get-default-branch` | `(owner: string, repo: string) => Promise<Result<string>>` | 读取仓库默认分支名 |

`listRepos` 参数说明：
- `visibility`：可选，按可见性过滤。
- `sort`：可选，排序字段。

`contentsWrite` / `contentsDelete` 参数说明：
- `sha`：文件 blob SHA；`contentsWrite` 在更新时必填，新建时可省略；`contentsDelete` 始终必填。
- `branch`：可选，目标分支，缺省使用默认分支。

`searchRepos` 参数与返回说明：
- `query`：必填，搜索关键词（对应 Search API 的 `q` 参数）。
- `sort`：可选，排序方式（如 `stars`、`forks`、`updated`）。
- 内部调用 `octokit.search.repos({ q, per_page: 50 })`，返回 `items` 数组；条目字段含 `full_name`、`description`、`stargazers_count`、`forks_count`、`clone_url`、`html_url` 等。

---

### 3.6 `gitee` — Gitee 平台

签名与 GitHub 命名空间基本一致，使用 `gt:*` 系列通道。差异如下：

| 方法 | IPC 通道 | 签名 | 与 GitHub 的差异 |
| --- | --- | --- | --- |
| `listRepos` | `gt:list-repos` | `(params?: { visibility?: 'all' \| 'public' \| 'private'; sort?: 'updated' \| 'pushed' \| 'created' }) => Promise<Result<RemoteInfo[]>>` | 无 |
| `createRepo` | `gt:create-repo` | `(params: { name: string; description?: string; private?: boolean; autoInit?: boolean; gitignoreTemplate?: string; licenseTemplate?: string; homepage?: string }) => Promise<Result<RemoteInfo>>` | **新增 `homepage?` 字段**，用于设置仓库主页 |
| `deleteRepo` | `gt:delete-repo` | `(owner: string, repo: string) => Promise<Result<void>>` | 无 |
| `listPRs` | `gt:list-prs` | `(owner: string, repo: string, state?: 'open' \| 'closed' \| 'all') => Promise<Result<PullRequestInfo[]>>` | 无 |
| `listIssues` | `gt:list-issues` | `(owner: string, repo: string, state?: 'open' \| 'closed' \| 'all') => Promise<Result<IssueInfo[]>>` | 无 |
| `contentsList` | `gt:contents-list` | `(owner: string, repo: string, path?: string, ref?: string) => Promise<Result<RemoteFile[]>>` | 无 |
| `contentsRead` | `gt:contents-read` | `(owner: string, repo: string, path: string, ref?: string) => Promise<Result<RemoteFileContent>>` | 无 |
| `contentsWrite` | `gt:contents-write` | `(params: { owner: string; repo: string; path: string; content: string; message: string; sha?: string; branch?: string }) => Promise<Result<void>>` | 无 |
| `contentsDelete` | `gt:contents-delete` | `(params: { owner: string; repo: string; path: string; message: string; sha: string; branch?: string }) => Promise<Result<void>>` | 无 |
| `searchRepos` | `gt:search-repos` | `(query: string, sort?: string) => Promise<Result<any[]>>` | ★ v0.3.4：**搜索降级**。优先调用 Gitee `/search/repositories` 搜索 API；该 API 目前对仓库搜索恒返回空数组（已失效），空结果时自动降级为「我的仓库」（`/user/repos`）本地过滤（按名称/描述匹配 `query`） |
| `createPR` ★ v0.4+ | `gt:create-pr` | `(params: { owner: string; repo: string; title: string; body?: string; head: string; base: string }) => Promise<Result<{ number: number; url: string; htmlUrl: string }>>` | 创建 Gitee MR（Gitee 没有 draft 概念，忽略该参数） |
| `getDefaultBranch` ★ v0.4+ | `gt:get-default-branch` | `(owner: string, repo: string) => Promise<Result<string>>` | 读取 Gitee 仓库默认分支名 |

---

### 3.7 `settings` — 应用设置

| 方法 | IPC 通道 | 签名 | 说明 |
| --- | --- | --- | --- |
| `get` | `settings:get` | `() => Promise<Result<AppSettings>>` | 读取完整应用设置 |
| `set` | `settings:set` | `(settings: unknown) => Promise<Result<void>>` | 写入应用设置（部分更新即可，主进程会合并） |
| `testGit` | `settings:test-git` | `(gitPath?: string) => Promise<Result<{ version: string }>>` | 测试 git 可执行文件是否可用 |
| `testAuth` | `settings:test-auth` | `(platform: 'github' \| 'gitee', token: string) => Promise<Result<{ user: string }>>` | 测试平台令牌是否有效 |

---

### 3.8 `app` — 通用应用接口

> 本命名空间的方法直接返回 `Promise<T>`，**不**包装为 `Result<T>`。

| 方法 | IPC 通道 | 签名 | 说明 |
| --- | --- | --- | --- |
| `openPath` | `app:open-path` | `(path: string) => Promise<void>` | 在系统文件管理器中打开路径 |
| `shellOpen` | `app:shell-open` | `(url: string) => Promise<void>` | 通过系统默认应用打开 URL |
| `getPlatform` | `app:get-platform` | `() => Promise<NodeJS.Platform>` | 返回当前操作系统平台（如 `win32`、`darwin`、`linux`） |
| `getVersion` | `app:get-version` | `() => Promise<string>` | 返回应用版本号 |
| `openExternal` | `app:open-external` | `(url: string) => Promise<void>` | 使用系统默认浏览器打开外部 URL |

> 注：`app:get-platform`、`app:get-version`、`app:open-external` 三个通道在 `electron/main.ts` 中通过 `ipcMain.handle` 直接注册，未列入 `shared/ipc-channels.ts`。

---

### 3.9 `update` — 更新检查与下载安装

应用内置更新检查与应用内安装包下载安装流程。

| 方法 | IPC 通道 | 签名 | 说明 |
| --- | --- | --- | --- |
| `check` | `update:check` | `() => Promise<Result<AppUpdateInfo>>` | 主动检查更新（会显示提示） |
| `checkSilent` | `update:check-silent` | `() => Promise<Result<AppUpdateInfo>>` | 静默检查更新（用于启动后台轮询，无提示） |
| `dismiss` | `update:dismiss` | `(version: string) => Promise<Result<void>>` | 忽略指定版本的更新提示 |
| `open` | `update:open` | `(url: string) => Promise<Result<void>>` | 在系统浏览器中打开更新页面 |
| `download` | `update:download` | `(version: string, onProgress?: (p: DownloadProgress) => void) => Promise<Result<{ filePath: string } \| { cancelled: true }>>` | 下载安装包；通过 `onProgress` 回调接收 `update:download-progress` 事件；返回本地安装包路径或取消结果 |
| `cancelDownload` | `update:cancel-download` | `() => Promise<Result<void>>` | 取消进行中的下载 |
| `install` | `update:install` | `(filePath: string) => Promise<Result<void>>` | 启动已下载的安装包，主进程会随后退出本应用 |

`download` 实现细节：
- 内部监听 `update:download-progress` 通道，将 `DownloadProgress` 转发给 `onProgress` 回调。
- 调用完成后（无论成功或失败）通过 `finally` 自动移除监听器，避免泄漏。

下载进度事件阶段流转：`preparing` → `downloading` → `done`，异常时为 `error`，用户取消时为 `cancelled`。

> ★ v0.2.4+：下载过程走 4 路并发 HTTP Range（实测提速 3~6 倍），`speedBps` 字段实时填入速率
> ★ v0.2.6+：探活改用 `Range: bytes=0-0` GET（兼容部分 CDN/防火墙对 HEAD 的限制），错误信息汇总所有源失败原因
> ★ v0.3.1+/v0.3.3+：更新下载修复——Gitee 源下载地址取 Release 附件 URL；发起请求必须调用 `req.end()` 才会真正发出；探活重试 2 次、整体轮询最多 6 轮、同源重试 2 次

---

## 4. 主进程配置

源文件：`electron/main.ts`。

### 4.1 内容安全策略（CSP）

主进程通过 `session.defaultSession.webRequest.onHeadersReceived` 注入 `Content-Security-Policy` 响应头，依据 `VITE_DEV_SERVER_URL` 是否存在区分开发与生产模式。

**开发模式**（`isDev === true`）：

```
default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: ws: http://localhost:* http://127.0.0.1:*;
img-src 'self' data: https:;
font-src 'self' data:;
```

- 放行 `'unsafe-inline'` 与 `'unsafe-eval'` 以支持 Vite HMR 与热模块替换。
- 允许 `ws:` 与 `http://localhost:*` / `http://127.0.0.1:*` 连接开发服务器。

**生产模式**：

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
font-src 'self' data:;
img-src 'self' data: https:;
connect-src 'self' https://api.github.com https://gitee.com https://api.gitee.com;
```

- 仅允许 `'self'` 与必要的远程 API 域。
- 禁用 `unsafe-eval`，仅样式保留 `unsafe-inline`（Tailwind 等内联样式所需）。
- `connect-src` 显式允许 GitHub 与 Gitee API 域名。

### 4.2 主窗口创建

`createWindow()` 创建主 `BrowserWindow`，关键配置如下：

| 配置 | 值 | 说明 |
| --- | --- | --- |
| `width` / `height` | `1440` / `900` | 默认窗口尺寸 |
| `minWidth` / `minHeight` | `1024` / `640` | 最小窗口尺寸 |
| `show` | `false` | 创建后不立即显示，待 `ready-to-show` 触发 |
| `autoHideMenuBar` | `true` | 隐藏菜单栏 |
| `backgroundColor` | `#111827` | 深色背景，避免白屏 |
| `title` | `'KunyaoGit'` | 窗口标题 |
| `webPreferences.preload` | `electron/preload.js` | preload 路径 |
| `webPreferences.contextIsolation` | `true` | 启用上下文隔离 |
| `webPreferences.nodeIntegration` | `false` | 关闭 Node 集成 |
| `webPreferences.sandbox` | `false` | 关闭沙箱（便于 preload 加载模块） |

加载逻辑：
- 开发模式：`mainWindow.loadURL(VITE_DEV_SERVER_URL)`，并以 `mode: 'detach'` 打开 DevTools。
- 生产模式：`mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))`。

其他窗口行为：
- `console-message` 事件：将渲染层 console 转发到主进程 console（写入 `vite.log`），按级别映射为 `debug/log/warn/error`。
- `ready-to-show`：窗口准备好后才显示，避免白屏闪烁。
- `setWindowOpenHandler`：拦截 `window.open`，转交 `shell.openExternal` 打开外部链接，并返回 `{ action: 'deny' }` 阻止应用内新建窗口。
- `closed`：将 `mainWindow` 引用置空。

### 4.3 应用生命周期

```ts
app.setAppUserModelId('com.kunyao.kunyaogit');
```

- 设置 Windows 任务栏应用 ID 为 `com.kunyao.kunyaogit`。

`app.whenReady()` 内执行：
1. `setupCsp()`：注入 CSP。
2. 注册全部 IPC 处理器（顺序如下）：
   - `registerGitHandlers()`
   - `registerFsHandlers()`
   - `registerRepoHandlers()`
   - `registerSettingsHandlers()`
   - `registerGithubHandlers()`
   - `registerGiteeHandlers()`
   - `registerReleaseHandlers()`
   - `registerDialogHandlers()`
   - `registerUpdateHandlers()`
3. 直接注册三个简单通道：
   - `app:get-platform` → `process.platform`
   - `app:get-version` → `app.getVersion()`
   - `app:open-external` → `shell.openExternal(url)`
4. `createWindow()`：创建主窗口。
5. `app.on('activate', ...)`：macOS 下无窗口时重新创建。

`window-all-closed`：非 macOS 平台调用 `app.quit()`，macOS 保持活动以支持 dock 激活重建窗口。

### 4.4 主题

```ts
nativeTheme.themeSource = 'dark';
```

强制使用深色主题跟随系统。

---

## 5. IPC 通道清单

源文件：`shared/ipc-channels.ts`。下列常量在渲染进程与主进程间共享，避免硬编码字符串。

### 5.1 仓库管理（`repo`）

| 常量 | 通道字符串 |
| --- | --- |
| `REPO_OPEN_DIALOG` | `repo:open-dialog` |
| `REPO_OPEN` | `repo:open` |
| `REPO_LIST_RECENT` | `repo:list-recent` |
| `REPO_REMOVE_RECENT` | `repo:remove-recent` |
| `REPO_CLONE` | `repo:clone` |
| `REPO_INIT` | `repo:init` |
| `REPO_GET_INFO` | `repo:get-info` |

### 5.2 Git 基础（`git`）

| 常量 | 通道字符串 |
| --- | --- |
| `GIT_STATUS` | `git:status` |
| `GIT_LOG` | `git:log` |
| `GIT_BRANCHES` | `git:branches` |
| `GIT_STAGE` | `git:stage` |
| `GIT_UNSTAGE` | `git:unstage` |
| `GIT_DISCARD` | `git:discard` |
| `GIT_COMMIT` | `git:commit` |
| `GIT_PUSH` | `git:push` |
| `GIT_PULL` | `git:pull` |
| `GIT_FETCH` | `git:fetch` |
| `GIT_CHECKOUT` | `git:checkout` |
| `GIT_CREATE_BRANCH` | `git:create-branch` |
| `GIT_DELETE_BRANCH` | `git:delete-branch` |
| `GIT_MERGE` | `git:merge` |
| `GIT_DIFF` | `git:diff` |
| `GIT_DIFF_FILE` | `git:diff-file` |
| `GIT_STASH` | `git:stash` |
| `GIT_STASH_POP` | `git:stash-pop` |
| `GIT_RESET` | `git:reset` |
| `GIT_RESOLVE_CONFLICT` | `git:resolve-conflict` |
| `GIT_READ_CONFLICT` | `git:read-conflict` |
| `GIT_REMOTE_LIST` | `git:remote-list` |
| `GIT_REMOTE_ADD` | `git:remote-add` |
| `GIT_REMOTE_REMOVE` | `git:remote-remove` |
| `GIT_LS_FILES` | **★ v0.5+ 列出仓库工作区文件**（tracked + untracked，NUL 分隔；用于 Ctrl+P 跳转） |
| `GIT_BLAME` | **★ v0.5+ git blame**（--line-porcelain 解析为 BlameLine[]） |
| `GIT_FILE_LOG` | **★ v0.5+ 文件历史**（--follow 跟踪重命名） |
| `GIT_FILE_DIFF` | **★ v0.5+ 文件某次 commit 的 diff**（fromHash^..toHash） |

### 5.3 文件系统 / 编辑器（`fs`）

| 常量 | 通道字符串 |
| --- | --- |
| `FS_READ_DIR` | `fs:read-dir` |
| `FS_READ_FILE` | `fs:read-file` |
| `FS_WRITE_FILE` | `fs:write-file` |
| `FS_WRITE_BINARY` | `fs:write-binary` |
| `FS_MKDIR_P` | `fs:mkdir-p` |
| `FS_FILE_TREE` | `fs:file-tree` |
| `FS_DELETE` | `fs:delete` |
| `FS_RENAME` | `fs:rename` |

### 5.4 Release / Changelog（`release`）

| 常量 | 通道字符串 |
| --- | --- |
| `RELEASE_LIST` | `release:list` |
| `RELEASE_CREATE` | `release:create` |
| `RELEASE_DELETE` | `release:delete` |
| `RELEASE_GET` | `release:get` |
| `RELEASE_PUBLISH` | `release:publish` |
| `CHANGELOG_GENERATE` | `changelog:generate` |

### 5.5 GitHub（`github`）

| 常量 | 通道字符串 |
| --- | --- |
| `GH_LIST_REPOS` | `gh:list-repos` |
| `GH_CREATE_REPO` | `gh:create-repo` |
| `GH_DELETE_REPO` | `gh:delete-repo` |
| `GH_SEARCH_REPOS` | `gh:search-repos` |
| `GH_LIST_PRS` | `gh:list-prs` |
| `GH_LIST_ISSUES` | `gh:list-issues` |
| `GH_CONTENTS_LIST` | `gh:contents-list` |
| `GH_CONTENTS_READ` | `gh:contents-read` |
| `GH_CONTENTS_WRITE` | `gh:contents-write` |
| `GH_CONTENTS_DELETE` | `gh:contents-delete` |

> `GH_SEARCH_REPOS`：渲染层调用 `gitgui.github.searchRepos(q)`，主进程走 GitHub Search API（`octokit.search.repos`）。

### 5.6 Gitee（`gitee`）

| 常量 | 通道字符串 |
| --- | --- |
| `GT_LIST_REPOS` | `gt:list-repos` |
| `GT_CREATE_REPO` | `gt:create-repo` |
| `GT_DELETE_REPO` | `gt:delete-repo` |
| `GT_SEARCH_REPOS` | `gt:search-repos` |
| `GT_LIST_PRS` | `gt:list-prs` |
| `GT_LIST_ISSUES` | `gt:list-issues` |
| `GT_CONTENTS_LIST` | `gt:contents-list` |
| `GT_CONTENTS_READ` | `gt:contents-read` |
| `GT_CONTENTS_WRITE` | `gt:contents-write` |
| `GT_CONTENTS_DELETE` | `gt:contents-delete` |

> `GT_SEARCH_REPOS`：渲染层调用 `gitgui.gitee.searchRepos(q)`，主进程优先调用 Gitee `/search/repositories` 搜索，空结果时降级为「我的仓库」（`/user/repos`）本地过滤。

### 5.7 设置与对话框（`settings` / `dialog`）

| 常量 | 通道字符串 |
| --- | --- |
| `SETTINGS_GET` | `settings:get` |
| `SETTINGS_SET` | `settings:set` |
| `SETTINGS_TEST_GIT` | `settings:test-git` |
| `SETTINGS_TEST_AUTH` | `settings:test-auth` |
| `DIALOG_SHOW_OPEN` | `dialog:show-open` |
| `DIALOG_SHOW_SAVE` | `dialog:show-save` |

> `DIALOG_SHOW_OPEN` / `DIALOG_SHOW_SAVE` 在 `electron/main.ts` 中由 `registerDialogHandlers()` 注册，preload 未直接暴露封装方法，可在主进程需要时由其他模块复用。

### 5.8 通用应用接口（`app`）

| 常量 / 通道 | 通道字符串 | 来源 |
| --- | --- | --- |
| `APP_OPEN_PATH` | `app:open-path` | `shared/ipc-channels.ts` |
| `APP_SHELL_OPEN` | `app:shell-open` | `shared/ipc-channels.ts` |
| — | `app:get-platform` | `electron/main.ts` 内联注册 |
| — | `app:get-version` | `electron/main.ts` 内联注册 |
| — | `app:open-external` | `electron/main.ts` 内联注册 |

### 5.9 更新检查 / 应用内下载安装（`update`）

| 常量 | 通道字符串 | 方向 |
| --- | --- | --- |
| `UPDATE_CHECK` | `update:check` | 渲染 → 主 |
| `UPDATE_CHECK_SILENT` | `update:check-silent` | 渲染 → 主 |
| `UPDATE_DISMISS` | `update:dismiss` | 渲染 → 主 |
| `UPDATE_OPEN` | `update:open` | 渲染 → 主 |
| `UPDATE_DOWNLOAD` | `update:download` | 渲染 → 主（开始下载安装包） |
| `UPDATE_DOWNLOAD_PROGRESS` | `update:download-progress` | 主 → 渲染（进度事件） |
| `UPDATE_INSTALL` | `update:install` | 渲染 → 主（启动已下载的安装包并退出） |
| `UPDATE_CANCEL_DOWNLOAD` | `update:cancel-download` | 渲染 → 主（取消下载） |

### 5.10 类型导出

```ts
export type IpcChannel = (typeof IPC)[keyof typeof IPC];
```

`IpcChannel` 联合类型涵盖 `IPC` 对象中所有字符串字面量，便于主进程在注册处理器时获得类型约束。

---

## 6. 内部事件（v0.2.5+）

主进程不通过 IPC 通道广播的运行时事件，由 `window.dispatchEvent` 在渲染层派发 CustomEvent。

| 事件名 | 载荷 | 触发时机 | 监听方 |
| --- | --- | --- | --- |
| `kg-theme-change` | `Theme` (`'dark' \| 'ocean' \| 'light'`) | ★ v0.2.5：用户切换主题 / 启动时同步主题 | `EditorPane` / `RepoDetailPage` 的 Monaco 主题同步逻辑 |

### 6.1 `kg-theme-change` 用法

```ts
// 监听主题变化（典型用途：同步 Monaco 编辑器主题）
window.addEventListener('kg-theme-change', (e: CustomEvent<Theme>) => {
  const theme = e.detail;
  // window.monaco?.editor?.setTheme(theme === 'light' ? 'vs' : 'vs-dark');
});

// 当前主题（同步读：document.documentElement.getAttribute('data-theme')）
const current = document.documentElement.getAttribute('data-theme');
```

### 6.2 相关 hook

```ts
// src/hooks/useTheme.ts
import { useThemeSync, setTheme, THEME_LIST, monacoThemeFor } from '@/hooks/useTheme';

// 在 App 根挂一次（已挂，见 src/App.tsx）
useThemeSync();

// 编程式切换（持久化）
await setTheme('ocean');

// 主题列表（用于渲染 UI）
THEME_LIST.forEach(th => console.log(th.value, th.labelZh, th.labelEn, th.swatch));

// Monaco 主题映射
monacoThemeFor('light');   // 'vs'
monacoThemeFor('ocean');   // 'vs-dark'
monacoThemeFor('dark');    // 'vs-dark'
```

---

## 附录：调用示例

```ts
// 打开仓库并获取状态
const r = await window.gitgui.repo.open('D:/code/my-repo');
if (r.ok) {
  const s = await window.gitgui.git.status(r.data.path);
  if (s.ok) {
    console.log(s.data); // FileStatus[]
  }
}

// 下载更新并监听进度
const u = await window.gitgui.update.check();
if (u.ok && u.data.hasUpdate && u.data.latest) {
  const d = await window.gitgui.update.download(
    u.data.latest.version,
    (p) => console.log(`${p.phase}: ${p.percent}%`),
  );
  if (d.ok && 'filePath' in d.data) {
    await window.gitgui.update.install(d.data.filePath);
  }
}
```

---

> 本文档与 `shared/types.ts`、`shared/ipc-channels.ts`、`electron/preload.ts`、`electron/main.ts` 保持同步。若源文件结构变更，请同步更新本文档。
