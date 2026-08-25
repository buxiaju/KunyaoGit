# KunyaoGit 架构与维护手册

> 面向后续接手者（含 AI Agent）的完整项目指南。
> 读完这份文档，你应该知道：项目长什么样、每条命令在干什么、改东西该动哪里、发布一个新版本要跑哪些脚本、哪里有坑。

---

## 目录

1. [项目速览](#1-项目速览)
2. [技术栈与版本](#2-技术栈与版本)
3. [目录结构](#3-目录结构)
4. [三进程架构（Electron 必懂）](#4-三进程架构electron-必懂)
5. [IPC 通道清单](#5-ipc-通道清单)
6. [关键流程图](#6-关键流程图)
7. [构建管线（重点中的重点）](#7-构建管线重点中的重点)
8. [脚本逐个说明](#8-脚本逐个说明)
9. [发布流程](#9-发布流程)
10. [常见改动场景](#10-常见改动场景)
11. [坑与陷阱](#11-坑与陷阱)
12. [环境 / 凭据 / 网络](#12-环境--凭据--网络)
13. [术语表](#13-术语表)

---

## 1. 项目速览

**KunyaoGit** 是一款基于 **Electron 33 + React 18 + TypeScript 5** 的 Git 桌面客户端，深度集成 **GitHub** 和 **Gitee** 双平台。

| 维度 | 数值 |
| --- | --- |
| 当前版本 | `0.5.0`（见 `package.json`） |
| 维护者 | `buxiaju`（GitHub + Gitee 同名） |
| 主仓库 | https://github.com/buxiaju/KunyaoGit |
| 镜像 | https://gitee.com/buxiaju/KunyaoGit |
| Release | GitHub 与 Gitee 双平台同步发布（v0.1.0 ~ v0.3.8） |
| 平台目标 | Windows 10/11 x64（macOS / Linux 暂未验证） |
| 包大小 | NSIS 安装包 ~86 MB，便携版 ~3.5 MB |
| License | MIT |

**核心能力**：
- 本地 Git 全套操作（status / log / stage / commit / push / pull / fetch / branch / merge / stash / reset / 冲突解决）
- **★ v0.4+ Stash 队列管理**（stashList / stashShow / stashApply / stashDrop；apply 保留在队列 / pop 移除 / 弹窗 diff 预览）
- **★ v0.4+ Cherry-pick / Revert**（提交历史 hover 工具条，apply 任意 commit / 回退 commit，冲突复用现有解决流程）
- **★ v0.4+ PR / MR 创建**（GitHub + Gitee 双平台；自动解析 remote URL 推断 owner/repo；自动拉默认分支作为 base；当前分支 ahead>0 时一键创建）
- **★ v0.4+ 命令面板**（Ctrl/Cmd+Shift+P 全局命令入口，15+ 命令分类覆盖 Git / 导航 / 视图 / 设置）
- **★ v0.5+ Ctrl+P 跳转文件**（复用命令面板组件，VS Code 式模糊搜索 + 匹配高亮，git ls-files --others --exclude-standard 上限 5000 文件）
- **★ v0.5+ 文件历史 + Blame**（编辑器顶部「历史」按钮打开 FileHistoryPanel 侧边抽屉，commit 列表 + 点开展开 diff；点击 Monaco 行号 gutter 触发 blame 提示浮窗，git blame --line-porcelain 解析为 BlameLine[]）
- **★ v0.4+ 全局快捷键**（Ctrl+R 刷新、? 速查表、1-5 切 tab、输入框内自动让位）
- **★ v0.4+ 底部状态栏**（仓库 / 分支 / 同步状态 / 暂存计数 / 应用版本，三段式 VS Code / GitKraken 风格）
- **本地文件管理**（文件树：新建文件 / 新建文件夹 / 重命名 / 删除，右键菜单 + 工具栏；操作后自动刷新 git status）
- **多 remote 推送**（Push 下拉可选择推送到指定 remote，如 GitHub / Gitee；「提交并推送」同样支持选择 remote）
- GitHub + Gitee 双平台 REST API（Octokit + axios）
- 远程仓库 Contents API（在线浏览 / 编辑 / 新建 / 删除文件）
- Monaco Editor（VS Code 同款）做代码编辑
- 拖拽上传本地文件 / 文件夹到远程仓库
- 仓库创建 / 删除
- Tag + Release 管理（GitHub / Gitee），含 Conventional Commits 自动生成 CHANGELOG
- **自动更新检查**（GitHub + Gitee 双源，启动后 1.5s 静默）
- **★ 应用内自动更新**（v0.2.2 多源下载 Gitee 优先 / GitHub 兜底 + 实时进度条 + 下载完成自动启动安装包；v0.2.4 4 路 Range 并发提速 3~6 倍 + 实时速率；v0.2.6 探活改 GET 兼容部分 CDN；**v0.3.1 Gitee 源改走 Release 附件下载 + 连接阶段超时；v0.3.3 修复 req.end() 缺失（请求从未发送的致命 bug）+ 探活/下载多级重试容错**）
- **首页仓库入口**（v0.3.0：打开/克隆仓库后自动进入仓库页；首页「当前已打开仓库」入口卡片；侧边栏仓库卡片可点击）
- **文件树默认折叠**（v0.3.2：进入文件页所有目录默认收起，点击箭头展开）
- **云端仓库搜索**（v0.3.4：GitHub/Gitee 仓库页顶部栏搜索框；GitHub 官方 Search API 全平台搜索，Gitee API 失效降级为本地过滤）
- **多语言切换**（v0.2.3：中文 / English，React Context + useI18n hook，设置页或侧边栏一键切换）
- **三主题切换**（v0.2.5：暗色 / 深蓝 / 亮色，CSS 变量 + 选择器覆盖实现，零业务代码迁移）
- **专属应用图标**（Jade 绿 + K + Git 分支节点）

---

## 2. 技术栈与版本

### 运行时

| 包 | 版本 | 用途 |
| --- | --- | --- |
| `electron` | ^33.3.0 | 主进程 + 渲染进程壳 |
| `react` / `react-dom` | ^18.3.1 | UI 框架 |
| `react-router-dom` | ^7.1.1 | 路由（Home / Repo / Remote / Release / Settings） |
| `react-hotkeys-hook` | ^5.3.3 | **v0.4+** 全局快捷键 / 命令面板按键处理 |
| `zustand` | ^5.0.2 | 状态管理（settings / repo 两个 store） |
| `simple-git` | ^3.27.0 | 封装本地 `git` CLI |
| `@octokit/rest` | ^21.0.2 | GitHub REST 客户端 |
| `axios` | ^1.7.9 | Gitee REST 客户端（Gitee 没有官方 SDK） |
| `electron-store` | ^8.2.0 | **必须 v8.x**（v10+ 是 ESM-only，与 CJS 主进程不兼容） |
| `@monaco-editor/react` | ^4.6.0 | 代码编辑器 |
| `diff2html` | ^3.4.51 | 依赖备用，主项目里 DiffViewer 是自实现 unified diff |
| `lucide-react` | ^0.469.0 | 图标库 |
| `date-fns` | ^4.1.0 | 日期格式化 |
| `clsx` | ^2.1.1 | className 拼接 |
| `nanoid` | ^5.0.9 | toast id |

### 构建时

| 包 | 版本 | 用途 |
| --- | --- | --- |
| `typescript` | ^5.7.2 | 类型检查 + 多目标 emit |
| `vite` | ^6.0.7 | 渲染进程构建（HMR + 生产打包） |
| `vite-plugin-electron` | ^0.29.0 | 一边 build vite 一边 build electron 主进程 / preload |
| `tailwindcss` | ^3.4.17 | CSS 框架 |
| `electron-builder` | ^25.1.8 | **本项目里仅作占位**，实际不靠它产包（见 §7） |
| `@types/*` | - | 类型声明 |

### 打包管线（不在 npm 里）

| 工具 | 来源 | 用途 |
| --- | --- | --- |
| **NSIS 3.11** | `tools/nsis/nsis-3.11/`（手工下载，gitignored） | 生成 `.exe` 安装包 |
| `rcedit` | `node_modules/rcedit`（`--no-save` 装的） | 嵌入图标到 `kunyaogit.exe` |
| `@electron/asar` | `node_modules/@electron/asar` | 把 dist + 生产 node_modules 打成 `app.asar` |
| `png-to-ico` | `node_modules/png-to-ico` | 多尺寸 PNG → `.ico` |
| `sharp` | `node_modules/sharp` | PNG 缩放 |

> **重装后必跑**：`npm i -D png-to-ico sharp rcedit @electron/asar`（最后两个会作为 electron-builder 传递依赖自动装）

---

## 3. 目录结构

```
KunyaoGit/
├── electron/                       # 主进程
│   ├── main.ts                     # 入口：创建 BrowserWindow、注册所有 IPC handler
│   ├── preload.ts                  # contextBridge 暴露 window.gitgui.* API
│   ├── ipc/
│   │   ├── dialog.ts               # 打开文件/目录对话框
│   │   ├── fs.ts                   # 文件系统（read / write / tree / mkdir / delete / rename）
│   │   ├── git.ts                  # Git 操作代理（转发到 services/git.ts）
│   │   ├── gitee.ts                # Gitee REST API（axios）
│   │   ├── github.ts               # GitHub REST API（Octokit）
│   │   ├── release.ts              # Release / Tag 管理（GH + Gitee）
│   │   ├── repo.ts                 # 仓库打开 / 克隆 / 初始化 / 最近列表
│   │   ├── settings.ts             # 设置读写 + Git 路径测试 + Token 测试
│   │   └── update.ts               # ★ 自动更新检查（GitHub + Gitee latest release）
│   └── services/
│       ├── git.ts                  # GitService 类（simple-git 封装）
│       ├── settings.ts             # electron-store 单例
│       ├── changelog.ts            # Conventional Commits 分类器
│       └── update.ts               # ★ GitHub / Gitee Release API + 版本比较
│
├── shared/                         # 主进程 + 渲染进程共用
│   ├── ipc-channels.ts             # IPC 通道字符串常量（防止 typo）
│   └── types.ts                    # 共享类型：RepoInfo / CommitInfo / BranchInfo / ... / AppUpdateInfo
│
├── src/                            # 渲染进程
│   ├── App.tsx                     # 路由 + useUpdateCheck 钩子
│   ├── main.tsx                    # React 入口
│   ├── global.d.ts                 # window.gitgui 类型
│   ├── pages/
│   │   ├── HomePage.tsx            # 首页：最近仓库 + 打开 / 克隆
│   │   ├── RepoPage.tsx            # 仓库详情（路由壳，组合 Changes / Branch / History / Editor）
│   │   ├── RemotePage.tsx          # 列出 GitHub / Gitee 上的仓库 + v0.3.4 顶部搜索框（云端搜索 API）
│   │   ├── RepoDetailPage.tsx      # 远程仓库的 Contents 浏览器 + Monaco 编辑
│   │   ├── ReleasesPage.tsx        # 当前本地仓库的 Release 管理
│   │   └── SettingsPage.tsx        # 设置（含 ★「关于 + 检查更新」卡片）
│   ├── components/
│   │   ├── Layout/
│   │   │   └── Layout.tsx          # 侧边栏 + Outlet + ★ 语言快捷切换按钮
│   │   ├── common/
│   │   │   ├── Toast.tsx           # 全局 Toaster（zustand 实现）
│   │   │   ├── UpdateDialog.tsx    # ★ 应用内更新对话框（询问/下载进度/完成/错误）
│   │   │   ├── StatusBar.tsx       # ★ v0.4+ 底部状态栏（仓库/分支/同步/暂存/版本）
│   │   │   ├── CommandPalette.tsx  # ★ v0.4+ Ctrl+Shift+P 命令面板（VS Code 式模态；v0.5+ 加 Ctrl+P 跳转文件）
│   │   │   ├── Cheatsheet.tsx      # ★ v0.4+ ? 快捷键速查表
│   │   │   └── FileHistoryPanel.tsx # ★ v0.5+ 文件历史侧边抽屉（commit 列表 + 展开 diff）
│   │   └── repo/
│   │       ├── BranchPanel.tsx     # 分支列表 + checkout / new / delete / merge + ★ v0.4 创建 PR
│   │       ├── ChangesPanel.tsx    # 工作区文件状态 + stage / unstage / discard + ★ v0.4 Stash 队列
│   │       ├── CommitHistory.tsx   # git log 时间线（含 Tag / 分支引用） + ★ v0.4 hover 工具条（cherry-pick/revert/copy）
│       ├── EditorPane.tsx      # Monaco 包装 + ★ v0.5+ 「历史」按钮 + Blame 点击行号 gutter
│   │       ├── CommitActionsModal.tsx # ★ v0.4+ 通用确认弹窗（cherry-pick / revert 复用）
│   │       ├── CreatePRDialog.tsx  # ★ v0.4+ 创建 PR / MR（双平台 owner/repo 推断）
│   │       ├── StashList.tsx       # ★ v0.4+ Stash 队列（list / apply / pop / drop / show diff）
│   │       ├── DiffViewer.tsx      # 自实现 unified diff（并排 / 统一两种模式）
│   │       ├── EditorPane.tsx      # Monaco 包装
│   │       ├── FileTree.tsx        # 文件树（v0.3.0 工具栏新建/右键菜单增删改；v0.3.2 默认折叠）
│   │       └── RemotePanel.tsx     # remote 列表 + add / remove
│   ├── hooks/
│   │   ├── useUpdateCheck.ts       # ★ 启动 1.5s 后静默检查更新
│   │   ├── useTheme.ts             # ★ v0.2.5：主题管理（data-theme + Monaco 跟随）
│   │   ├── useShortcuts.ts         # ★ v0.4+ 全局快捷键（Ctrl+Shift+P / Ctrl+R / ?）
│   │   └── useCommandPalette.ts    # ★ v0.4+ 命令面板状态（open / close / toggle）
│   ├── stores/
│   │   ├── repo.ts                 # 当前仓库信息
│   │   ├── settings.ts             # 设置（theme / gitPath / auth / language / ...）
│   │   └── update.ts               # ★ 更新对话框状态 + 下载/安装流程
│   ├── lib/                         # ★ v0.4+ 通用工具
│   │   ├── parseRemote.ts          # ★ v0.4+ 远程 URL → owner/repo/platform 解析
│   │   └── fuzzyMatch.ts            # ★ v0.5+ 模糊搜索算法（Ctrl+P 跳转文件用）
│   ├── config/                      # ★ v0.4+ 全局配置
│   │   └── commands.ts             # ★ v0.4+ 命令面板注册表（约 15 条命令）
│   ├── i18n/                        # ★ v0.2.3：国际化（React Context + useI18n hook）
│   │   ├── index.tsx                # I18nProvider / useI18n() / t() 函数
│   │   ├── zh.ts                    # 中文翻译
│   │   └── en.ts                    # 英文翻译
│   └── styles/
│       └── index.css               # Tailwind base + 自定义 utility (.btn-primary / .panel / .input / .statusbar)
│
├── assets/                         # 入库
│   ├── icon-master.png             # 1024×1024 主图标源
│   └── icon.ico                    # 16/32/48/64/128/256 多尺寸
│
├── scripts/                        # 打包 / 发布 / 调试脚本（按职责分目录）
│   ├── build/                      # ★ 构建相关
│   │   ├── build-unpacked.cjs      #   手工组 release/win-unpacked-v2/（已弃用，v0.2.2 起走 electron-builder）
│   │   ├── build-icon.cjs          #   PNG → .ico（多尺寸）
│   │   ├── installer.nsi           #   NSIS 脚本（KunyaoGit 安装包，旧流程用）
│   │   ├── package-portable.cjs    #   打包便携版 zip + 在 Gitee 创建 release
│   │   ├── replace-installer.cjs   #   替换 GitHub Release 上的安装包 asset
│   │   ├── calc-cache-dir.cjs      #   计算 electron-builder 期望的 cache dir（调试用）
│   │   └── check-expected-hash.cjs #   调试用
│   ├── publish/                    # ★ 发布相关
│   │   ├── publish-v020.cjs        #   一次性脚本（v0.2.0，已用过，保留作示例）
│   │   ├── publish-v021.cjs        #   一次性脚本（v0.2.1，已用过）
│   │   ├── publish-v022.cjs        #   一次性脚本（v0.2.2，已用过）
│   │   ├── publish-v023.cjs        #   ★ v0.2.3：创建 GitHub Release + 流式上传安装包（集成日志）
│   │   ├── upload-installer.cjs    #   上传安装包到 GitHub Release（既有 release 更新，旧版）
│   │   ├── update-gitee-body.cjs   #   ★ v0.2.3：更新 Gitee Release body + 流式上传安装包（集成日志）
│   │   ├── list-assets.cjs         #   列出指定 GitHub release 的 asset
│   │   └── release-github.cjs      #   早期版本发布脚本（基本被 publish-* 替代）
│   └── debug/                      # ★ 调试 / 测试相关
│       ├── test-update.cjs         #   调试：直接调 GitHub + Gitee release API
│       ├── test-gitee.cjs          #   调试：列 Gitee release
│       ├── test-launch.ps1         #   调试：静默 install + 启动 5s + 卸载
│       ├── test-launch-v2.ps1      #   调试：单跑 launch 测试
│       ├── check-handle.ps1        #   调试：查文件锁
│       ├── check-hex.ps1           #   调试：看文件头几字节
│       ├── reset-stage.ps1         #   调试：清理卡住的 win-unpacked/
│       ├── clean-release.ps1       #   ★ v0.2.2：清理 release2/release3/ + 锁定的 win-unpacked/
│       └── fix-nsis-languages.ps1  #   ★ v0.2.3：批量修复 NSIS 语言文件缺失的 MULTIUSER 段
│
├── .release-assets/                # ★ 入库的"已发布"安装包（供 Gitee 走 git 分发）
│   ├── KunyaoGit-Setup-0.1.0-x64.exe
│   ├── KunyaoGit-Setup-0.2.0-x64.exe
│   ├── KunyaoGit-Setup-0.2.1-x64.exe
│   ├── KunyaoGit-Setup-0.2.2-x64.exe
│   ├── KunyaoGit-Setup-0.2.3-x64.exe
│   ├── KunyaoGit-portable-v0.1.0.zip
│   ├── KunyaoGit-portable-v0.2.0.zip
│   ├── KunyaoGit-portable-v0.2.1.zip
│   ├── KunyaoGit-portable-v0.2.2.zip
│   └── KunyaoGit-portable-v0.2.3.zip
│
├── tests/                           # ★ v0.4+ 自动化测试（Vitest 4 + happy-dom + Testing Library 16）
│   ├── setup.ts                    #   window.gitgui 全局 mock（每个测试前重置）
│   ├── stubs/electron-store.ts     #   electron-store 内存 stub
│   └── unit/                       #   测试文件
│       ├── parseRemote.test.ts     #   22 例：远程 URL 解析
│       ├── parseUnifiedDiff.test.ts #  11 例：unified diff 解析
│       ├── gitService.test.ts      #   44 例：GitService mock
│       ├── i18n.test.ts            #   27 例：i18n 完整性 + t() 插值
│       ├── commands.test.ts         #   20 例：命令面板注册表
│       ├── fuzzyMatch.test.ts      #   ★ v0.5+ 14 例：模糊搜索
│       ├── StatusBar.test.tsx       #   21 例：底部状态栏
│       ├── CommandPalette.test.tsx  #   36 例：命令面板（v0.4+ + v0.5+ file 模式）
│       ├── useShortcuts.test.tsx    #   20 例：全局快捷键（v0.4+ + v0.5+ Ctrl+P）
│       ├── StashList.test.tsx       #   18 例：Stash 队列
│       ├── CreatePRDialog.test.tsx  #   22 例：PR/MR 创建
│       └── FileHistoryPanel.test.tsx #  ★ v0.5+ 13 例：文件历史面板
│
├── docs/                           # ★ 项目文档（v0.2.2 新增）
│   ├── api-reference.md            # window.gitgui API 完整参考
│   ├── features.md                 # 功能详解
│   ├── installation.md             # 安装部署指南
│   ├── user-guide.md               # 用户操作指南
│   └── development-guide.md        # 开发规范与注意事项
│
├── logs/                           # ★ gitignored（v0.3.8 日志归档）
│   ├── build/                      # 构建日志（build.log / build-v*.log / dev.log / vite.log）
│   ├── publish/                    # 发布日志（publish-log.txt / publish-v*-gitee/github.log）
│   └── debug/                      # 调试日志（diag-*.log / e2e-*.log 等）
│
├── tools/                          # ★ gitignored（本地工具，NSIS 编译器）
│   └── nsis/nsis-3.11/
│
├── release/                        # ★ gitignored（构建产物）
│   ├── win-unpacked-v2/            # 中间产物：Electron 二进制 + resources/app.asar
│   ├── KunyaoGit-Setup-0.2.0-x64.exe   # 最终安装包
│   ├── KunyaoGit-portable-v0.2.0.zip   # 便携版
│   └── app-stage/                  # 临时暂存区（npm install 完成后被清）
│
├── index.html                      # Vite 入口（renderer）
├── tailwind.config.js
├── postcss.config.js
├── vite.config.ts
├── tsconfig.json                   # 根 tsconfig（paths alias: @ / @electron / @shared）
├── tsconfig.node.json
├── package.json                    # ★ 改版本号改这里
├── package-lock.json
├── LICENSE                         # MIT
├── README.md                       # 用户文档
├── ARCHITECTURE.md                 # 本文件
└── .gitignore                      # 已统一忽略 logs/ / release-v*/ / *.log
```

---

## 4. 三进程架构（Electron 必懂）

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Electron 主进程                              │
│  electron/main.ts                                                    │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ ipc/     │  │ ipc/         │  │ services/    │  │ services/    │  │
│  │ git.ts   │  │ github.ts    │  │ git.ts       │  │ settings.ts  │  │
│  │          │  │ gitee.ts     │  │ changelog.ts │  │ (electron-   │  │
│  │          │  │ release.ts   │  │ update.ts    │  │  store)      │  │
│  │          │  │ update.ts    │  │              │  │              │  │
│  └────┬─────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│       │               │                │                │           │
│       └───────────────┴────────┬───────┴────────────────┘           │
│                                │                                    │
│                         ipcMain.handle(IPC.XXX)                    │
│                                │                                    │
│  ┌─────────────────────────────▼─────────────────────────────────┐ │
│  │       preload.ts  (contextBridge 隔离层)                       │ │
│  │  exposeInMainWorld('gitgui', api)                              │ │
│  │  api.repo.* / api.git.* / api.fs.* / api.release.*            │ │
│  │  api.github.* / api.gitee.* / api.settings.* / api.app.*      │ │
│  │  api.update.*  ← ★ 新增                                        │ │
│  └─────────────────────────────┬─────────────────────────────────┘ │
│                                │ contextIsolated                    │
│                       window.gitgui.*                              │
│                                │                                    │
│  ┌─────────────────────────────▼─────────────────────────────────┐ │
│  │                  渲染进程（Chromium）                          │ │
│  │  src/App.tsx → pages/* → components/*                          │ │
│  │  stores/repo.ts / stores/settings.ts  (zustand)                │ │
│  │  hooks/useUpdateCheck.ts  ← ★ 启动 1.5s 后查更新              │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

**安全原则**（已落地）：

- `contextIsolation: true` + `nodeIntegration: false`：渲染进程 **不能** 直接 `require('fs')`
- 所有 Node / Electron API 必须走 IPC：渲染层只看到 `window.gitgui.*`
- CSP 在主进程 `setupCsp()` 里设置（响应头注入），dev / prod 模式不同
- Token 永远只在主进程用：渲染层只能 `setAuth()` 间接存到 electron-store，**不接触** 原始 token 字符串

---

## 5. IPC 通道清单

定义在 `shared/ipc-channels.ts`，**所有通道** 加新功能必须先在这里注册，再在 `electron/preload.ts` 暴露，最后在 `electron/main.ts` 注册 handler。

### 仓库

| 通道 | 渲染层调用 | 主进程实现 |
| --- | --- | --- |
| `repo:open-dialog` | `gitgui.repo.openDialog()` | `dialog.showOpenDialog` |
| `repo:open` | `gitgui.repo.open(path)` | 校验是 git 目录，存最近列表 |
| `repo:list-recent` | `gitgui.repo.listRecent()` | electron-store 读 |
| `repo:remove-recent` | `gitgui.repo.removeRecent(path)` | electron-store 写 |
| `repo:clone` | `gitgui.repo.clone(url, dest)` | simple-git clone |
| `repo:init` | `gitgui.repo.init(path)` | simple-git init |
| `repo:get-info` | `gitgui.repo.getInfo(path)` | 读 name / branch / remoteUrl |

### Git（基础操作）

| 通道 | 含义 |
| --- | --- |
| `git:status` | 工作区文件状态 |
| `git:log` | 提交历史 |
| `git:branches` | 分支列表（含 ahead / behind） |
| `git:stage` / `git:unstage` / `git:discard` | 暂存 / 取消 / 丢弃 |
| `git:commit` | 提交（支持 amend / signOff） |
| `git:push` / `git:pull` / `git:fetch` | 同步（push 支持 force / setUpstream） |
| `git:checkout` / `git:create-branch` / `git:delete-branch` | 分支操作 |
| `git:merge` | 合并（noFF / squash / custom message） |
| `git:diff` / `git:diff-file` | unified diff（主进程自实现解析） |
| `git:stash` / `git:stash-pop` | stash（v0.3 基础） |
| `git:stash-list` / `git:stash-show` / `git:stash-apply` / `git:stash-drop` | **★ v0.4+ Stash 队列**（list / show diff / apply 保留 / drop 删除） |
| `git:cherry-pick` / `git:revert` | **★ v0.4+ Cherry-pick / Revert**（支持 `-m` 合并提交 parent） |
| `git:reset` | soft / mixed / hard |
| `git:resolve-conflict` / `git:read-conflict` | 冲突文件 ours / theirs |
| `git:remote-list` / `git:remote-add` / `git:remote-remove` | remote 管理 |
| `git:ls-files` | **★ v0.5+ 列出仓库工作区文件**（tracked + untracked，--exclude-standard；用于 Ctrl+P 跳转） |
| `git:blame` | **★ v0.5+ git blame**（`--line-porcelain` 解析为 `BlameLine[]`；编辑器 gutter 用） |
| `git:file-log` | **★ v0.5+ 文件历史**（`--follow` 跟踪重命名；FileHistoryPanel 用） |
| `git:file-diff` | **★ v0.5+ 文件某次 commit 的 diff**（`fromHash^..toHash`；FileHistoryPanel 详情用） |

### 文件系统

`fs:read-dir` / `fs:read-file` / `fs:write-file` / `fs:write-binary` / `fs:mkdir-p` / `fs:file-tree` / `fs:delete` / `fs:rename`

### Release

`release:list` / `release:create` / `release:delete` / `release:get` / `release:publish` / `changelog:generate`

### GitHub（`github.*`）

`list-repos` / **`search-repos`（v0.3.4 云端仓库搜索）** / `create-repo` / `delete-repo` / `list-prs` / `list-issues` / `contents-list` / `contents-read` / `contents-write` / `contents-delete` / **`create-pr`（★ v0.4+ 创建 PR）** / **`get-default-branch`（★ v0.4+ 读仓库默认分支）**

### Gitee（`gitee.*`）

同 GitHub，用 axios 直连 `https://gitee.com/api/v5/...`，含 `create-pr` / `get-default-branch`（★ v0.4+）

### 设置 + 通用

`settings:get` / `settings:set` / `settings:test-git` / `settings:test-auth` / `dialog:show-open` / `dialog:show-save` / `app:open-path` / `app:shell-open` / `app:get-platform` / `app:get-version` / `app:open-external`

### ★ 更新检查 + 应用内下载安装（v0.2.0 检查 / v0.2.2 应用内下载安装）

| 通道 | 渲染层调用 | 主进程实现 |
| --- | --- | --- |
| `update:check` | `gitgui.update.check()` | 强制请求 GitHub + Gitee latest release，返回 `UpdateCheckResult` |
| `update:check-silent` | `gitgui.update.checkSilent()` | 同上，但 6 小时内不重复请求（基于 electron-store 时间戳） |
| `update:dismiss` | `gitgui.update.dismiss(version)` | 持久化到 `updateDismissedVersion`，下次同版本不再问 |
| `update:open` | `gitgui.update.open(url)` | `shell.openExternal` |
| `update:download` | `gitgui.update.download(version, onProgress)` | ★ v0.2.2：多源下载（★ v0.3.1 起 Gitee 走 Release 附件下载优先 / GitHub release 兜底），跟随重定向，流式写入 `%TEMP%`；★ v0.2.4 4 路 Range 并发提速；★ v0.3.1 加连接建立阶段超时 |
| `update:download-progress` | （主→渲染事件） | ★ v0.2.2：`{ phase, percent, bytesReceived, totalBytes, source, message, filePath }`；★ v0.2.4 加 `speedBps` 瞬时速率 |
| `update:install` | `gitgui.update.install(filePath)` | ★ v0.2.2：`shell.openPath(installer)` 启动安装包 → 1.5s 后 `app.quit()` 退出 |
| `update:cancel-download` | `gitgui.update.cancelDownload()` | ★ v0.2.2：取消正在进行的 `https.get` 请求 |

---

## 6. 关键流程图

### 6.1 启动 → 渲染 → 仓库打开

```
1. npm run dev  →  vite 启动 5173 + 自动 build electron/main.ts → dist-electron/main.js
2. main.js 里 VITE_DEV_SERVER_URL 被 vite 注入
3. app.whenReady() → setupCsp() → register*Handlers() → createWindow()
4. BrowserWindow.loadURL(VITE_DEV_SERVER_URL)  + openDevTools()
5. 渲染进程执行 React 入口 src/main.tsx
6. App.tsx useEffect 调 useSettingsStore.load() → window.gitgui.settings.get()
7. （启动 1.5s 后） useUpdateCheck 触发静默更新检查
8. 用户点侧边栏 "打开仓库" → openRepoDialog → repo:open-dialog
9. 选好目录 → repo:open → 校验 → 存最近 → 设置 currentRepo (zustand)
10. 路由切到 /repo/* → RepoPage 组合 BranchPanel / ChangesPanel / EditorPane ...
11. 组件 mount 时批量触发 git:status / git:branches / git:log
```

### 6.2 自动更新检查 + 应用内下载安装（v0.2.2 引入 / v0.2.4 提速 / v0.2.6 探活修复）

```
App 启动
   ↓
useUpdateCheck (useEffect, 1.5s 后)
   ↓
window.gitgui.update.checkSilent()
   ↓
ipcMain UPDATE_CHECK_SILENT
   ↓
checkForUpdate()  // electron/services/update.ts
   ├─ fetchGithub()  → https://api.github.com/repos/buxiaju/KunyaoGit/releases/latest
   └─ fetchGitee()   → https://gitee.com/api/v5/repos/buxiaju/KunyaoGit/releases/latest
                       (使用 settings.auth.gitee.token 如果有)
   ↓
compareVersion(current, latest) 选最高
   ↓
返回 { hasUpdate, currentVersion, latest, sources, dismissed }
   ↓
App 层逻辑（v0.2.2 重写）：
  - 无更新 → 静默
  - 有更新 + 未 dismiss → useUpdateStore.show(info) → 弹出 UpdateDialog
     ↓
  ┌─ 询问阶段 (phase='prompt')
  │  用户点"立即下载并安装" → startDownload()
  │  用户点"浏览器打开"     → update.open(htmlUrl) → shell.openExternal
  │  用户点"忽略此版本"     → update.dismiss(ver) → electron-store
  │  用户关闭对话框          → hide()
  │
  ├─ 探活（v0.2.6 改造 / v0.3.3 容错）
  │  probeRangeWithRetry() 并行探测 Gitee / GitHub
  │  ├─ GET + Range: bytes=0-0（v0.2.6 替代 HEAD，兼容更多 CDN）
  │  ├─ 206 → Content-Range 给到 total；200 → Content-Length 给到 total
  │  ├─ 读到 header 立即 destroy，避免整文件下载
  │  ├─ v0.3.3 起：单次超时 8s，每源探活重试 2 次；全部失败整轮重试最多 6 轮（轮间 3s）
  │  └─ 请求必须 req.end()（v0.3.3 修复，此前请求从未发送）
  │  失败的源记录到 failedSources
  │
  ├─ 下载阶段 (phase='downloading')
  │  update.download(version, onProgress)
  │  ├─ 主进程 tryDownloadFromSource()：按 ok=true 优先顺序
  │  ├─ ★ v0.2.4：downloadByRange() 拆 4 路并发 HTTP Range
  │  │   - keep-alive Agent 复用 TLS/TCP
  │  │   - 单 chunk 失败 3 次重试（指数退避）
  │  │   - 进度 100ms 节流
  │  ├─ 流式写入 %TEMP%\KunyaoGit-Setup-{ver}-x64.exe
  │  └─ 进度事件 → sender.send(UPDATE_DOWNLOAD_PROGRESS, { phase, percent, bytesReceived, totalBytes, source, speedBps, ... })
  │  用户点"取消" → update.cancelDownload() → 全部 in-flight req.destroy()
  │
  ├─ 完成阶段 (phase='done')
  │  下载成功 → setTimeout(800ms) → install()
  │  → update.install(filePath) → shell.openPath(installer) → app.quit()
  │
  └─ 错误阶段 (phase='error'，v0.2.6+ 显示所有源失败原因）
     错误信息形如 "所有下载源都失败：github（请求失败）; gitee（HTML）"
     用户可"重试"或"浏览器打开"
```

### 6.3 安装包构建（重点）

```
[修改源码]
   ↓
npm run build  (tsc -b && vite build)
   ↓
产出 dist/  +  dist-electron/
   ↓
node scripts/build/build-unpacked.cjs
   ├─ 复制 node_modules/electron/dist/* → release/win-unpacked-v2/
   ├─ 重命名 electron.exe → kunyaogit.exe
   ├─ 嵌入 assets/icon.ico 到 kunyaogit.exe（rcedit）
   ├─ 暂存 dist/ + dist-electron/ + package.json 到 release/app-stage/
   ├─ npm install --omit=dev --no-save  →  app-stage/node_modules/ (生产依赖)
   ├─ asar pack app-stage/ → resources/app.asar
   └─ 清空 app-stage/
   ↓
node scripts/build/installer.nsi  (makensis.exe /DAPP_VERSION=X.Y.Z)
   ├─ 复制 win-unpacked-v2/*  →  安装目录
   ├─ 写 Uninstaller.exe
   ├─ 写 HKLM 注册表（添加/移除程序）
   ├─ 创建桌面 / 开始菜单快捷方式
   └─ 打包 LZMA 压缩
   ↓
产出 release/KunyaoGit-Setup-X.Y.Z-x64.exe
```

### 6.4 发布到 GitHub + Gitee

```
release/KunyaoGit-Setup-X.Y.Z-x64.exe  +  KunyaoGit-portable-vX.Y.Z.zip

# 1. 改 package.json 的 version

# 2. 构建
node scripts/build/build-unpacked.cjs
"C:\A\03Projects\MiniMax\GitGUI\tools\nsis\nsis-3.11\makensis.exe" /DAPP_VERSION=X.Y.Z scripts\build\installer.nsi
node scripts/build/package-portable.cjs        # 创建 zip + 在 Gitee 建 release

# 3. 复制到 .release-assets/（Gitee 走 git 分发）
copy release\KunyaoGit-Setup-X.Y.Z-x64.exe .release-assets\
copy release\KunyaoGit-portable-vX.Y.Z.zip .release-assets\

# 4. 上传 GitHub
set GH_TOKEN=github_pat_XXX
node scripts\publish\upload-installer.cjs    # 更新 body + 跳过已存在的 asset
# 或首次发布：
node scripts\publish\publish-v020.cjs        # 创建 release + 上传两个 asset

# 5. 更新 Gitee Release 描述
node scripts\publish\update-gitee-body.cjs

# 6. 提交 + push
git add .release-assets/ package.json
git commit -m "release: vX.Y.Z"
git push gitee master
git push github master
```

---

## 7. 构建管线（v0.2.2 回归 electron-builder + NSIS env var）

> **v0.2.2 变化**：之前因 `app-builder-bin` 从 GitHub 下载超时而绕开 `electron-builder`。v0.2.2 起回归 `electron-builder`（开启 Windows 开发者模式解决 winCodeSign 符号链接 + `ELECTRON_BUILDER_NSIS_DIR` env var 指向本地 NSIS 绕过下载）。

### 7.1 `electron-builder` 流程（v0.2.2）

```
1. npm run typecheck   (tsc -b，类型检查)
2. npx vite build       (renderer → dist/ + main/preload → dist-electron/)
3. npm run build:win    (electron-builder --win)
   ├─ @electron/rebuild (native 依赖重编)
   ├─ packaging → release/win-unpacked/KunyaoGit.exe (嵌入 icon.ico)
   ├─ winCodeSign 下载+解压（需开发者模式，否则符号链接失败）
   ├─ NSIS 编译（读 ELECTRON_BUILDER_NSIS_DIR 指向的 makensis.exe）
   │   ├─ 复制 win-unpacked → 安装包
   │   ├─ 写 Uninstaller.exe
   │   ├─ 写注册表 + 快捷方式
   │   └─ LZMA 压缩
   └─ 产出 release/KunyaoGit-Setup-X.Y.Z-x64.exe (~86 MB)
```

**关键 env var / 配置**：
- `ELECTRON_BUILDER_NSIS_DIR` = 本地 NSIS 目录（如 `C:\Users\...\Cache\nsis\209911007` 或 `tools\nsis\nsis-3.11`）
- 输出目录由 `package.json` 的 `build.directories.output` 配置为 `release/`（如需本地覆盖，可创建 `.build-config.json` 覆盖 `directories.output`，该文件已 gitignore）

### 7.2 旧脚本 `build-unpacked.cjs`（已弃用，保留作参考）

七步走，详见脚本注释：

1. **复制 Electron runtime**：从 `node_modules/electron/dist/*` 拷到 `release/win-unpacked-v2/`，跳过 `electron.exe`
2. **重命名主程序**：`electron.exe` → `kunyaogit.exe`
3. **嵌入图标**：`rcedit(kunyaogit.exe, { icon, 'version-string': {...} })`
4. **暂存源**：`dist/ + dist-electron/ + package.json` → `release/app-stage/`
5. **安装生产依赖**：`npm install --omit=dev --no-save --prefer-offline`（npmmirror 镜像可达，registry.npmjs.org 经常超时）
6. **asar 打包**：`@electron/asar pack app-stage/ resources/app.asar --unpack-dir=node_modules`
   - `--unpack-dir=node_modules` 强制把含 native binding 的包（如未来加的）解到 `app.asar.unpacked/`
7. **清理暂存**：`rm -rf app-stage/`

**关键**：`app.asar` 是 Electron 启动时只读挂载的归档，里面含 **生产依赖 + 业务代码**。这是修复 v0.1.0 缺 `node_modules` 报 `Cannot find module 'electron-store'` 的根因。

### 7.2 `installer.nsi` — NSIS 3.11 安装包脚本

| 段 | 作用 |
| --- | --- |
| `MUI_ICON` / `MUI_UNICON` | 安装 / 卸载界面图标（用 `assets/icon.ico`） |
| 5 个 MUI_PAGE | 欢迎 → 许可 → 选目录 → 安装 → 完成 |
| `Section "-Install"` | 复制 `win-unpacked-v2/*` → `$INSTDIR`，写注册表 + 快捷方式 |
| 升级清理 | `IfFileExists "$INSTDIR\resources\app\*.*"` → `RMDir /r`（处理 v0.1.0 的旧 layout） |
| 卸载段 | 删文件 + 删注册表 + 删快捷方式 |
| `SetCompressor /SOLID lzma` + `SetCompressorDictSize 64` | 整包 LZMA 压缩，~92 MB |

调用：`makensis.exe /DAPP_VERSION=0.2.0 scripts/build/installer.nsi`

### 7.3 `package-portable.cjs` — 便携版 zip

- `Compress-Archive` 打包 `dist/ + dist-electron/ + package.json` → `release/KunyaoGit-portable-vX.Y.Z.zip`（3.5 MB）
- 在 Gitee 创建对应 release（vX.Y.Z）
- 复制 zip 到 `.release-assets/`

**注意**：便携版不含 Electron runtime，需要用户机器上有 `node` 和 `electron`（实际等于开发者用法，普通用户应走安装包）。

### 7.4 `build-icon.cjs` — PNG → .ico

`sharp` 缩放到 6 个尺寸（16/32/48/64/128/256）→ `png-to-ico` 打包成 `.ico`。
源图 `assets/icon-master.png`（1024×1024），是设计稿。

---

## 8. 脚本逐个说明

> 所有脚本都是 `node scripts/build/xxx.cjs` / `node scripts/publish/xxx.cjs` / `node scripts/debug/xxx.cjs` 跑。Windows 路径下注意 `cmd /c` + 双引号。

| 脚本 | 目录 | 何时跑 | 输入 | 输出 |
| --- | --- | --- | --- | --- |
| `build-unpacked.cjs` | `build/` | 每次打包（旧流程） | `dist/`, `dist-electron/`, `assets/icon.ico` | `release/win-unpacked-v2/` |
| `installer.nsi` | `build/` | 每次打包（旧流程） | `release/win-unpacked-v2/`, `assets/icon.ico` | `release/KunyaoGit-Setup-X.Y.Z-x64.exe` |
| `package-portable.cjs` | `build/` | 每次打包 | `dist/`, `dist-electron/` | `release/KunyaoGit-portable-vX.Y.Z.zip` + 在 Gitee 建 release |
| `build-icon.cjs` | `build/` | 换图标时 | `assets/icon-master.png` | `assets/icon.ico` |
| `replace-installer.cjs` | `build/` | 替换已有 GitHub asset | `release/KunyaoGit-Setup-X.Y.Z-x64.exe` | 删旧 + 上传新 |
| `calc-cache-dir.cjs` / `check-expected-hash.cjs` | `build/` | 历史调试，已用不到 | - | - |
| `upload-installer.cjs` | `publish/` | 发版 | `release/KunyaoGit-Setup-X.Y.Z-x64.exe` | GitHub Release 上的 asset |
| `publish-v020.cjs` / `v021.cjs` / `v022.cjs` / `v023.cjs` | `publish/` | 首次发新 release（一次性） | 同上 | 创建 GitHub Release + 流式上传 asset + 日志写入 publish-log.txt |
| `update-gitee-body.cjs` | `publish/` | 发版后 | 无 | 同步 Gitee Release body + 流式上传安装包 attach file + 日志 |
| `list-assets.cjs` | `publish/` | 查 GitHub Release | `env GH_VERSION` | 打印 asset 列表 |
| `release-github.cjs` | `publish/` | 早期版本（已基本被 publish-* 替代） | - | - |
| `test-update.cjs` | `debug/` | 调试 | 无 | 直接打 GitHub + Gitee release API |
| `test-gitee.cjs` | `debug/` | 调试 | 无 | 列 Gitee release |
| `test-launch.ps1` / `test-launch-v2.ps1` | `debug/` | 调试 | `release/win-unpacked-v2/kunyaogit.exe` 或 install-test 目录 | 启动 5s 后 kill |
| `check-handle.ps1` / `check-hex.ps1` / `reset-stage.ps1` | `debug/` | 调试文件锁 | win-unpacked 目录 | 诊断 / 强清 |

---

## 9. 发布流程（一步步）

### 9.1 改版本号

```bash
# 编辑 package.json
{
  "version": "0.3.0"  ← 改这里
}
```

### 9.2 改 release body

编辑 `scripts/publish/publish-v023.cjs` 顶部的 `RELEASE_BODY` 模板（GitHub 端用）。
同时编辑 `scripts/publish/update-gitee-body.cjs` 顶部的 `RELEASE_BODY`（Gitee 端用，可略有差异）。

### 9.3 构建

```bash
# 1. 跑生产 build（tsc + vite + electron-builder 一条龙）
cd C:\A\03Projects\MiniMax\GitGUI
$env:ELECTRON_BUILDER_NSIS_DIR = "c:\A\03Projects\MiniMax\GitGUI\tools\nsis\nsis-3.11"
npm run build:win

# 2. 复制到 .release-assets/（供 Gitee 走 git 分发 + 发布脚本读取）
copy /Y release\KunyaoGit-Setup-0.3.0-x64.exe .release-assets\
```

> **注意**：如果 `release/win-unpacked/resources/default_app.asar` 被 IDE 文件监视器锁定导致构建失败，运行
> `powershell -ExecutionPolicy Bypass -File scripts\debug\clean-release.ps1` 清理后重试，
> 或临时改 `package.json` 的 `build.directories.output` 为新目录构建后再移回。
> NSIS 语言文件缺失 MULTIUSER 段时运行 `fix-nsis-languages.ps1` 批量补齐。

### 9.4 上传

```bash
# 准备 token（GH_TOKEN 自动从 git remote github URL 提取，也可手动设）
set GT_TOKEN=a0d56558c30d9a083fe33282b946cf95   # Gitee（也支持内嵌在脚本里）

# GitHub：创建 release + 流式上传安装包（日志写入 logs/publish/publish-log.txt）
node scripts\publish\publish-v026.cjs

# Gitee：更新 release body + 流式上传安装包 attach file（日志写入 logs/publish/publish-log.txt）
node scripts\publish\update-gitee-body.cjs

# 提交 + push
git add package.json
git commit -m "release: v0.3.8"
git push gitee master
git push github master
```

### 9.5 端到端测试

```bash
# 静默安装
start /wait release\KunyaoGit-Setup-0.3.0-x64.exe /S /D=C:\A\test\kg

# 启动 + 5s 后 kill
"C:\A\test\kg\kunyaogit.exe"
timeout /t 5 /nobreak
taskkill /IM kunyaogit.exe /F

# 静默卸载
"C:\A\test\kg\Uninstall.exe" /S
```

---

## 10. 常见改动场景

### 10.1 加一个新 IPC 功能（比如"导出 patch"）

1. `shared/ipc-channels.ts` 加常量：`EXPORT_PATCH: 'git:export-patch'`
2. `shared/types.ts` 加 payload 类型
3. `electron/services/git.ts` 加方法（或新建 service）
4. `electron/ipc/git.ts` 加 `ipcMain.handle(IPC.EXPORT_PATCH, ...)`
5. `electron/preload.ts` 在 `git:` 块下加方法
6. `electron/main.ts` 不需要改（ipc handler 已经在 registerGitHandlers 里注册）
7. UI 调用：`window.gitgui.git.exportPatch(...)`

### 10.2 加一个新的页面

1. `src/pages/XxxPage.tsx`
2. `src/App.tsx` 加 `<Route path="xxx" element={<XxxPage />} />`
3. `src/components/Layout/Layout.tsx` 在 `NAV` 数组加一项（侧边栏导航）

### 10.3 改图标

1. 改 `assets/icon-master.png`（保持 1024×1024）
2. `node scripts\build\build-icon.cjs assets\icon-master.png assets\icon.ico`
3. 重新 `node scripts\build\build-unpacked.cjs`（rcedit 会重嵌图标）
4. 重新 `node scripts\build\installer.nsi`
5. 发版

### 10.4 加一个新的 npm 依赖

- **生产依赖**（运行时需要）：`npm i <pkg>` → 重新 `build-unpacked.cjs`（自动 `npm install --omit=dev` 会拉进去）
- **开发依赖**（只在 build 时用）：`npm i -D <pkg>`，但**不要**用 `--no-save`，要写进 `package.json`
- 注意：每次新拉 `node_modules` 后，**生产依赖的 asar 打包** 会更新；如果生产依赖有 native binding（.node 文件），用 `--unpack-dir=node_modules` 已经处理

### 10.5 升级 Electron 大版本

⚠️ 风险操作。Electron 大版本升级会改 binary 接口。

1. `npm i -D electron@<new>`
2. `npx tsc -b && npx vite build`
3. `node scripts\build\build-unpacked.cjs`（rcedit / asar 都要重新嵌）
4. `node scripts\build\installer.nsi`
5. **彻底测一遍**：安装 → 启动 → 所有 Git 操作 → 自动更新检查
6. `node_modules/electron/dist/*` 内的 chrome sandbox / ffmpeg / 等二进制都会换版本

### 10.6 切换到 macOS / Linux

`build-unpacked.cjs` 目前是 Windows only（依赖 `electron.exe`、`rcedit`）。要做 macOS：

1. 复制 `scripts/build/build-unpacked.cjs` 为 `build/build-unpacked-darwin.cjs`
2. 改用 `KunyaoGit.app/Contents/MacOS/KunyaoGit` 结构
3. `rcedit` 替换为 `fileicon`（macOS 专属 setIcon 工具）
4. `installer.nsi` 改写为 `installer-dmg.sh`（hdiutil）

`vite.config.ts` 已经支持跨平台，不需要改。

---

## 11. 坑与陷阱

### 11.1 `electron-store` 必须是 v8.x

**v10+ 是 ESM-only**（`"type": "module"`），与 CJS 主进程不兼容。装新版会得到：
```
SyntaxError: Cannot use import statement outside a module
```
已在 `package.json` 锁到 `^8.2.0`。

### 11.2 网络受限环境

- `app-builder-bin`（electron-builder 子进程，Go 写）从 `github.com` 下载 `electron-vXX-win32-x64.zip`，**`ELECTRON_MIRROR` 环境变量无效**。所以我们绕开 electron-builder
- `registry.npmjs.org` 经常超时，但 `https://registry.npmmirror.com` 始终可达
- `github.com` 443 间歇超时，但 Node `https` 直连偶发能通（用于 `upload-installer.cjs` 发布）

### 11.3 win-unpacked 卡死

如果上一次 `build-unpacked.cjs` 跑过测试启动（`spawn(kunyaogit.exe)`），子进程还活着会锁住 `resources/default_app.asar`。
**修法**：用 `mavis-trash` 或在 PowerShell 里：
```powershell
Get-Process kunyaogit,electron,node -ErrorAction SilentlyContinue | Stop-Process -Force
```
如果还卡，重启 / `scripts/debug/reset-stage.ps1`。

### 11.3.1 ★ v0.2.4+ 输出目录避锁（最稳绕法）

v0.2.4 起推荐：**临时把 `package.json` 的 `build.directories.output` 改到一个新目录**（如 `release-v024` / `release-v025` / `release-v026`），避开被锁的 `release/` 目录：

```jsonc
// package.json
"build": {
  "directories": { "output": "release-v026" }   // 临时
}
```

```bash
npm run build:win
# 产物在 release-v026/KunyaoGit-Setup-X.Y.Z-x64.exe
# .gitignore 加上 release-v026/（每个版本加一次），拷 .exe 到 .release-assets/
# 发完改回 "release"，手动删 release-v026/ 整个目录
```

**适用场景**：v0.2.3 之后每次发版如果撞 win-unpacked 锁，按版本号新开临时目录是最稳的做法（避 IDE 文件监视器、避残留 KunyaoGit 进程、避 mavis-trash 工具在某些环境下不可用）。

### 11.4 NSIS 安装包超过 100 MB

Gitee 限制单文件 100 MB。如果超过：

1. 重新评估 LZMA 压缩等级（已经用了 `SetCompressorDictSize 64` + 整包 LZMA）
2. 改用便携版分发（zip 才 3.5 MB）
3. 上 Gitee 用 git 分发（`.release-assets/`）

### 11.5 Gitee 匿名 API 返 404

`/api/v5/repos/{owner}/{repo}/releases/latest` 对匿名请求 404。**自动更新检查的 Gitee 端必须配 token**。
普通用户：只查 GitHub 一边（也够用）。
高级用户：在 设置 → Gitee 填 token，两边都查。

### 11.6 `rcedit` v5 是 ESM-only

```js
// ❌ 会爆
const rcedit = require('rcedit');
rcedit(path, opts);

// ✅ 用 dynamic import
const { rcedit } = await import('rcedit');
await rcedit(path, opts);
```

### 11.7 `package.json` 的 `build.win.target` 写了 `nsis` 但实际不用

`electron-builder` 那个 `nsis` 配置是给 `electron-builder` 看的；我们手动跑 NSIS。配置仍保留：未来 `electron-builder` 网络可用时，可以直接 `npm run build:win` 出包。

### 11.8 Git LFS 没启用

`.release-assets/*.exe` 都 > 50 MB，push 时 GitHub 会 warning 但不阻断。**不要**上 LFS（会增加复杂度且无必要）。

### 11.9 Tailwind 颜色

`primary-400`、`primary-500` 等需要在 `tailwind.config.js` 配。当前在 `styles/index.css` 的 `@layer utilities` 里硬塞了 `.btn-primary`、`.panel`、`.input` 等组件类。

### 11.10 远程仓库操作的 token 校验

`getOctokit()` 找不到 token 时返回 `null`，IPC handler 必须先判 `null` 再返 `{ ok: false, error: '未配置 GitHub Token' }`。
**不要** 让 token 缺失的请求到 GitHub 拿 401，否则用户看到的是 GitHub 的英文错误信息，不友好。

### 11.11 ★ v0.2.6 修复：应用内更新器探活别用 HEAD

v0.2.2~v0.2.5 用 `HEAD` 请求探活 release 资源，部分 CDN / 防火墙对 HEAD 更敏感（直接 403 或超时），用户看到误导性的「github: HEAD 失败」。

v0.2.6 改为 **`Range: bytes=0-0` GET** 探活（兼容性远好于 HEAD）：

- 206 响应：`Content-Range: bytes 0-0/{total}` 直接给到 total size
- 200 响应：忽略 Range 时，Content-Length 仍是 total size
- 读完 header 立即 `res.destroy()`，避免 200 情况把整文件拉下来
- 探活超时从 8s 提到 15s

未来要改 `probeRange` 时务必**继续用 GET 探活**，不要图省事回退到 HEAD；同时保持错误信息汇总所有源失败原因（`failedSources[]`）让用户能区分是网络问题还是源问题。

### 11.12 ★ v0.2.4+ 4 路 Range 并发的取舍

`electron/ipc/update.ts` 的 `downloadByRange()` 默认 4 路并发，改这个数字要考虑：

- 家用 100M 宽带 4 路正好；千兆宽带可试 6-8 路但收益递减
- `keepAliveHttpsAgent.maxSockets` 要同步 = `CHUNK_COUNT + 2`
- 单 chunk 失败 `CHUNK_RETRY = 3` 次重试（指数退避 `CHUNK_RETRY_BACKOFF * 2^attempt`）
- 进度事件 100ms 节流（避免 IPC 通道被 90MB 文件的 ~1400 个 chunk 事件刷爆）

**不要轻易把 chunk 数量改成 1** —— 那就退化成 v0.2.2 的单连接了，单连接 18s 体感非常糟糕。

### 11.13 ★ v0.3.1 修复：Gitee 下载源必须走 Release 附件，不能用 raw 直链

v0.2.2~v0.3.0 的 Gitee 下载源是 `https://gitee.com/{owner}/{repo}/raw/master/.release-assets/...`（走 git 分发的 raw 直链）。**这个源对 >50MB 大文件已失效**：

- 实测 `Range: bytes=0-0` 对 86MB 安装包返回 **HTTP 403**（早期是返 HTML 提示页，后收紧为 403）
- 结果：国内用户（GitHub 被墙）两个源全挂，报「所有下载源都失败」

v0.3.1 起改为 **Gitee Release 附件下载 URL**（发布脚本 `update-gitee-body.cjs` 上传的 attach file）：

```
https://gitee.com/{owner}/{repo}/releases/download/v{ver}/{filename}
```

- 302 重定向到官方附件 CDN `foruda.gitee.com`（URL 带签名 token）
- **不支持 Range**（忽略 Range 头返回 200 整文件）→ 探活拿到 Content-Length 后走 `downloadSingle` 单连接，实测 ~2MB/s，86MB 约 45s
- 探活对 200 响应读完 header 立即 `res.destroy()`，不会把整文件拉下来

**另一个 v0.3.1 修复：连接建立阶段超时**。`req.setTimeout()` 只对「已连接 socket 的空闲」计时，TCP 握手卡死（github.com 被墙、SYN 无响应）时会无限挂起。`requestFollow()` 现在监听 `socket` 事件，在 `socket.connecting` 时起整体计时器，`connect` 后清除（探活 15s / 下载 30s）。

**注意**：应用内更新器代码是"旧代码下载新版本"，所以本修复只对安装 v0.3.1+ 的用户生效；v0.2.6/v0.3.0 用户需手动下载安装 v0.3.1 一次。

### 11.14 ★★ v0.3.3 致命 bug：`https.request` 漏调 `req.end()`，下载请求从未发送

v0.2.2~v0.3.2 的应用内更新下载**必失败**的真正根因（v0.3.3 修复）：

- `requestFollow()` 用 `lib.request(...)`（对应 `https.request`）构造请求，但**从未调用 `req.end()`**
- Node 中 `https.request` **不会自动发送请求**（只有 `https.get` 会），于是请求对象只建立了 TCP/TLS 连接、从不发出 HTTP 请求行，服务器一直等待 → 8s/15s 后触发 socket 空闲超时 → 报「所有下载源都失败」
- 这解释了为什么**更新检查正常**（services/update.ts 用 `https.get`，自动 end，能发现新版本）而**下载必失败**（同一批用户，检查成功下载失败）
- v0.3.1 改 Gitee URL 无效的原因也在此——请求压根没发出去
- 排查手段：在 Electron 内嵌 Node（`ELECTRON_RUN_AS_NODE=1`）下做 A/B 对照，加 `req.end()` 后 12/12 成功、不加 12/12 失败

**教训**：任何用 `http.request` / `https.request` 的地方，记得 `req.end()`（无 body 的 GET 也要）。用 `http.get` / `https.get` 可免。

v0.3.3 同时加了下载容错：探活每源 2 次（8s 超时）+ 全部失败整轮重试最多 6 轮（轮间 3s，约 2 分钟，界面提示「网络波动，第 N/6 轮重试…」）+ 下载中断同源重试 2 次。原因：国内网络对 gitee.com（DNS 被劫持到 baiduads.com 的 180.76.x.x 百度云节点）连接高度间歇，分钟级好/坏窗口交替，单次探测撞上坏窗口即失败。

### 11.15 ★ v0.3.4：Gitee 官方仓库搜索 API 已失效

`https://gitee.com/api/v5/search/repositories?q=xxx` **恒返回空数组 `[]`**（实测 v0.3.4 时代；`/search/users` 正常）。`electron/ipc/gitee.ts` 的 `GT_SEARCH_REPOS` 做了降级：官方 API 结果为空时，拉取 `/user/repos`（我的仓库，per_page 100）按名称/描述本地过滤，保证搜索框功能可用。未来 Gitee 若恢复该 API，`items.length > 0` 分支会自动走官方搜索，无需改动。

---

## 12. 环境 / 凭据 / 网络

### 12.1 凭据存放

| 凭据 | 存放位置 | 备注 |
| --- | --- | --- |
| GitHub PAT | `%APPDATA%\gitgui\gitgui-settings.json` → `auth.github.token` | 用户在 UI 里填，**不进仓库** |
| Gitee Token | 同上 → `auth.gitee.token` | 同上 |
| `GH_TOKEN` | 环境变量 | 只在跑发布脚本时临时 `set` |
| `GT_TOKEN` | `process.env.GT_TOKEN` 或脚本内 fallback | v0.2.3 起 `update-gitee-body.cjs` 优先读环境变量，fallback 为硬编码值 `a0d56558...`（v0.2.3 更新的令牌） |

### 12.2 系统要求（用户侧）

- Windows 10 / 11 x64
- `git` 在 PATH 里（应用通过 `git` CLI 调）
- 便携版额外需要 Node.js

### 12.3 构建环境要求（开发者侧）

- Node.js ≥ 20
- Windows（用到 NSIS + rcedit）
- 可访问 `registry.npmmirror.com`
- 可访问 `downloads.sourceforge.net`（NSIS 下载源）
- 可访问 `github.com` / `gitee.com`（发布）
- **不需要** 装 `electron-builder` 也跑得起来（脚本不依赖它）

### 12.4 已知 100 MB GitHub 警告

`KunyaoGit-Setup-x.y.z-x64.exe` > 50 MB，git push 时 GitHub 会 warning。**可以无视**——文件确实进 git 历史了。

---

## 13. 术语表

| 术语 | 含义 |
| --- | --- |
| 主进程 | `electron/main.ts` 跑的 Node.js 进程，权限大 |
| 渲染进程 | Chromium 跑的 React 进程，权限小（contextIsolation） |
| IPC | 进程间通信，通道名在 `shared/ipc-channels.ts` |
| contextBridge | `preload.ts` 里把主进程能力安全暴露到 `window.gitgui` |
| asar | Electron 专用归档格式，只读挂载为一个虚拟文件系统 |
| `app.asar` | 本项目里 dist + 生产 node_modules 打成的一个包 |
| `app.asar.unpacked` | asar 里 native binding 等必须解出来放外面的目录 |
| `win-unpacked` | electron-builder 习惯的中间产物目录名；本项目是 `win-unpacked-v2` |
| `productName` | 人类可读的应用名（KunyaoGit） |
| `appId` | 应用唯一标识（`com.kunyao.kunyaogit`），注册表 / 卸载入口用 |
| NSIS | Nullsoft Scriptable Install System；Windows 安装包格式 |
| LZMA | 7-Zip 同款压缩算法，NSIS 用它压安装包 |
| PAT | Personal Access Token（GitHub / Gitee 都用） |
| CSP | Content Security Policy，主进程 `setupCsp()` 注入 |
| `mavis-trash` | Mavis 提供的"移到回收站"工具，能绕过 Windows `Remove-Item` 阻断 |
| `simple-git` | Node 库，封装 `git` CLI；不实现 git 协议 |
| ★ Theme | ★ v0.2.5：UI 主题类型，`'dark' \| 'ocean' \| 'light'`，对应三套 CSS 变量 |
| ★ `data-theme` | ★ v0.2.5：写到 `<html>` 的主题属性，CSS 选择器据此覆盖 Tailwind 颜色 |
| ★ `kg-theme-change` | ★ v0.2.5：主题切换时派发的 `CustomEvent<Theme>`，Monaco 等组件订阅以跟随 |
| ★ `useI18n` | ★ v0.2.3：React Context 提供的国际化 hook，返回 `{ t, lang, setLang }` |
| ★ HTTP Range 多连接 | ★ v0.2.4：把文件拆 N 段并发 GET `Range: bytes=X-Y`，单连接瓶颈消失 |
| ★ `probeRange` | ★ v0.2.6：用 `Range: bytes=0-0` GET 探活（替代 v0.2.5 的 HEAD，兼容更多 CDN）|

---

## 附录 A：常见故障速查

| 症状 | 原因 | 修法 |
| --- | --- | --- |
| 启动报 `Cannot find module 'electron-store'` | asar 没装生产依赖 | 重跑 `build-unpacked.cjs` |
| 启动报 `EBADF` / 文件锁 | win-unpacked 残留进程 | `mavis-trash release\win-unpacked-v2` 后重建 |
| NSIS 编译报 `Bad text encoding` | `.nsi` 里有非 ASCII | 把中文注释改成英文，或另存为 UTF-8 no BOM |
| NSIS 编译报 `File: "release\win-unpacked\*.*" -> no files found` | 路径相对脚本，找不到 | 用 `..\release\win-unpacked-v2\*.*` |
| Gitee push 拒：`exceeds quota 100MB` | 历史里某个 blob > 100 MB | `git filter-branch` 删旧文件 + 重新提交 |
| Gitee API 返 404 | 匿名访问受限 | 在 设置 → Gitee 配 token |
| 自动更新检查总是"无更新" | 用了 `app.getVersion()` 比对，本地 v0.2.0 vs 远端 v0.1.0 = 远端旧 | 发新版 v0.3.0 |
| `npx tsc -b` 报 `Expected 1 arguments, but got 2` | toast 旧版 API 签名 | 去掉第二个参数 |

## 附录 B：端口 / 文件路径

| 用途 | 路径 |
| --- | --- |
| 用户数据 | `%APPDATA%\gitgui\gitgui-settings.json` |
| 用户最近仓库 | 同上，`recentRepos` 字段 |
| 用户忽略的更新版本 | 同上，`updateDismissedVersion` 字段 |
| 上次自动检查时间 | 同上，`updateLastCheck` 字段 |
| 默认安装目录 | `$PROGRAMFILES64\KunyaoGit` |
| 注册表 | `HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall\com.kunyao.kunyaogit` |
| 桌面快捷方式 | `%USERPROFILE%\Desktop\KunyaoGit.lnk` |
| 开始菜单 | `%APPDATA%\Microsoft\Windows\Start Menu\Programs\KunyaoGit\` |

---

**最后**：这份文档跟 `package.json` 同源，跟 `scripts/` 同源。改任何一项，请同步这份文档。
