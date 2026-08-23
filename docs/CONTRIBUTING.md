# 贡献指南（Contributing）

> 感谢你愿意为 **KunyaoGit** 贡献代码！这是一款基于 Electron 33 + React 18 + TypeScript 的 Git 桌面客户端，深度集成 GitHub 与 Gitee 双平台。
>
> 在开始之前，请先阅读 [`ARCHITECTURE.md`](./ARCHITECTURE.md) 了解项目结构，阅读 [`docs/development-guide.md`](./docs/development-guide.md) 了解开发与打包流程，阅读 [`docs/features.md`](./docs/features.md) 了解功能全貌。

---

## 目录

1. [贡献流程](#1-贡献流程)
2. [分支命名规范](#2-分支命名规范)
3. [提交信息规范](#3-提交信息规范)
4. [代码审查标准](#4-代码审查标准)
5. [Issue 报告模板](#5-issue-报告模板)
6. [开发环境设置步骤](#6-开发环境设置步骤)
7. [联系方式](#7-联系方式)

---

## 1. 贡献流程

整体遵循 **Fork → Branch → Commit → PR** 模型：

1. **Fork** 仓库
   - GitHub：`https://github.com/buxiaju/KunyaoGit` → 右上角 Fork
   - 或 Gitee 镜像：`https://gitee.com/buxiaju/KunyaoGit`

2. **克隆你 Fork 的仓库**到本地

   ```bash
   git clone https://github.com/<你的用户名>/KunyaoGit.git
   cd KunyaoGit
   ```

3. **添加上游**（用于同步主仓库更新）

   ```bash
   git remote add upstream https://github.com/buxiaju/KunyaoGit.git
   git remote add gitee-upstream https://gitee.com/buxiaju/KunyaoGit.git   # 可选
   ```

4. **创建特性分支**（命名规范见 §2）

   ```bash
   git checkout -b feature/your-feature
   ```

5. **安装依赖并开发**（见 §6 开发环境设置）

   ```bash
   npm install
   npm run dev
   ```

6. **提交前自检**

   ```bash
   npm run typecheck   # tsc -b --noEmit，必须通过
   npm run lint        # eslint . --ext .ts,.tsx --fix
   ```

7. **提交**（提交信息规范见 §3）

   ```bash
   git add <相关文件>          # 按需 add，不要用 git add -A
   git commit -m "feat(update): 支持取消下载"
   ```

8. **同步上游**（避免与主干冲突）

   ```bash
   git fetch upstream
   git rebase upstream/master   # 或 merge
   ```

9. **推送并发起 PR**

   ```bash
   git push origin feature/your-feature
   ```

   然后在 GitHub 上向 `buxiaju/KunyaoGit:master` 发起 Pull Request，填写 PR 模板（关联 Issue、说明改动、自检结果）。

10. **等待代码审查**（见 §4），根据反馈在**同一分支**上继续提交，PR 会自动更新。

> **不要**直接向 `master` 推送。所有改动走 PR。
> **不要**在 PR 中混入无关改动；一个 PR 只做一件事。

---

## 2. 分支命名规范

采用 `<type>/<简短描述>` 的形式，描述用 kebab-case（小写连字符）：

| 前缀 | 用途 | 示例 |
| --- | --- | --- |
| `feature/` | 新功能 / 新增能力 | `feature/ssh-key-mgmt` |
| `fix/` | Bug 修复 | `fix/update-dialog-cancel` |
| `chore/` | 构建 / 依赖 / 杂项 | `chore/upgrade-electron-34` |
| `release/` | 发版相关 | `release/v0.3.0` |
| `docs/` | 文档 | `docs/add-api-reference` |
| `refactor/` | 重构（无行为变化） | `refactor/git-service` |
| `perf/` | 性能优化 | `perf/diff-render` |

**规则**：

- 分支名全小写，单词间用 `-`
- 描述简短但能表达意图，避免 `feature/wip`、`fix/1` 这类无意义命名
- 一个分支只承载一个主题

---

## 3. 提交信息规范

遵循 [Conventional Commits](https://www.conventionalcommits.org/)，与项目内 `electron/services/changelog.ts` 的 CHANGELOG 自动生成器一致（变更类型会被自动归类）。

### 3.1 格式

```
<type>(<scope>): <subject>

<body>

<footer>
```

### 3.2 类型（type）

| type | 含义 | 是否进 CHANGELOG |
| --- | --- | --- |
| `feat` | 新功能 | ✅ Features |
| `fix` | Bug 修复 | ✅ Bug Fixes |
| `docs` | 文档变更 | ✅ Docs |
| `refactor` | 重构（既非 feat 也非 fix） | ✅ Refactor |
| `perf` | 性能优化 | ✅ Perf |
| `chore` | 构建 / 依赖 / 杂项 | ✅ Chore |
| `style` | 格式（空格 / 分号等，无逻辑变化） | ❌ |
| `test` | 测试相关 | ❌ |
| `ci` | CI 配置 | ❌ |
| `build` | 构建系统 / 外部依赖 | ❌ |

> `shared/types.ts` 的 `ChangelogGroup.type` 即对应这里前 6 项加 `other`。

### 3.3 范围（scope，可选）

常见 scope：`git` / `github` / `gitee` / `release` / `update` / `settings` / `repo` / `editor` / `diff` / `ui` / `build`。

### 3.4 示例

```
feat(update): 支持应用内下载安装并自动退出

实现 Gitee 优先 / GitHub 兜底的多源下载，下载完成自动启动安装包
并退出当前应用以释放 exe 文件锁。

Closes #42
```

```
fix(update): 修复 IPC handler 重复注册导致启动崩溃

app:get-version 在 main.ts 与 ipc/update.ts 各注册一次，触发
"Attempted to register a second handler" 并阻断 createWindow()。
```

```
chore(deps): 升级 electron-store 锁定 v8.2.0
```

```
docs: 补充 v0.2.2 自动更新功能说明
```

### 3.5 规则

- **subject** 用祈使句、现在时，首字母小写，结尾不加句号
  - ✅ `feat: 支持取消下载`
  - ❌ `Feat: 支持取消下载.`
- **body** 说明「为什么」而非「做了什么」（diff 已经说明了 what）
- **footer** 用于 `Closes #42` / `BREAKING CHANGE:` 等
- 一个提交只做一件事，避免「feat + fix + chore 混合」的大提交
- **不要**在提交里包含 `package-lock.json` 的大规模改动（除非有意升级依赖）

---

## 4. 代码审查标准

PR 合并前需满足以下标准（由维护者或资深贡献者审查）：

### 4.1 必须项

| 项 | 标准 |
| --- | --- |
| 类型检查 | `npm run typecheck` 通过（`tsc -b --noEmit`，严格模式全开） |
| Lint | `npm run lint` 无 error（warning 可酌情保留） |
| 提交信息 | 符合 §3 Conventional Commits |
| 分支命名 | 符合 §2 规范 |
| 无敏感信息 | 不含 token / 密钥 / `.env` / 个人路径 |
| 安全 | Token 不进渲染层；IPC handler 缺 token 提前拦截并返回中文友好错误（见 `ARCHITECTURE.md` §11.10） |
| 无调试残留 | 无 `console.log` / 注释掉的死代码 / `TODO` 遗留 |

### 4.2 架构一致性

- 渲染进程**不能**直接 `require('fs')` / 访问 Node API（`contextIsolation: true`）
- 所有 Node 能力走 IPC：渲染层只通过 `window.gitgui.*` 调用
- 新增 IPC 功能按 [`development-guide.md`](./docs/development-guide.md#5-添加新-ipc-功能的步骤) 六步走完：`shared/ipc-channels.ts` → `shared/types.ts` → `electron/services/*` → `electron/ipc/*` → `electron/preload.ts` → UI
- `shared/` 只放常量与类型，不放运行时逻辑
- 业务逻辑下沉到 `electron/services/`，IPC handler 只做参数校验 + 调 service + 返回 `Result<T>`

### 4.3 代码质量

- 类型标注清晰，避免 `any`；确需使用时加注释说明
- 复用既有工具：`clsx` 拼 className、`date-fns` 格式化日期、`nanoid` 生成 id、`zustand` 管理状态
- 错误处理对用户友好（中文提示），不暴露 GitHub / Gitee 的英文原始错误
- 命名遵循 [`development-guide.md`](./docs/development-guide.md#43-命名约定)：组件 PascalCase、脚本 kebab-case、IPC 通道 `domain:action`、常量 UPPER_SNAKE_CASE
- 单一职责：一个 PR 解决一个问题，不夹带无关重构

### 4.4 测试

- 当前项目无单元测试框架；改动需通过手工验证：
  - 启动应用 `npm run dev`
  - 触发相关功能（Git 操作 / 远程 API / 自动更新等）
  - 必要时跑发版端到端脚本（见 `scripts/debug/test-launch.ps1`）
- 涉及打包 / 发布流程的改动，需在本地走一遍 `npm run build` 验证

### 4.5 文档同步

改动涉及以下任一时，需在**同一 PR** 内更新文档：

- 新增 / 修改 IPC 通道 → 更新 `shared/ipc-channels.ts` 注释 + [`ARCHITECTURE.md`](./ARCHITECTURE.md) §5 + [`docs/features.md`](./docs/features.md)
- 新增 / 修改脚本 → 更新 [`ARCHITECTURE.md`](./ARCHITECTURE.md) §8 + [`docs/development-guide.md`](./docs/development-guide.md)
- 改动构建 / 发布流程 → 更新 [`docs/development-guide.md`](./docs/development-guide.md) §7 / §8
- 改动 `package.json` 依赖或版本约束 → 更新 [`ARCHITECTURE.md`](./ARCHITECTURE.md) §2 + 相应陷阱章节

---

## 5. Issue 报告模板

提交 Issue 前请先搜索是否已有相同问题。新 Issue 请选择对应模板并填写：

### 5.1 Bug 报告模板

```markdown
### Bug 标题
<一句话描述问题>

### 环境信息
- KunyaoGit 版本：vX.Y.Z（设置 → 关于 查看；或安装包文件名）
- 操作系统：Windows 10 / 11（x64）
- Git 版本：`git --version` 输出
- 是否配置了 GitHub / Gitee Token：是 / 否
- 是否为便携版：是 / 否

### 复现步骤
1. ...
2. ...
3. ...

### 期望行为
<应该发生什么>

### 实际行为
<实际发生了什么>

### 错误信息 / 截图
<粘贴控制台报错、DevTools 输出，或附截图>

### 备注
<其他线索，如网络环境、是否偶发>
```

### 5.2 功能请求模板

```markdown
### 功能标题
<一句话描述想要的特性>

### 动机
<为什么需要这个功能，解决了什么痛点>

### 期望方案
<你设想的实现方式或交互流程>

### 替代方案
<已考虑过的其他做法及为何不选>

### 备注
<参考链接、其他项目同类功能截图等>
```

### 5.3 Issue 注意事项

- **不要**在 Issue 里粘贴真实 Token / 密钥；如需调试鉴权问题，请用脱敏的占位符
- 一次性把环境信息和复现步骤写全，避免维护者反复追问
- 偶发问题请标注「偶发」并附上触发频率

---

## 6. 开发环境设置步骤

完整的首次环境配置（详见 [`docs/development-guide.md`](./docs/development-guide.md#1-开发环境准备)）：

### 6.1 系统要求

| 项 | 要求 |
| --- | --- |
| 操作系统 | Windows 10 / 11（x64）；打包依赖 NSIS + rcedit，Windows only |
| Node.js | **≥ 20** |
| Git | ≥ 2.30 且在 PATH |
| npm registry | `https://registry.npmmirror.com`（避免 `registry.npmjs.org` 超时） |

### 6.2 配置镜像并安装

```bash
# 1. 切换 npm 镜像
npm config set registry https://registry.npmmirror.com

# 2. 克隆（Fork 后用你自己的仓库地址，或直接克隆主仓库）
git clone https://github.com/buxiaju/KunyaoGit.git
cd KunyaoGit

# 3. 安装依赖
npm install
```

### 6.3 启动开发模式

```bash
npm run dev
```

- Vite 启动在 `http://localhost:5173`（端口固定，`strictPort: true`）
- `vite-plugin-electron` 自动编译主进程与 preload，主进程改动热重启
- 自动打开 DevTools

### 6.4 配置 Token（调试远程 / 自动更新功能时）

方式 A（推荐）：启动应用 → 设置 → GitHub / Gitee → 填入 PAT → 测试并保存

方式 B：直接编辑 `%APPDATA%\gitgui\gitgui-settings.json`

```json
{
  "auth": {
    "github": { "token": "github_pat_XXX" },
    "gitee":  { "token": "GITEE_TOKEN_XXX" }
  }
}
```

**Token 权限建议**：
- GitHub：`repo`、`read:user`（不需要 `admin:org`、`delete_repo`）
- Gitee：`projects`、`pull_requests`、`issues`

### 6.5 提交前自检

```bash
npm run typecheck   # 必须通过
npm run lint        # 自动修复
```

### 6.6 可选：本地打包验证

涉及打包 / 发布流程的改动，本地验证：

```powershell
$env:ELECTRON_BUILDER_NSIS_DIR = "C:\path\to\nsis"
npm run build:win
```

详见 [`docs/development-guide.md`](./docs/development-guide.md#7-打包流程)。

---

## 7. 联系方式

| 渠道 | 地址 |
| --- | --- |
| GitHub 仓库 | https://github.com/buxiaju/KunyaoGit |
| Gitee 镜像 | https://gitee.com/buxiaju/KunyaoGit |
| Issue 反馈 | https://github.com/buxiaju/KunyaoGit/issues |
| 维护者 | `buxiaju`（GitHub + Gitee 同名） |

- 优先通过 **GitHub Issue** 沟通 Bug 与功能请求
- 紧急安全相关问题（如 token 泄露）请勿在公开 Issue 讨论，可直接联系维护者

---

## 行为准则

请保持友善与耐心。审查者与贡献者都应聚焦于代码与项目本身，对事不对人。任何辱骂、人身攻击、歧视性言论都不被接受。

---

**感谢你的贡献！** 🎉 每一个 PR、每一个 Issue、每一次文档改进，都让 KunyaoGit 更好。
