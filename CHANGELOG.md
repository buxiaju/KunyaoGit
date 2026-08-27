# Changelog

所有 KunyaoGit 的显著变更都记录在此文件。版本遵循 [Semantic Versioning](https://semver.org/)。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

---

## [0.6.3] - 2026-08-27

v0.6.2 实际使用中暴露的 6 个 bug 集中修：generateSshKey 对空 keyPath 误 throw + SSH 设置区冗余 / 错位 + parseSshResult 漏 stderr / ANSI 颜色码 / testResult 串台 / require 在 ESM 下抛错。代码 / 测试 / 文档 / 发版都在这一轮落定。

### Fixed
- 🔑 **`generateSshKey` 空 keyPath 误 throw**（v0.6.2 真实使用 bug）
  - 原来后端对前端传的 `keyPath: ''` 直接抛 `'keyPath 不能为空'`
  - `GenerateSshKeyInput.keyPath` 改可选 + 新增 `host?: 'github.com' | 'gitee.com'`
  - 空 keyPath + 有 host → 自动 `~/.ssh/id_ed25519_<github|gitee>`（自动 mkdir `~/.ssh`）
  - 空 keyPath + 无 host → throw 明确错误（指明要传 host）
  - 显式 keyPath 不受影响（host 字段不参与）
- 🛠️ **SSH 设置区 UI 精简**（v0.6.2 真实使用反馈）
  - 删"SSH 私钥路径（兜底）"输入框（按 host 已有 GitHub / Gitee 私钥，兜底字段冗余）
  - `state.sshKeyPath` + `settings.sshKeyPath` 仍保留兼容历史数据 + sshWriteConfig 兜底逻辑
  - 修复"Git 可执行文件路径"的"选择"按钮：`window.prompt()` 在 Electron 渲染层默认禁用（`prompt() is not supported`），改用 `window.gitgui.dialog.showOpen({ properties: ['openFile'], filters: [{name: 'Git', extensions: ['exe','cmd','bat']}, ...] })` 弹系统文件选择器
- 🗂️ **`listSshKeys` / `deleteSshKey`**（解决"重复生成密钥没入口删"）
  - `listSshKeys()` 扫 `~/.ssh/id_*(ed25519|rsa|ecdsa|dsa)` + 配对 `.pub` → 算 fingerprint，按文件名后缀推断 host（`id_ed25519_github` → `github.com` / `_gitee` → `gitee.com`）
  - `deleteSshKey(keyPath)` 删一对（私钥 + .pub），**安全护栏**：路径必须在 `~/.ssh/` 下 + 文件名必须 `id_*` 前缀
  - 前端 SSH 区顶部加"已存在的 SSH 私钥"卡片，每行：文件名 + host badge + fingerprint + "使用此 key"（自动填到对应 host 字段） + "删除"（带 confirm 弹窗）
  - 进入设置页自动扫描；生成密钥后自动刷新
- 🎨 **`parseSshResult` 漏 stderr**（GitHub ssh -T 行为）
  - GitHub 的 `ssh -T git@github.com` 成功消息走 stderr（OpenSSH 行为），原 parseSshResult 只查 stdout → 匹配失败 → 走到 fallback error 整段英文 `Hi buxiaju! ...shell access.` 露馅
  - 改成 stdout + `\n` + stderr 合并检测成功标记；用户名提取优先 stdout 失败回 stderr
- 🎨 **SSH 输出剥 ANSI 颜色码**
  - OpenSSH 交互式终端会加 `\x1b[36;01m...` 之类，原样显示用户看到 `[36;01m不侠居(@buxiaju)[0m`
  - 新增 `stripAnsi(s)` 纯函数（`\x1b\[[0-9;?]*[ -/]*[@-~]`），parseSshResult / catch 分支统一剥
- 🔧 **拆 `testResult` 状态**
  - 原共用 `testResult` 导致"测试 Gitee 连接"结果在 Git 路径下方也显示（互相串）
  - 拆成 `gitTestResult`（Git 路径 Field 下方） + `sshTestResult`（SSH 推送区底部"写入"按钮旁边）
- 📦 **`writeSshConfigFile` dev ESM require 报错**
  - dev 模式 main.js 是 ESM（vite-plugin-electron 编译），`require('../lib/sshConfig')` 抛 `Cannot find module`
  - 改用文件顶部 `import { writeSshConfig } from '../lib/sshConfig'`（sshConfig.ts 纯函数无依赖，不引入循环）
- 🖼️ **生成结果卡片位置**（避免与"写入 ~/.ssh/config"按钮视觉混淆）
  - 原来在 SSH 区底部（"写入"按钮下方），用户以为"写入"触发了公钥显示
  - 移到对应 host 的 Field 下方（GitHub 卡片在 GitHub Field 后、Gitee 卡片在 Gitee Field 后）

### Changed
- 🌐 **i18n**（zh + en）
  - 删：`settings.sshKeyPath` / `sshKeyPathHint` / `sshKeyPathPlaceholder` / `gitPathPrompt`
  - 加：`settings.gitPathDialogTitle` / `sshExistingKeys` / `sshUseThisKey` / `sshDeleteKey` / `sshDeleteConfirm` / `sshDeleteOk` / `sshDeleteFailed`

### Tests
- 自动化测试 598 → **631 例全绿**（31 文件，约 6 秒）
  - 新增 6 例：parseSshResult ANSI × 2 / parseSshResult GitHub/Gitee stderr × 2 / stripAnsi × 4
  - 新增 16 例：listSshKeys 10 + deleteSshKey 6
  - 之前 9 例（generateSshKey fallback / file-exists / missing-comment / 等）已存在

---

## [0.6.2] - 2026-08-27

v0.6.1 的 SSH 推送支持是「单一 key」模式（所有 host 共享 `sshKeyPath`），v0.6.2 升级为「按 host 独立 key」：GitHub / Gitee 各自用专用 key，OpenSSH config 路由让 ssh / git 客户端按 host 自动选 IdentityFile。设置页支持一键生成 ed25519 密钥 + 显示/复制公钥。代码 / 测试 / 文档 / 同步都在前面 3 个 commit 落定：feat(ssh-host) / feat(ssh-ui) / docs(ssh)。

### Added
- 🔑 **SSH 按 host 路由**（v0.6.1 单一 key → v0.6.2 多 key）
  - **数据模型**：`AppSettings.sshKeysByHost = { github?: string, gitee?: string }` 新增；旧 `sshKeyPath` 标记 @deprecated 保留为兜底（未在 sshKeysByHost 配置的 host 自动 fallback）
  - **OpenSSH config 路由**：`electron/lib/sshConfig.ts` 新增（纯函数 + 25 例单测）。把 "Host github.com / Host gitee.com" 块写入 `~/.ssh/config`，用 `# >>> KunyaoGit managed block (do not edit) >>>` / `# <<< KunyaoGit managed block <<<` 标记管理（用户的其他 Host 块原样保留）
  - **GitService 改造**：构造时**不**再注入 `GIT_SSH_COMMAND` env。`_sshKeyPath` 参数保留兼容（仅忽略）。让 OpenSSH config 接管 ssh 行为，与系统其他 ssh 调用一致
  - **新 IPC 通道** 5 个：`SETTINGS_TEST_SSH_FOR_HOST` / `SETTINGS_SSH_GENERATE` / `SETTINGS_SSH_READ_PUBKEY` / `SETTINGS_SSH_WRITE_CONFIG` / `SETTINGS_SSH_READ_CONFIG`
- 🛠️ **一键生成 SSH 密钥**（设置页「SSH 推送」区）
  - 「生成新密钥」按钮（GitHub / Gitee 行各一个）→ 弹出表单（密钥文件名 / comment / 类型）
  - 调 `ssh-keygen -t ed25519 -f <path> -N "" -C <comment>` 生成
  - 私钥落在 `~/.ssh/id_ed25519_github` / `id_ed25519_gitee`（无 passphrase）
  - **自动复制公钥**到剪贴板，下方有「去 GitHub 添加 SSH key」「去 Gitee 添加 SSH key」跳转链接
- 🔍 **按 host 测试连接**（替代 v0.6.1 的单一测试按钮）
  - 「测试 GitHub 连接」→ `ssh -i <key> -T git@github.com`
  - 「测试 Gitee 连接」→ `ssh -i <key> -T git@gitee.com`
  - 仅白名单 github.com / gitee.com（避免探测任意 SSH 服务）
  - 成功解析 `Hi <user>! You've successfully authenticated`；失败分类 Permission denied / DNS / 超时 / 命令不存在
- 📋 **写入 `~/.ssh/config`** 一键按钮
  - 设置页底部按钮 → 调用 `SETTINGS_SSH_WRITE_CONFIG` 写 KunyaoGit managed block
  - 0600 权限（OpenSSH 安全要求）
- 🔄 **v0.6.1 兼容**：旧 `sshKeyPath` 在 UI 自动迁移到 `sshKeysByHost.github`（user 改设置保存时一次性迁移）
- 🛡️ **新增纯函数** `getEffectiveKeyForHost(host, keysByHost, fallback)` + `detectRemoteHost(url)`（两端镜像：electron/lib/sshConfig.ts + src/lib/sshConfig.ts）

### Changed
- ⚙️ **GitService 构造签名兼容**：第三个参数 `_sshKeyPath` 标记为忽略（v0.6.1 注入 env 的行为移除，OpenSSH config 接管）
- 🌐 **i18n**（zh + en 各 + 22 个 key）：`settings.sshGithubKey` / `sshGiteeKey` / `sshGenerateKey` / `sshPublicKey` / `sshCopyToClipboard` / `sshCopied` / `sshWriteConfig` / `sshTestGithub` / `sshTestGitee` / `sshAddToGithub` / `sshAddToGitee` / `sshKeyName` / `sshKeyComment` / `sshKeyType` / `sshKeyTypeEd25519` / `sshKeyGenerated` / `sshConfigWritten` / `sshGenerateFailed` / `sshWriteConfigFailed` / `sshGenerateKeyTitle` / `sshKeyExists` / `sshOpenSshDir`

### Tests
- 自动化测试 572 → **598 例全绿**（29 文件，约 5 秒）
- 新增 `tests/unit/sshConfig.test.ts`（25 例）：`renderBlock` / `renderManagedSection` / `stripManagedSection` / `writeSshConfig` / `getEffectiveKeyForHost` / `detectRemoteHost`
- 改 `tests/unit/gitService.test.ts`：v0.6.1 的 4 个"传 sshKeyPath 注入 env"测试改写为 v0.6.2 行为"simple-git 不收 env（OpenSSH config 接管）"
- 跑全量：`npm run typecheck` 0 错 / `npm test` 598/598 / `npx vite build` 0 错

### Tech
- `electron/lib/sshConfig.ts`（新增）—— 纯函数，零 fs / shell 依赖，便于单测
- `src/lib/sshConfig.ts`（新增）—— 渲染端镜像（只含 getEffectiveKeyForHost / detectRemoteHost 两个函数）
- `electron/services/git.ts` 改造：构造不注入 env
- `electron/services/settings.ts` 加 4 个新函数：`generateSshKey` / `readPublicKey` / `readSshConfigFile` / `writeSshConfigFile` / `testSshConnectionForHost`
- `src/stores/settings.ts` DEFAULTS 加 `sshKeysByHost: { github: '', gitee: '' }`
- `src/pages/SettingsPage.tsx` SSH 区重写：按 host 拆分两个 input 行 + 「生成」「测试」「写入 config」按钮 + 内联生成表单 + 公钥展示

### Known Limitations
- **SSH 私钥 passphrase**：v0.6.2 UI 不提供 passphrase 输入（默认空）。需要 passphrase 的用户可手动 `ssh-keygen -p -f <key>` 重新加密
- **生成后没自动 `ssh-add`**：用户需手动 `ssh-add ~/.ssh/id_ed25519_github` 或重启 ssh-agent
- **Gitee SSH 响应格式**与 GitHub 不同（不一定含 `Hi <user>!`），可能误判为失败；v0.6.3 加 Gitee 特定解析
- **设置页"打开 ~/.ssh 目录"** 暂未实现新 IPC `app:open-ssh-dir`（v0.6.3 候选）

---

## [0.6.1] - 2026-08-27

v0.6.0 稳定后一轮「非功能加固 + SSH 推送支持」双发版本。代码 / 测试 / 文档 / 同步都在前面 3 个 commit 落定：fix(robustness) / feat(ssh-push) / docs。

### Added
- 🔐 **SSH 推送支持**（解决 github.com:443 受限场景）
  - **设置项**：`AppSettings.sshKeyPath`（自定义私钥路径）+ `preferredProtocol`（`auto` / `https` / `ssh` 三选一）
  - **GitService 构造时**按 `settings.sshKeyPath` 注入 `GIT_SSH_COMMAND=ssh -i <key> -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o BatchMode=yes`，后续 `git push / fetch / pull` 自动走指定 key
  - **URL 互转**：`parseRemote`（electron + src 两镜像）新增 `detectProtocol` / `toSshUrl` / `toHttpsUrl`
  - **新 IPC 通道**：`git:set-remote-url`（一键把 origin 从 HTTPS 切到 SSH）+ `settings:test-ssh`（探测 `git@github.com`）
  - **设置页新增「SSH 推送」区**：私钥路径输入 + 协议偏好三选一 + 测试连接 + 保存
  - **push 失败增强**：`ChangesPanel` 检测 `Failed to connect to ... port 443` 类网络错误，`window.confirm` 弹窗"是否切换到 SSH？"，确认后调 `switchOriginToSsh` 自动改 remote URL
  - **典型流程**：HTTPS push 失败 → 弹窗 → 确认 → origin 自动从 `https://github.com/...` 改成 `git@github.com:...` → 重试 push 走 22 端口
- 📋 **`parseSshResult` 纯函数**（testSshConnection 错误分类 9 例测试覆盖）：解析 ssh -T 输出，区分 `successfully authenticated` / `Permission denied` / `Could not resolve hostname` / `Connection timed out` / `No such file or directory` / 未知
- 🛡️ **错误消息路径脱敏**（`electron/lib/safePath.ts` 的 `redactPath`）
  - Windows 盘符路径 `C:\Users\kunyao\Documents\xxx\file.txt` → `~\xxx\file.txt`（保留最后两段：文件名 + 直接父目录）
  - POSIX 用户路径 `/Users/bob/proj/foo.ts` → `~/proj/foo.ts`
  - UNC 长路径前缀 `\\?\C:\...` → `<long-path>\...`
  - WSL 路径 `\\wsl$\Ubuntu\...` → `<wsl>\...`
  - `GitService.describeError` + `globalErrorHandler.describeReason` 双层脱敏，toast / 日志 / 远程 API 错误回显统一处理
- 🛡️ **渲染层错误落盘**（新增 IPC `app:log-error`）
  - 路径：`userData/logs/renderer-error.log`（与 `main-error.log` 独立，1MB 轮转）
  - 16KB 单条上限 + 失败静默（日志落盘不能反过来影响主进程稳定性）
  - 形态校验：`kind` 必须 `unhandledrejection | error | manual`，`message` 必填

### Fixed
- 🔒 **P0 全局异常兜底**（主进程 + 渲染进程 + 渲染进程崩溃/无响应）
  - 主进程 `uncaughtException` / `unhandledRejection` 落 `userData/logs/main-error.log` + 30s 节流（防弹窗风暴）
  - 渲染进程 `unhandledrejection` / `error` 监听 + 5s 节流 + toast
  - 渲染进程崩溃 / 无响应监听（`render-process-gone` / `unresponsive` / `did-fail-load`），过滤 `ERR_ABORTED`
- 🔒 **P0 协议白名单扩 4 入口**（用 WHATWG `URL` 解析挡 `java\nscript:` / 大小写混写）：`update:open` / `app:shell-open` / `app:open-path`（含 `@userData` 哨兵）/ 渲染层内联 URL
- 🔒 **P0 仓库根路径白名单 + 系统目录黑名单**（8 个 fs handler + repo:open + git:status 等 32 个 handler）
  - `path.relative` 而非 `startsWith`（防 `C:\repo-evil` 命中 `C:\repo`）
  - 系统目录黑名单（`C:\Windows` / `C:\Program Files` / `System32` / `node_modules`）优先级**高于**白名单
- 🔒 **P0 配置文件 JSON 损坏自愈**：备份为 `.corrupt-<时间戳>.json` 后重建；目录不可写 → 降级内存 store（当前会话能用，重启丢失，弹 toast 告知）
- 🔒 **P0 Markdown / 富文本 sanitize**（`src/lib/sanitizeHtml.ts`）：DOMPurify 白名单 + 启动自检探针（实测 3.4.14 在 happy-dom 下会静默失效，自检+失效降级为纯文本）+ 16KB 输出侧强特征复查
- 🔒 **P0.5 补漏**：`ipc/git.ts` 32 个 handler 收口走 `getGitSafe`（含 `Map<repoPath, GitService>` 实例缓存 + simple-git 启动异常 `try/catch` 兜成 Result）
- 🔒 **P0.6 补漏**：`git:blame` / `git:file-log` / `git:file-diff` / `git:diff-file` / `git:read-conflict` 5 个 handler 的 `file` 仓库内路径校验（`assertInsideRepo`，防 `../../../etc/passwd` 类输入）
- 🛡️ **P1 单实例锁**：`app.requestSingleInstanceLock()` + `second-instance` 唤起 + 聚焦（根因：单实例锁之前，并发写 `gitgui-settings.json` 会产生半截 JSON 触发 P0 损坏自愈）
- 🛡️ **P1 Git 命令 60s 超时**（`simple-git` 的 `timeout: { block: 60_000 }`）+ `Block timeout reached` 翻译为中文
- 🛡️ **P1 settings store 加载/保存容错**（`src/stores/settings.ts` 的 `load` / `save` `try/catch`，失败也置 `loaded: true` 不卡 loading）+ 写串行化（`writeQueue: Promise chain`，单进程内并发不再丢更新）
- 🛡️ **P1 二进制文件读取 10MB 上限**（`MAX_BINARY_BYTES`，超过直接拒）
- 🛡️ **P1 `REPO_LIST_RECENT` 并行化**（10 个仓库 `Promise.all` 而非串行 `fs.access`）+ 移除时同步 `unregisterAllowedRoot` + 不可达条目**跳过**而非删除（移动硬盘未插时不让用户记录莫名消失）
- 🛡️ **P1 文件树 symlink 环保护**（`electron/lib/fileTree.ts` 的 `buildFileTree` 走 realpath 去重）

### Security
- 依赖：`+ dompurify@^3.4.14`（生产），`+ jsdom@^`（dev，仅测试用）

### Tests
- 自动化测试 526 → **572 例全绿**（28 文件，约 5 秒）
- 新增：safePath（19） / safeUrl（11） / crashGuard（8） / sanitizeHtml（10 + happy-dom fallback 6） / ErrorBoundary（4） / globalErrorHandler（4） / fileTree（14） / ipcGitHandlers（8） / settingsStore 写串行（4） / gitTimeout（4） / appLogError（9） / parseRemote 30（含 16 个 src/electron 镜像一致性断言） / pushErrorHint 15 / sshConnection 15
- MarkdownBody.test.tsx 反转了锁定漏洞的断言
- tests/setup.ts 修复了 `fs` mock 错名 `fsLocal`、`dialog` 键重复等历史问题

### Tech
- `electron/lib/safePath.ts` / `safeUrl.ts` / `crashGuard.ts` / `fileTree.ts` / `parseRemote.ts` 新增
- `electron/ipc/app.ts` 新增（`app:log-error` handler）
- `src/lib/sanitizeHtml.ts` / `globalErrorHandler.ts` / `pushErrorHint.ts` 新增
- `src/components/common/ErrorBoundary.tsx` 新增（两层错误边界，刻意不依赖 i18n）
- 错误消息翻译：`src/lib/sanitizeHtml.ts` 启动自检（DOMPurify 在 happy-dom 静默失效的发现）

### Known Limitations
- **Gitee 单附件 ≤ 100MB**（平台限制；UI 在 Gitee 平台 + 大文件时给 amber 提示）
- **Release body Markdown sanitize 启动自检**在 `happy-dom` 等非完整 DOM 环境会判定为「不可信」并降级为纯文本渲染（详见 `docs/features.md` §22.2.8）
- **错误消息路径脱敏**在某些边角场景下可能过度（保留最后两段是 90% 场景的最优解，但纯路径无文件名的报错会丢失上下文；详见 `docs/features.md` §22.9）
- **设置页"选择 SSH 私钥"**用 `prompt` 而不是文件选择对话框（项目里 `fs:*` 通道都是目录接口，"选单个文件"的 IPC 还没有；详见 `docs/features.md` §23.5）
- **`preferredProtocol: 'ssh'`**模式当前不做"自动改 remote + push + 还原"的临时切换（v0.7 候选）

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
