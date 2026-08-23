# KunyaoGit 功能详解

> 面向用户与开发者的完整功能清单。当前版本：**v0.3.8**（见 `package.json`）。
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

**说明**：本文档与 `package.json`、`shared/ipc-channels.ts`、`shared/types.ts`、`electron/` 同源。改任何功能，请同步本文档。
