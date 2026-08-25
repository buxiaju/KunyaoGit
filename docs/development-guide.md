# KunyaoGit 开发指南

> 面向接手开发者的完整开发 / 打包 / 发布手册。配套阅读：[`ARCHITECTURE.md`](../ARCHITECTURE.md)、[`features.md`](./features.md)。
> 当前版本：**v0.5.0**（v0.2.3+ 多语言、v0.2.4+ 下载提速、v0.2.5+ 三主题、v0.2.6+ 探活修复、v0.3.3+ 更新下载请求修复、v0.3.4+ 云端仓库搜索 / Gitee 搜索降级、v0.4+ 命令面板/快捷键/Stash 队列/Cherry-pick/Revert/PR 创建/底部状态栏、**v0.5+ Ctrl+P 跳转文件 / 文件历史 + Blame**）。

---

## 目录

1. [开发环境准备](#1-开发环境准备)
2. [项目结构说明](#2-项目结构说明)
3. [开发命令](#3-开发命令)
4. [代码规范](#4-代码规范)
5. [添加新 IPC 功能的步骤](#5-添加新-ipc-功能的步骤)
6. [添加新页面的步骤](#6-添加新页面的步骤)
7. [打包流程](#7-打包流程)
8. [发布流程](#8-发布流程)
9. [常见陷阱](#9-常见陷阱)
10. [★ v0.4+ 自动化测试](#10-v04-自动化测试)

---

## 1. 开发环境准备

### 1.1 系统与运行时要求

| 项 | 要求 | 说明 |
| --- | --- | --- |
| 操作系统 | Windows 10 / 11（x64） | 打包用到 NSIS + rcedit，Windows only |
| Node.js | **≥ 20** | 主进程 / Vite / electron-builder 都需要 |
| Git | ≥ 2.30 且在 PATH | 应用通过本地 `git` CLI 调用 |
| npm registry | `https://registry.npmmirror.com` | `registry.npmjs.org` 经常超时，npmmirror 始终可达 |

### 1.2 切换 npm 镜像（强烈建议）

```bash
# 设置 npmmirror 镜像，避免装包超时
npm config set registry https://registry.npmmirror.com

# 验证
npm config get registry
```

### 1.3 克隆与安装

```bash
git clone https://github.com/buxiaju/KunyaoGit.git
cd KunyaoGit
npm install
```

> 镜像仓库：`https://gitee.com/buxiaju/KunyaoGit`（国内克隆更快）。

### 1.4 开发环境可选 token 配置

开发调试远程仓库 / 自动更新功能时，在 `%APPDATA%\gitgui\gitgui-settings.json` 中写入：

```json
{
  "auth": {
    "github": { "token": "github_pat_XXX" },
    "gitee":  { "token": "GITEE_TOKEN_XXX" }
  }
}
```

或直接在应用内「设置 → GitHub / Gitee」标签填入。Token 权限建议见 [`features.md`](./features.md#82-双平台-token-管理)。

### 1.5 Node 版本检查

```bash
node -v   # 应 ≥ v20
npm -v
git --version
```

---

## 2. 项目结构说明

```
KunyaoGit/
├── electron/                # 主进程（Node.js，权限大）
│   ├── main.ts              # 入口：BrowserWindow + IPC 注册
│   ├── preload.ts           # contextBridge 暴露 window.gitgui.*
│   ├── ipc/                 # IPC 处理器（按域拆分）
│   │   ├── dialog.ts        #   文件/目录对话框
│   │   ├── fs.ts            #   文件系统读写
│   │   ├── git.ts           #   Git 操作代理
│   │   ├── github.ts        #   GitHub REST API
│   │   ├── gitee.ts         #   Gitee REST API
│   │   ├── release.ts       #   Release / Tag 管理
│   │   ├── repo.ts          #   仓库打开 / 克隆 / 初始化
│   │   ├── settings.ts      #   设置 + Token 测试
│   │   └── update.ts        #   自动更新 + 应用内下载安装
│   └── services/            # 业务服务
│       ├── git.ts           #   GitService（simple-git 封装）
│       ├── settings.ts      #   electron-store 单例
│       ├── changelog.ts      #   Conventional Commits 分类器
│       └── update.ts         #   版本检查 + 版本比较
│
├── shared/                  # 主进程 + 渲染进程共用
│   ├── ipc-channels.ts      #   IPC 通道字符串常量（防 typo）
│   └── types.ts             #   共享类型（RepoInfo / CommitInfo / ... / AppUpdateInfo / DownloadProgress）
│
├── src/                     # 渲染进程（Chromium + React，权限小）
│   ├── App.tsx              #   路由 + useUpdateCheck + 全局 UpdateDialog / Toaster
│   ├── main.tsx             #   React 入口
│   ├── global.d.ts          #   window.gitgui 类型声明
│   ├── pages/               #   路由页面
│   │   ├── HomePage.tsx
│   │   ├── RepoPage.tsx
│   │   ├── RemotePage.tsx
│   │   ├── RepoDetailPage.tsx
│   │   ├── ReleasesPage.tsx
│   │   └── SettingsPage.tsx
│   ├── components/
│   │   ├── Layout/Layout.tsx
│   │   ├── common/
│   │   │   ├── Toast.tsx
│   │   │   └── UpdateDialog.tsx
│   │   └── repo/            #   仓库相关组件
│   │       ├── BranchPanel.tsx
│   │       ├── ChangesPanel.tsx
│   │       ├── CommitHistory.tsx
│   │       ├── DiffViewer.tsx
│   │       ├── EditorPane.tsx
│   │       ├── FileTree.tsx
│   │       └── RemotePanel.tsx
│   ├── hooks/
│   │   ├── useUpdateCheck.ts   # 启动 1.5s 后静默检查
│   │   ├── useTheme.ts         # ★ v0.2.5：主题管理（同步 data-theme + 派发 kg-theme-change 事件）
│   │   ├── useShortcuts.ts     # ★ v0.4+ 全局快捷键（Ctrl+Shift+P / Ctrl+R / ?）
│   │   └── useCommandPalette.ts # ★ v0.4+ 命令面板状态（open / close / toggle）
│   ├── stores/               #   Zustand 状态
│   │   ├── repo.ts
│   │   ├── settings.ts
│   │   └── update.ts
│   ├── lib/                    # ★ v0.4+ 通用工具
│   │   └── parseRemote.ts      # ★ v0.4+ 远程 URL → owner/repo/platform
│   ├── config/                 # ★ v0.4+ 全局配置
│   │   └── commands.ts         # ★ v0.4+ 命令面板注册表
│   ├── i18n/                  # ★ v0.2.3：国际化
│   │   ├── index.tsx           #   I18nProvider / useI18n hook
│   │   ├── zh.ts               #   中文翻译字典
│   │   └── en.ts               #   英文翻译字典
│   └── styles/
│       └── index.css         #   Tailwind 入口 + ★ v0.2.5 CSS 变量主题 + 自定义组件类 + ★ v0.4 .statusbar
│
├── scripts/                  # 打包 / 发布 / 调试脚本（.cjs / .ps1 / .nsi）
├── assets/                   # 应用图标源（icon-master.png + icon.ico）
├── docs/                     # 文档（features.md / development-guide.md）
├── logs/                     # 日志归档（gitignored）
│   ├── build/                #   构建日志
│   ├── publish/              #   发布日志
│   └── debug/                #   调试日志
├── release/                 # electron-builder 产物（gitignored）
├── index.html                # Vite 渲染进程入口
├── vite.config.ts            # Vite + vite-plugin-electron 配置
├── tsconfig.json             # 根 tsconfig（paths: @ / @electron / @shared）
├── tailwind.config.js
├── postcss.config.js
├── package.json              # ★ 改版本号改这里
└── .gitignore                # 已统一忽略 logs/ / release-v*/ / *.log
```

### 目录职责约定

| 目录 | 职责 | 进程 |
| --- | --- | --- |
| `electron/` | 主进程逻辑：IPC handler + services | 主进程（Node，权限大） |
| `src/` | 渲染进程 UI：页面 / 组件 / 状态 / 钩子 | 渲染进程（Chromium，权限小） |
| `shared/` | 进程间共享的常量与类型 | 两侧共用，**不放运行时逻辑** |
| `scripts/` | 打包 / 发布 / 调试脚本 | 独立运行，不进 asar |
| `assets/` | 应用图标等入库资源 | - |
| `docs/` | 开发者文档 | - |
| `logs/` | 构建 / 发布 / 调试日志归档（gitignored） | 独立存放，不进库 |

---

## 3. 开发命令

`package.json` 中定义的脚本：

| 命令 | 等价 | 说明 |
| --- | --- | --- |
| `npm run dev` | `vite` | 启动开发模式（HMR + 自动 build electron 主进程 / preload） |
| `npm run build` | `tsc -b && vite build && electron-builder` | 类型检查 + 渲染打包 + electron-builder 出包 |
| `npm run build:win` | `tsc -b && vite build && electron-builder --win` | 仅 Windows 平台打包 |
| `npm run typecheck` | `tsc -b --noEmit` | 仅类型检查，不产出 |
| `npm run lint` | `eslint . --ext .ts,.tsx --fix` | ESLint 检查并自动修复（**注：v0.4 暂未安装依赖**） |
| `npm run preview` | `vite preview` | 预览构建产物 |
| `npm test` | `vitest run` | ★ v0.4+ 跑全部测试（一次性，跑完即退出） |
| `npm run test:watch` | `vitest` | ★ v0.4+ 监听模式（开发时反复跑） |
| `npm run test:ui` | `vitest --ui` | ★ v0.4+ 启动 Vitest 浏览器 UI（需 `@vitest/ui`） |

### 3.1 开发模式

```bash
npm run dev
```

- Vite 启动在 `http://localhost:5173`（`strictPort: true`，端口固定）
- `vite-plugin-electron` 同时编译 `electron/main.ts` → `dist-electron/main.js`、`electron/preload.ts` → `dist-electron/preload.js`
- 主进程通过 `VITE_DEV_SERVER_URL` 加载渲染层，自动打开 DevTools
- React HMR + 主进程改动热重启

### 3.2 类型检查

```bash
npm run typecheck   # tsc -b --noEmit，CI 前必跑
```

### 3.3 生产构建

```bash
npm run build       # 完整：tsc -b && vite build && electron-builder
# 或仅前端：
npx tsc -b
npx vite build
```

---

## 4. 代码规范

### 4.1 TypeScript 严格模式

`tsconfig.json` 关键配置：

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,                         // ★ 严格模式全开
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": false,                // 允许未使用局部变量
    "noUnusedParameters": false,            // 允许未使用参数
    "jsx": "react-jsx",
    "isolatedModules": true,
    "noEmit": true,                         // 类型检查不 emit，由 vite 产出
    "paths": {
      "@/*": ["src/*"],
      "@electron/*": ["electron/*"],
      "@shared/*": ["shared/*"]
    }
  }
}
```

- **严格模式全开**（`strict: true`）：禁用隐式 any、严格 null 检查等
- 路径别名：`@` → `src`，`@electron` → `electron`，`@shared` → `shared`
- `tsconfig.json` 的 `include` 同时覆盖 `src/`、`electron/`、`shared/`、`vite.config.ts`

### 4.2 ESLint

```bash
npm run lint   # eslint . --ext .ts,.tsx --fix
```

涵盖 `.ts` / `.tsx`，自动修复可修复的问题。

### 4.3 命名约定

| 对象 | 约定 | 示例 |
| --- | --- | --- |
| 文件 / 组件 | PascalCase（React 组件） | `BranchPanel.tsx`、`UpdateDialog.tsx` |
| 脚本 | kebab-case + 后缀 | `build-unpacked.cjs`、`update-gitee-body.cjs` |
| IPC 通道 | `domain:action` kebab-case | `git:status`、`update:download` |
| IPC 通道常量 | UPPER_SNAKE_CASE | `GIT_STATUS`、`UPDATE_DOWNLOAD` |
| 类型 / 接口 | PascalCase | `RepoInfo`、`DownloadProgress` |
| Store | camelCase + `use` 前缀 | `useUpdateStore`、`useSettingsStore` |
| Zustand store 文件 | kebab-case | `src/stores/update.ts` |

### 4.4 目录职责

- `shared/` **只放**常量与类型，不放运行时逻辑
- `electron/ipc/` 只做参数校验 + 调 service + 返回 `Result<T>`，业务逻辑下沉到 `electron/services/`
- `src/stores/` 用 Zustand，避免 prop drilling
- 远程请求缺失 token 时在 IPC handler 提前拦截并返回中文友好错误

### 4.5 IPC 返回统一类型

```ts
// shared/types.ts
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
```

所有可能失败的 IPC 调用统一返回 `Result<T>`，渲染层判断 `ok` 字段。

---

## 5. 添加新 IPC 功能的步骤

以"导出 patch"为例，必须按顺序走完六步（流程见 `ARCHITECTURE.md` §10.1）：

1. **`shared/ipc-channels.ts`** 加通道常量：

   ```ts
   export const IPC = {
     // ...
     GIT_EXPORT_PATCH: 'git:export-patch',
   } as const;
   ```

2. **`shared/types.ts`** 加 payload 类型 / 返回类型：

   ```ts
   export interface ExportPatchResult { filePath: string; }
   ```

3. **`electron/services/git.ts`** 加方法（或新建 service）：

   ```ts
   async exportPatch(ref: string): Promise<ExportPatchResult> { /* ... */ }
   ```

4. **`electron/ipc/git.ts`** 注册 handler：

   ```ts
   ipcMain.handle(IPC.GIT_EXPORT_PATCH, async (_e, ref: string) => {
     try {
       const data = await gitService.exportPatch(ref);
       return { ok: true, data };
     } catch (e) {
       return { ok: false, error: (e as Error).message };
     }
   });
   ```

5. **`electron/preload.ts`** 在 `git:` 块下暴露方法：

   ```ts
   git: {
     // ...
     exportPatch: (ref: string) => ipcRenderer.invoke(IPC.GIT_EXPORT_PATCH, ref),
   }
   ```

6. **UI 调用**：

   ```ts
   const r = await window.gitgui.git.exportPatch('HEAD~1');
   if (!r.ok) { /* 错误处理 */ }
   ```

> `electron/main.ts` 不需要单独改 —— handler 已经在 `registerGitHandlers()` 里注册。新增域才需要在 `main.ts` 调用新的 `registerXxxHandlers()`。

> **v0.3.4 实例参考**：以上六步可对照「云端仓库搜索」`gh:search-repos` / `gt:search-repos` 落地：
> - 通道常量：`shared/ipc-channels.ts`（`GH_SEARCH_REPOS` / `GT_SEARCH_REPOS`）
> - 主进程 handler：`electron/ipc/github.ts`（GitHub）与 `electron/ipc/gitee.ts`（Gitee，含搜索降级，见 §9.16）
> - preload 暴露：`gitgui.github.searchRepos` / `gitgui.gitee.searchRepos`
> - 渲染层调用：`src/pages/RemotePage.tsx`（按平台分发）

---

## 6. 添加新页面的步骤

1. 新建页面组件 `src/pages/XxxPage.tsx`。
2. 在 `src/App.tsx` 加路由：

   ```tsx
   <Route path="xxx" element={<XxxPage />} />
   ```

3. 在 `src/components/Layout/Layout.tsx` 的 `NAV` 数组加一项（侧边栏导航）：

   ```ts
   const NAV = [
     // ...
     { to: '/xxx', label: 'Xxx', icon: SomeIcon },
   ];
   ```

---

## 7. 打包流程

> v0.2.2 起回归 `electron-builder` 出包，产物输出到 `release/`（由 `package.json` 的 `build.directories.output` 配置）。

### 7.1 完整打包命令

```bash
# 1. 类型检查 + 渲染打包 + electron-builder 出 NSIS 包
npm run build
# 或仅 Windows：
npm run build:win
```

`package.json` 中 `build` 配置摘要：

```jsonc
{
  "build": {
    "appId": "com.kunyao.kunyaogit",
    "productName": "KunyaoGit",
    "directories": { "output": "release" },   // electron-builder 默认输出目录
    "files": ["dist/**/*", "dist-electron/**/*"],
    "icon": "assets/icon.ico",
    "win": {
      "target": [{ "target": "nsis", "arch": ["x64"] }],
      "artifactName": "${productName}-Setup-${version}-${arch}.${ext}"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true,
      "shortcutName": "KunyaoGit",
      "perMachine": false,
      "allowElevation": true,
      "deleteAppDataOnUninstall": true
    }
  }
}
```

### 7.2 使用 ELECTRON_BUILDER_NSIS_DIR 复用本地 NSIS

通过环境变量 `ELECTRON_BUILDER_NSIS_DIR` 指定 NSIS 编译器目录，让 electron-builder 复用本地 NSIS 工具链：

```powershell
# 指定本地 NSIS 编译器目录（避免 electron-builder 从网络下载 nsis-resources）
$env:ELECTRON_BUILDER_NSIS_DIR = "C:\A\03Projects\MiniMax\GitGUI\tools\nsis\nsis-3.11"

# 标准构建（产物输出到 release/，由 package.json 的 build.directories.output 配置）
npm run build:win
```

> 如需本地覆盖输出目录等配置，可创建 `.build-config.json`（已 gitignore），用 `npx electron-builder --win --config .build-config.json` 运行。

### 7.2.1 避开 win-unpacked 文件锁

若 `release/win-unpacked/resources/default_app.asar` 被 IDE 文件监视器或 KunyaoGit 残留进程锁住，构建会卡 `ECONNRESET` / `EBUSY`。**临时把 output 目录改到新路径**是最稳的绕法：

```jsonc
// package.json
"build": {
  "directories": {
    "output": "release-v026"   // 临时改这里（记得发完改回 "release"）
  }
}
```

```bash
npm run build:win
# 产物在 release-v026/KunyaoGit-Setup-X.Y.Z-x64.exe
# 拷过去 + 把 .gitignore 加上 release-v026/（每个版本号都加一次）+ commit
```

发完版后改回 `"output": "release"`，并把 `release-vXXX/` 整目录删掉（已 gitignored，删不动的话用 `scripts/debug/force-clean-skip.cjs`）。

### 7.3 产物

| 路径 | 说明 |
| --- | --- |
| `release/win-unpacked/` | 解包目录（中间产物，含 `locales/`、`*.pak`、`LICENSES.chromium.html` 等） |
| `release/KunyaoGit-Setup-0.2.3-x64.exe` | 最终 NSIS 安装包（推荐分发） |
| `release/KunyaoGit-Setup-0.2.3-x64.exe.blockmap` | 增量更新用 blockmap |
| `release/builder-debug.yml` | electron-builder 调试信息 |

### 7.4 便携版（可选）

```bash
node scripts/build/package-portable.cjs
```

- 产出 `release/KunyaoGit-portable-vX.Y.Z.zip`（~3.5 MB，仅源码 + Electron 入口）
- 便携版不含 Electron runtime，需用户机器已装 Node.js（实际面向开发者）

### 7.5 图标更新

换图标时重跑：

```bash
node scripts/build/build-icon.cjs assets\icon-master.png assets\icon.ico
npm run build
```

`build-icon.cjs` 用 `sharp` 缩放到 6 个尺寸（16/32/48/64/128/256）→ `png-to-ico` 打包成 `.ico`。

---

## 8. 发布流程

> 完整发版九步：改版本号 → 构建 → 复制到 `.release-assets/` → `publish-v023.cjs` → `update-gitee-body.cjs` → `git push`。
> 发布脚本统一复用模板，**不再另存为 `publish-vXXX.cjs`**：`scripts/publish/publish-v023.cjs`（创建/更新 GitHub Release + 上传安装包）与 `scripts/publish/update-gitee-body.cjs`（创建/更新 Gitee Release + 上传附件），每次发版只需更新两个脚本顶部的 `RELEASE_BODY`。

### 8.1 改版本号

编辑 `package.json`：

```jsonc
{ "version": "0.3.4" }   // ← 改这里
```

### 8.2 构建

```bash
cd C:\A\03Projects\MiniMax\GitGUI
npx tsc -b
npx vite build
$env:ELECTRON_BUILDER_NSIS_DIR = "C:\A\03Projects\MiniMax\GitGUI\tools\nsis\nsis-3.11"
npm run build:win
node scripts/build/package-portable.cjs
```

> 每次发版把构建输出目录临时指到新的 `release-vNNN`（如 v0.3.4 → `release-v031`，改法见 §7.2.1），并把 `release-vNNN/` 加进 `.gitignore`，发完清理删除。

产出：
- `release-v031/KunyaoGit-Setup-0.3.4-x64.exe`
- `release-v031/KunyaoGit-portable-v0.3.4.zip`

### 8.3 复制到 `.release-assets/`（Gitee 走 git 分发）

```powershell
copy /Y release-v031\KunyaoGit-Setup-0.3.4-x64.exe .release-assets\
copy /Y release-v031\KunyaoGit-portable-v0.3.4.zip .release-assets\
```

> `.release-assets/` 入库（`.gitignore` 已放行 `!.release-assets/*.exe` / `*.zip`），应用内自动更新的 Gitee 源就是 `https://gitee.com/buxiaju/KunyaoGit/raw/master/.release-assets/KunyaoGit-Setup-X.Y.Z-x64.exe`。

### 8.4 上传 GitHub Release

```bash
# 准备 token（优先环境变量；未设时脚本会从 git remote 'github' URL 提取 PAT）
set GH_TOKEN=github_pat_XXX

# 直接复用模板脚本，不要另存为 publish-vXXX.cjs：
# 只需更新脚本顶部的 RELEASE_BODY（本次发版说明）后运行
node scripts/publish/publish-v026.cjs
```

`publish-v026.cjs` 逻辑（模板，直接复用）：
1. `GET /repos/{owner}/{repo}/releases/tags/vX.Y.Z`：已存在则复用，404 则创建
2. `PATCH` 更新 release body
3. **流式上传** `KunyaoGit-Setup-X.Y.Z-x64.exe` 与 `KunyaoGit-portable-vX.Y.Z.zip`（`fs.createReadStream().pipe()`，避免大文件一次性读入内存；已存在则跳过）
4. 全程日志写入 `logs/publish/publish-log.txt`（带 ISO 时间戳）

已有 release 仅替换安装包：

```bash
node scripts/build/replace-installer.cjs    # 删旧 + 上传新
node scripts/publish/upload-installer.cjs     # 更新 body + 跳过已存在 asset
```

### 8.5 更新 Gitee Release 描述 + 上传安装包

```bash
node scripts/publish/update-gitee-body.cjs    # 同步 Gitee Release body + 流式上传安装包 attach file
```

> v0.2.3 起 `update-gitee-body.cjs` 集成了安装包上传（multipart 流式），并优先读 `process.env.GT_TOKEN`，fallback 为脚本内硬编码值。全程日志写入 `logs/publish/publish-log.txt`。

### 8.6 提交 + push

```bash
git add package.json
git commit -m "release: v0.3.8"
git push gitee master
git push github master
```

### 8.7 端到端测试

```powershell
# 静默安装
start /wait release-v031\KunyaoGit-Setup-0.3.4-x64.exe /S /D=C:\A\test\kg

# 启动 5s 后 kill
& "C:\A\test\kg\KunyaoGit.exe"
timeout /t 5 /nobreak
taskkill /IM KunyaoGit.exe /F

# 静默卸载
& "C:\A\test\kg\Uninstall.exe" /S
```

调试脚本（可选）：

| 脚本 | 用途 |
| --- | --- |
| `scripts/debug/test-update.cjs` | 直接打 GitHub + Gitee release API |
| `scripts/debug/test-gitee.cjs` | 列 Gitee release |
| `scripts/debug/test-launch.ps1` / `test-launch-v2.ps1` | 静默 install + 启动 5s + 卸载 |
| `scripts/publish/list-assets.cjs` | 列出指定 GitHub release 的 asset |

---

## 9. 常见陷阱

### 9.1 `electron-store` 必须是 v8.x

`electron-store` v10+ 是 ESM-only（`"type": "module"`），与 CommonJS 主进程不兼容。装新版会得到：

```
SyntaxError: Cannot use import statement outside a module
```

已在 `package.json` 锁到 `^8.2.0`。**升级时不要放开版本约束**。`vite.config.ts` 也已 `rollupOptions.external: ['electron-store']`。

### 9.2 NSIS 符号链接需开发者模式

electron-builder 在 Windows 上用 NSIS 编译安装包，部分操作（如符号链接、per-machine 安装）需要 Windows 开启「开发者模式」：

> 设置 → 更新和安全 → 开发者选项 → 开发人员模式 = 开

否则可能在 `assistedInstaller.nsh` / 多用户安装模式上报权限错误。

### 9.3 `default_app.asar` 文件锁

若上一次 `electron-builder` 或测试启动（`spawn(kunyaogit.exe)`）残留进程，会锁住 `release/win-unpacked/resources/default_app.asar`，导致下次打包 / 删除失败。

修法（PowerShell）：

```powershell
Get-Process kunyaogit,electron,node -ErrorAction SilentlyContinue | Stop-Process -Force
```

仍卡的话用 `scripts/debug/reset-stage.ps1` 强清，或重启。调试文件锁用 `scripts/debug/check-handle.ps1`，看文件头用 `scripts/debug/check-hex.ps1`。

### 9.4 GitHub 网络超时

- `app-builder-bin`（electron-builder 子进程，Go 写）从 `github.com` 下载 `electron-vXX-win32-x64.zip` 与 `nsis-resources-*.7z`，**`ELECTRON_MIRROR` 环境变量对它无效**
- 表现：打包卡在 `⩇ downloading Electron` / `⩇ unpacking nsis-resources`
- 修法：
  1. 用 `ELECTRON_BUILDER_NSIS_DIR` 指向本地 NSIS（§7.2），跳过 nsis-resources 下载
  2. 设置 Electron 镜像：`set ELECTRON_MIRROR=https://registry.npmmirror.com/-/binary/electron`（对 Electron 二进制本体有效）
  3. 多试几次（github 443 间歇超时）
  4. 极端情况用代理：`set HTTPS_PROXY=http://127.0.0.1:7890`

### 9.5 Gitee 100MB 限制

Gitee 单文件 100 MB 上限。NSIS 安装包 > 100 MB 时 push 会被拒（`exceeds quota 100MB`）。对策：

1. 重新评估 LZMA 压缩等级（electron-builder 默认 `SetCompressorDictSize 64` + 整包 LZMA）
2. 改用便携版分发（zip 才几 MB）
3. 上 Gitee 用 git 分发（`.release-assets/`），不走 Gitee Release 附件上传

历史上某个 blob > 100 MB 时：`git filter-branch` 删旧文件 + 重新提交。

### 9.6 Gitee 匿名 API 返 404

`https://gitee.com/api/v5/repos/{owner}/{repo}/releases/latest` 对匿名请求返回 404。**自动更新检查的 Gitee 端必须配 token**（设置 → Gitee）。

- 普通用户：只查 GitHub 一边也够用
- 高级用户：配 Gitee token 后两边都查，取版本最高的

### 9.7 `GT_TOKEN` 硬编码 fallback

v0.2.3 起 `update-gitee-body.cjs` 已改为优先读 `process.env.GT_TOKEN`，仅在未设环境变量时 fallback 到脚本内硬编码值：

```js
const GT_TOKEN = process.env.GT_TOKEN || 'a0d56558...';   // fallback
```

发版时建议临时 `set GT_TOKEN=xxx` 覆盖 fallback 值，避免令牌泄露到仓库。

### 9.8 `rcedit` v5 是 ESM-only（仅手工打包流程涉及）

回归 electron-builder 后通常不再手动调 `rcedit`。但若沿用早期手工脚本 `scripts/build/build-unpacked.cjs`，注意：

```js
// ❌ 会爆
const rcedit = require('rcedit');
rcedit(path, opts);

// ✅ 用 dynamic import
const { rcedit } = await import('rcedit');
await rcedit(path, opts);
```

### 9.9 Tailwind 颜色

`primary-400`、`primary-500` 等需要在 `tailwind.config.js` 配 `theme.extend.colors.primary`。当前 `src/styles/index.css` 的 `@layer components` 硬塞了 `.btn-primary`、`.panel`、`.input`、`.tab` 等组件类，改样式优先改这里。

### 9.10 GitHub 100MB push 警告（可无视）

`.release-assets/*.exe` > 50 MB，`git push` 时 GitHub 会 warning 但不阻断——文件确实进 git 历史了。**不要**上 Git LFS（增加复杂度且无必要）。

### 9.11 IPC handler 重复注册

`app:get-version` 等 handler 若在多个文件 `ipcMain.handle`，启动时抛 `Attempted to register a second handler` 并阻断 `createWindow()`（v0.2.0 曾因此无法启动，v0.2.1 修复）。新加 handler 前确认没有在别处注册过同名通道。

### 9.12 重装后必装的本地工具依赖

如果手工打包流程用到，重装 `node_modules` 后必跑：

```bash
npm i -D png-to-ico sharp rcedit @electron/asar
```

（后两个会作为 electron-builder 传递依赖自动装，前两个需手动。）

### 9.13 ★ v0.2.6+：更新器探活别用 HEAD

`electron/ipc/update.ts` 的 `probeRange()` 必须用 `Range: bytes=0-0` GET，**不要**改回 HEAD。

- 原因：部分 CDN/防火墙对 HEAD 更敏感（直接 403 / 超时），导致 `github: HEAD 失败` 误导性错误
- 当前实现：先用 GET 拿 1 字节，206 响应里 `Content-Range` 直接给到 total；200 响应里 `Content-Length` 是 total
- 拿到 header 后立即 `res.destroy()`，避免 200 情况把整文件拉下来
- 改探活时务必同时更新 `error` 汇总（`failedSources`）和 15s 超时

### 9.14 ★ v0.2.4+：下载器的多连接并发

`downloadByRange()` 默认 4 路并发。改这个数字时考虑：

- 用户网络/磁盘吞吐（家用 100M 宽带 4 路正好）
- `keepAliveHttpsAgent.maxSockets = CHUNK_COUNT + 2` 要同步
- `CHUNK_RETRY = 3` 重试次数对每 chunk 独立
- `RANGE_TIMEOUT_MS = 30000` 是单 chunk 超时

误改可能导致「4 路慢、1 路反而快」或「chunk 失败风暴」，上线前一定用 `scripts/debug/test-download-speed.cjs` 验证。

### 9.15 ★ v0.3.3+：`https.request` 必须 `req.end()`

`electron/ipc/update.ts` 的 `requestFollow()` 曾遗漏 `req.end()`，导致应用内更新的下载请求从未真正发出，必报「所有下载源都失败」（v0.3.3 修复）。用 `https.request` 发请求后必须显式调用 `req.end()` 才会真正发送——只有 `https.get` 才自动 end。

### 9.16 ★ v0.3.4+：Gitee 官方仓库搜索 API 已失效

`https://gitee.com/api/v5/search/repositories` 恒返回空数组（但 `/search/users` 正常）。`electron/ipc/gitee.ts` 的 `GT_SEARCH_REPOS` 做了降级：拿到空结果时改拉 `/user/repos`，在本地按名称 / 描述过滤（v0.3.4）。

### 9.17 TLSSocket 不触发 `connect` 事件

HTTPS 连接阶段的计时不要只监听 `connect`——`tls.TLSSocket` 不触发 `connect`。需同时监听 `connect` 与 `secureConnect`，以 `secureConnect` 作为连接完成的标志（见 `electron/ipc/update.ts` 连接计时的注释）。

---

## 10. ★ v0.4+ 自动化测试

> 目标：纯函数 / 业务逻辑 / 组件交互都能在 CI 上无环境依赖地跑过。**所有测试都用 mock 隔离外部依赖**，不需要真实 git 仓库 / GitHub Token。

### 10.1 测试栈

| 工具 | 用途 |
| --- | --- |
| **Vitest 4.x** | 测试运行器（与 Vite 共用 ESM/TS 配置，启动 < 1s） |
| **happy-dom 20.x** | 浏览器环境（比 jsdom 更轻量，TypeScript 类型内置） |
| **@testing-library/react 16.x** | React 组件渲染 + 事件模拟 + 异步断言 |
| **@testing-library/dom 10.x** | DOM 查询原语（被上面 transitive 依赖，显式锁版本） |

依赖装在 `devDependencies`，`package.json` 已固化。

### 10.2 目录结构

```
tests/
├── setup.ts                 # 每次测试自动重置 window.gitgui mock
├── stubs/
│   └── electron-store.ts    # electron-store 的内存版 stub（路径别名替换）
└── unit/                    # 所有测试文件
    ├── parseRemote.test.ts        # 远程 URL 解析（22 例）
    ├── parseUnifiedDiff.test.ts   # diff 解析（11 例）
    ├── gitService.test.ts         # GitService mock（35 例）
    ├── i18n.test.ts               # i18n 完整性 + t() 插值（27 例）
    ├── commands.test.ts           # 命令面板注册表 + 过滤（20 例）
    ├── StatusBar.test.tsx         # 底部状态栏组件（21 例）
    ├── CommandPalette.test.tsx    # 命令面板交互（28 例）
    ├── useShortcuts.test.tsx      # 全局快捷键 hook（14 例）
    ├── StashList.test.tsx         # Stash 队列面板（18 例）
    └── CreatePRDialog.test.tsx    # PR/MR 创建弹窗（22 例）
```

合计 **218 例**，10 个测试文件，跑完约 3 秒。

### 10.3 跑测试

```bash
# 全部测试
npm test

# 监听模式（推荐开发时）
npm run test:watch

# 跑单个文件
npx.cmd vitest run tests/unit/parseRemote.test.ts

# 跑名字匹配
npx.cmd vitest run -t "i18n"

# 启动浏览器 UI（需先 npm i -D @vitest/ui）
npm run test:ui
```

> **PowerShell 下的 vitest 退出码陷阱**：Node 22+ 对 `package.json` 缺 `"type"` 字段会打 MODULE_TYPELESS_PACKAGE_JSON 警告，PowerShell 把 stderr 计入 exit code，**`npm test` 会报 exit 1 但测试全部通过**。判断成败看输出最后两行 `Test Files N passed` / `Tests N passed`。
>
> 不要给 `package.json` 加 `"type": "module"`——主进程是 CJS，会炸。

### 10.4 配置文件 `vitest.config.ts`

**不复用 `vite.config.ts`**，独立出一个，原因写在文件顶部注释里：

> `vite.config.ts` 里的 `vite-plugin-electron/simple` 会把 `node:path` 等内置模块重写为 `.vite-electron-renderer/path.mjs` shim，shim 内部用 CJS `require`，在 Vitest 的 ESM 环境下抛 `ReferenceError: require is not defined in ES module scope`。
>
> 测试不需要 Electron 打包链路，所以这里只保留 `react` 插件 + 路径别名（含 `electron-store` → stub）。

```ts
// vitest.config.ts 关键片段
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@electron': path.resolve(__dirname, './electron'),
      '@shared': path.resolve(__dirname, './shared'),
      'electron-store': path.resolve(__dirname, './tests/stubs/electron-store.ts'),
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    globals: true,                              // describe/it/expect/beforeEach 直接可用
    setupFiles: ['./tests/setup.ts'],
  },
});
```

### 10.5 全局 Mock：`tests/setup.ts`

`window.gitgui` 在每个测试前会被 `createGitguiMock()` 重新填充一次（清空旧 spy）。所有方法默认 `mockResolvedValue(ok(默认值))`，测试里可以 `mockResolvedValue` / `mockReturnValue` 覆盖。

```ts
// 用法：覆盖特定方法的返回值
import { beforeEach, vi } from 'vitest';

beforeEach(() => {
  (window.gitgui.github.getDefaultBranch as any).mockResolvedValue({ ok: true, data: 'main' });
  (window.gitgui.git.stashList as any).mockResolvedValue({ ok: true, data: [...fakeEntries] });
});
```

#### ⚠️ 常见踩坑

1. **`window.gitgui.git.refreshStatus` 不存在**——`refreshStatus` 是 store 方法（`useRepoStore.getState().refreshStatus`），不是 IPC 方法。组件测试里如果用 `useRepoStore.setState` 预设数据，store action 不需要 mock。
2. **`window.confirm` 在 happy-dom 下不存在**——需要 `vi.stubGlobal('confirm', vi.fn(() => true))`，用 `vi.spyOn(window, 'confirm')` 会报 "can only spy on a function"。
3. **命令面板 `c.run()` 是 `Promise.resolve().then()` 异步执行**——断言前必须 `await act(async () => { await Promise.resolve(); })` 冲刷微任务。
4. **`<label>` 没写 `htmlFor`**——`getByLabelText` 在大多数组件里取不到，要用 `getByPlaceholderText` / `getByTitle` / `within(...).querySelector` 替代。
5. **`RemoteInfo` 类型是 `{name, url, type}`**——不是 `{name, refs:{fetch,push}}`，写测试数据时按 `url` 字段填。

### 10.6 写测试的最小示例

```tsx
// tests/unit/StatusBar.test.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import StatusBar from '../../src/components/common/StatusBar';
import { I18nProvider } from '../../src/i18n';
import { useRepoStore } from '../../src/stores/repo';

describe('StatusBar', () => {
  beforeEach(() => {
    useRepoStore.setState({ current: null, status: [], branches: [], log: [], remotes: [] });
  });

  it('无仓库时显示未打开仓库', () => {
    render(
      <I18nProvider lang="zh" setLang={() => {}}>
        <StatusBar />
      </I18nProvider>
    );
    expect(screen.getByText('未打开仓库')).toBeTruthy();
  });
});
```

### 10.7 覆盖的回归点（v0.3.7 → v0.4）

| Bug | 触发场景 | 测试位置 |
| --- | --- | --- |
| `status()` 误判部分暂存 | `index=M workdir=M` 应产生 2 条记录 | `gitService.test.ts` status 段 |
| `status()` 缺 `conflicted` 字段 | mock 不全会 `for...of undefined` 抛错 | `gitService.test.ts` 多个用例 |
| i18n 中英 key 数量不一致 | 新增 zh 但漏 en（或反之） | `i18n.test.ts` 完整性段 |
| i18n 占位符 `{name}` 缺失 | 某语言翻译没填占位符，运行时返回原始 key | `i18n.test.ts` 占位符段 |
| 命令 id 重复 / 分类无效 | 命令面板注册表脏数据 | `commands.test.ts` 必填字段段 |
| 远端 URL 含 user:pass 解析失败 | 注入 token 后的 https URL | `parseRemote.test.ts` 凭据段 |

### 10.8 当前未覆盖（v0.5 候选）

| 缺失 | 原因 / 建议 |
| --- | --- |
| 主进程 IPC handler 端到端 | 需启动 Electron + 真实 git 仓库，建议用 Playwright + spectron 替代 |
| StashList 的 hover 工具条 / diff 弹窗关闭按钮 | 已有 diff 调用和 pop / drop 测试；浮层关闭是次要 UI 行为 |
| 主题切换时的 CSS 变量切换 | 需要 visual regression（如 Percy / Chromatic），成本高 |
| 国际化文案语义正确性 | 只能靠人工 review |
| ESLint 集成 | `npm run lint` 依赖未装（v0.4 不阻塞，详见 §9） |

---

| 用途 | 路径 |
| --- | --- |
| 用户数据 / 设置 | `%APPDATA%\gitgui\gitgui-settings.json` |
| 最近仓库 | 同上，`recentRepos` 字段 |
| 忽略的更新版本 | 同上，`updateDismissedVersion` 字段 |
| 上次自动检查时间 | 同上，`updateLastCheck` 字段 |
| electron-builder 产物 | `release/` |
| 便携版产物 | `release/KunyaoGit-portable-vX.Y.Z.zip` |
| 入库安装包 | `.release-assets/` |
| 本地 NSIS 工具链 | `tools/nsis/nsis-3.11/`（gitignored） |
| Vite 开发端口 | `http://localhost:5173`（strictPort） |

---

**说明**：本文档与 `package.json`、`vite.config.ts`、`tsconfig.json`、`scripts/` 同源。改任何构建 / 发布流程，请同步本文档与 [`ARCHITECTURE.md`](../ARCHITECTURE.md)。
