# KunyaoGit 安装与部署指南

> 本指南介绍 KunyaoGit 在 Windows 平台的安装、卸载、应用内更新以及从源码构建打包的完整流程。
>
> 当前版本：**v0.6.0**（v0.3.0+ 文件管理 & 多远程推送、v0.3.1+ Gitee 下载源修复、v0.3.2+ 文件树折叠、v0.3.3+ 更新下载容错重试、v0.3.4+ 云端仓库搜索、v0.4+ 命令面板 / 快捷键 / Stash / Cherry-pick / Revert / PR 创建 / 状态栏、v0.5+ Ctrl+P 跳转文件 / 文件历史 + Blame、**v0.6+ Release 附件管理 / 编辑 / Markdown 渲染**）

---

## 目录

1. [系统要求](#1-系统要求)
2. [安装包下载](#2-安装包下载)
3. [NSIS 安装步骤](#3-nsis-安装步骤)
4. [便携版使用](#4-便携版使用)
5. [应用内更新安装流程](#5-应用内更新安装流程)
6. [卸载方法](#6-卸载方法)
7. [从源码构建](#7-从源码构建)
8. [打包安装包](#8-打包安装包)
9. [常见安装问题排查](#9-常见安装问题排查)

---

## 1. 系统要求

| 项目 | 要求 |
|------|------|
| 操作系统 | Windows 10 / 11（64 位） |
| 架构 | x64 |
| Git | 已安装 Git for Windows，且 `git` 命令在系统 PATH 中 |
| 网络 | 需访问 GitHub / Gitee（用于远程仓库与更新检查） |

> **关于 Git**：KunyaoGit 通过本地 Git 命令行调用完成所有仓库操作，因此本机必须安装 Git。若尚未安装，请前往 https://git-scm.com/download/win 下载并安装，安装时务必勾选「Add to PATH」选项。
>
> 便携版额外要求本机已安装 Node.js（详见第 4 节）。

---

## 2. 安装包下载

KunyaoGit 提供 NSIS 安装包（推荐）与便携版两种分发形式，均托管于 GitHub 与 Gitee Release。

### 2.1 最新版（v0.6.0）下载地址

**NSIS 安装包（推荐，约 86 MB）**

| 平台 | 下载地址 |
|------|----------|
| GitHub | https://github.com/buxiaju/KunyaoGit/releases/download/v0.6.0/KunyaoGit-Setup-0.6.0-x64.exe |
| Gitee | https://gitee.com/buxiaju/KunyaoGit/releases/tag/v0.6.0 |

> **v0.6.0 起**：Gitee Release 附件配额已恢复，86 MB 的 NSIS 安装包可直接从 Gitee Release 页面下载（此前 v0.5.x 因配额用尽只能走 GitHub）。
> 另外仓库内 `.release-assets/KunyaoGit-Setup-0.6.0-x64.exe` 也可通过 `git clone` 获取。

**便携版（约 3.5 MB，需本机已安装 Node.js）**

| 平台 | 下载地址 |
|------|----------|
| GitHub | https://github.com/buxiaju/KunyaoGit/releases/download/v0.6.0/KunyaoGit-portable-v0.6.0.zip |
| Gitee | https://gitee.com/buxiaju/KunyaoGit/releases/tag/v0.6.0 |

> 完整发布列表见 [附录 A. 版本与下载速查](#附录-a-版本与下载速查)。

### 2.2 选择哪个版本？

| 形式 | 适合人群 | 优点 | 缺点 |
|------|----------|------|------|
| NSIS 安装包 | 大多数普通用户 | 自带完整 Electron 运行时，无需额外依赖，创建快捷方式 | 体积较大 |
| 便携版 | 已有 Node.js 环境的开发者 | 体积小，免安装，可放 U 盘 | 依赖本机 Node.js |

> 国内用户建议优先从 Gitee 下载，速度更快且更稳定。

---

## 3. NSIS 安装步骤

### 3.1 运行安装程序

1. 双击下载的 `KunyaoGit-Setup-0.3.4-x64.exe` 文件。
2. 若出现 Windows SmartScreen 提示「Windows 已保护你的电脑」，点击「更多信息」→「仍要运行」。
3. 若弹出用户账户控制（UAC）提示，点击「是」授权运行。

### 3.2 安装向导

1. **欢迎页**：点击「下一步」。
2. **许可证**：阅读 MIT 许可证后点击「下一步」。
3. **选择目标目录**：
   - 默认安装路径为 `%LOCALAPPDATA%\Programs\KunyaoGit`（按用户安装）。
   - 如需更改，点击「浏览」选择目标目录。
   - KunyaoGit 的 NSIS 配置允许自定义安装目录（`allowToChangeInstallationDirectory: true`）。
4. **选择开始菜单文件夹**：可保持默认，或自定义开始菜单快捷方式所在文件夹。
5. **附加任务**（如显示）：
   - 创建桌面快捷方式（默认勾选）。
   - 创建开始菜单快捷方式（默认勾选）。
6. **准备安装**：确认信息后点击「安装」。
7. **完成**：安装完成后点击「完成」。可选择立即启动应用。

### 3.3 安装后

安装程序会创建以下快捷方式：

- **桌面快捷方式**：名称为「KunyaoGit」。
- **开始菜单快捷方式**：在开始菜单的「KunyaoGit」文件夹下。

双击任一快捷方式即可启动应用。

> NSIS 配置采用按用户安装（`perMachine: false`），无需管理员权限即可安装到用户目录。

---

## 4. 便携版使用

便携版无需安装，但依赖本机 Node.js 运行时。

### 4.1 前置条件

- 本机已安装 **Node.js ≥ 20**，可在命令行执行 `node -v` 验证。
- 本机已安装 Git 并在 PATH 中。

### 4.2 使用步骤

1. 下载 `KunyaoGit-portable-v0.3.4.zip`。
2. 将压缩包解压到任意目录，例如 `D:\Tools\KunyaoGit`。
3. 进入解压目录，双击运行 `kunyaogit.exe`。

便携版不会在系统注册表或开始菜单留下痕迹，配置数据存储于用户目录下，可随目录一起迁移。

---

## 5. 应用内更新安装流程

KunyaoGit 内置自动更新检查，无需手动重新下载安装包。

### 5.1 自动检查

应用启动约 1.5 秒后会静默检查 GitHub 与 Gitee 的最新 Release（主进程做 6 小时节流）。发现新版本时自动弹出更新对话框。

### 5.2 应用内下载安装

1. 弹窗显示新版本号、当前版本号与 Release 说明。
2. 点击「立即下载并安装」。
3. 对话框显示下载进度（百分比、已下载/总字节数、下载源）。
4. 下载完成后应用自动退出，并启动新版本的安装程序。
5. 按安装向导完成升级即可。

### 5.3 手动检查

进入「设置 → 关于 → 检查更新」，可随时手动触发检查。结果卡片提供「立即下载并安装」「浏览器打开」「忽略此版本」等操作。

> 详细操作说明见《用户操作指南》第 8 章。

### 5.4 更新下载机制说明

- **v0.3.1 起**：Gitee 下载源改为官方 Release 附件直链（`releases/download/vX.Y.Z/...`），不再走 raw 直链——Gitee raw 对大于 50MB 的文件返回 403，会导致大安装包下载失败。
- **v0.3.3 起**：下载内置容错，网络波动时自动重试——探活每个源最多 2 次、整体最多 6 轮（约 2 分钟），界面会显示「网络波动，第 N/6 轮重试…」；下载中断时会对同一源自动重试，无需手动操作。
- 若应用内更新持续失败（多为旧版本更新器 bug），请手动下载最新安装包覆盖安装（覆盖安装无需先卸载旧版本，配置数据会保留）。

---

## 6. 卸载方法

### 6.1 通过控制面板卸载（NSIS 安装版）

1. 打开「设置 → 应用 → 已安装的应用」（或「控制面板 → 程序和功能」）。
2. 在列表中找到「KunyaoGit」。
3. 点击「卸载」，按向导完成卸载。

或直接运行安装目录下的 `Uninstall KunyaoGit.exe`（通常位于安装目录根）。

### 6.2 卸载后清理

NSIS 配置 `deleteAppDataOnUninstall: true`，卸载时会一并清除应用数据目录。如需手动彻底清理，可删除以下残留：

```
%APPDATA%\KunyaoGit
%LOCALAPPDATA%\Programs\KunyaoGit
```

### 6.3 便携版卸载

直接删除解压目录即可。配置数据位于用户目录，可按需删除 `%APPDATA%\KunyaoGit`。

---

## 7. 从源码构建

适合开发者本地运行或二次开发。

### 7.1 环境要求

| 项目 | 要求 |
|------|------|
| Node.js | ≥ 20 |
| Git | ≥ 2.30，且在 PATH 中 |
| 操作系统 | Windows 10/11（开发），亦支持 macOS / Linux |

### 7.2 克隆并安装依赖

```bash
git clone https://github.com/buxiaju/KunyaoGit.git
cd KunyaoGit
npm install
```

> 首次 `npm install` 会拉取 Electron 二进制，可能耗时较长。国内网络下建议配置镜像：
> ```bash
> set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
> ```

### 7.3 开发模式运行

```bash
npm run dev
```

该命令通过 Vite 启动开发服务器与 Electron，支持热更新（HMR），修改代码后自动刷新。

### 7.4 类型检查

```bash
npm run typecheck
```

### 7.5 代码检查与修复

```bash
npm run lint
```

---

## 8. 打包安装包

### 8.1 打包 Windows 安装包

```bash
npm run build:win
```

该命令依次执行：

1. `tsc -b`：TypeScript 类型编译。
2. `vite build`：构建渲染进程产物到 `dist`、主进程产物到 `dist-electron`。
3. `electron-builder --win`：使用 electron-builder 打包 Windows NSIS 安装包。

产物输出在 `release` 目录下，文件名形如：

```
release/KunyaoGit-Setup-0.3.4-x64.exe
```

### 8.2 直接构建（含打包）

```bash
npm run build
```

与 `build:win` 类似，会调用 `electron-builder`（使用 `package.json` 中 `build` 配置的默认 target）。

### 8.3 electron-builder 关键配置

`package.json` 中的 `build` 字段已配置：

| 配置项 | 值 | 说明 |
|--------|-----|------|
| appId | `com.kunyao.kunyaogit` | 应用唯一标识 |
| productName | `KunyaoGit` | 显示名称 |
| icon | `assets/icon.ico` | 应用图标 |
| win.target | `nsis` (x64) | Windows 目标为 NSIS 安装包 |
| artifactName | `${productName}-Setup-${version}-${arch}.${ext}` | 产物命名规则 |
| nsis.oneClick | `false` | 非一键安装，显示向导 |
| nsis.allowToChangeInstallationDirectory | `true` | 允许自定义安装目录 |
| nsis.createDesktopShortcut | `true` | 创建桌面快捷方式 |
| nsis.createStartMenuShortcut | `true` | 创建开始菜单快捷方式 |
| nsis.shortcutName | `KunyaoGit` | 快捷方式名称 |
| nsis.perMachine | `false` | 按用户安装 |
| nsis.allowElevation | `true` | 允许提权 |
| nsis.deleteAppDataOnUninstall | `true` | 卸载时清除数据 |

### 8.4 NSIS 环境变量

如自定义 NSIS 脚本或使用本地 NSIS 安装包，可能需要设置以下环境变量，告知 electron-builder NSIS 的位置：

```powershell
# PowerShell 临时设置
$env:NSIS_DIR = "C:\Program Files (x86)\NSIS"

# 永久设置（用户级）
[Environment]::SetEnvironmentVariable("NSIS_DIR", "C:\Program Files (x86)\NSIS", "User")
```

electron-builder 默认会自动下载所需 NSIS 工具到缓存目录（通常为 `%LOCALAPPDATA%\electron-builder\Cache\nsis`）。若自动下载失败，可手动下载并放入该缓存目录，或通过上述环境变量指向本地 NSIS。

> 项目内置 NSIS 自定义脚本位于 `scripts/build/installer.nsi`，用于定制安装界面与行为。

### 8.5 构建便携版

项目提供便携版打包脚本：

```bash
node scripts/build/package-portable.cjs
```

产出 `KunyaoGit-portable-v0.3.4.zip`，体积小但需目标机器具备 Node.js 环境。

---

## 9. 常见安装问题排查

### 9.1 安装时被 SmartScreen 拦截

**现象**：运行安装包时 Windows SmartScreen 提示「Windows 已保护你的电脑」。

**解决**：这是因为安装包未经过代码签名。点击「更多信息」→「仍要运行」即可继续安装。后续版本如提供代码签名将不再出现此提示。

### 9.2 安装时提示需要管理员权限

**现象**：安装时弹出 UAC 提示。

**解决**：KunyaoGit 默认按用户安装（`perMachine: false`），安装到用户目录通常不需要管理员权限。若选择安装到系统目录（如 `C:\Program Files`），则需提权。建议保持默认用户目录安装。

### 9.3 启动后提示找不到 git

**现象**：应用内执行 Git 操作报错，或「设置」中测试 Git 路径失败。

**解决**：

1. 确认已安装 Git for Windows。
2. 打开命令提示符执行 `git --version`，应输出版本号。
3. 若 `git` 命令不可用，重新安装 Git 并勾选「Add to PATH」。
4. 或在「设置 → 通用 → Git 可执行文件路径」中手动填入 `git.exe` 完整路径，如：
   ```
   C:\Program Files\Git\bin\git.exe
   ```
5. 点击「测试」验证后「保存」。

### 9.4 GitHub Token 验证失败

**现象**：「测试并保存」提示「Token 无效」。

**解决**：

1. 确认 Token 未过期或被撤销。
2. 确认 Token 权限包含 `repo` 和 `read:user`。
3. 确认复制 Token 时未多余空格或换行。
4. 重新在 GitHub Settings → Developer settings → Personal access tokens 生成新 Token。

### 9.5 Gitee 相关功能无法使用

**现象**：Gitee 仓库列表为空，或更新检查显示 Gitee 失败。

**解决**：

1. 确认已在「设置 → Gitee」配置有效私人令牌。
2. Gitee 部分匿名 API 会返回 404，应用会使用已配置的 Gitee Token 鉴权，请确保 Token 有效。
3. Gitee 更新检查依赖 Gitee Token，未配置时该源可能失败，但 GitHub 源仍可正常工作。

### 9.6 应用内下载更新失败

**现象**：点击「立即下载并安装」后下载失败。

**可能原因**：

1. **旧版本更新器 bug**：v0.3.3 之前的版本存在 `req.end` 缺失问题，会导致应用内下载必然失败；请手动下载安装包覆盖安装，升级到 v0.3.3+ 后再试应用内更新。
2. **Gitee raw 直链 403**：Gitee raw 对 >50MB 文件返回 403，v0.3.1 起已改为官方 Release 附件直链（`releases/download/vX.Y.Z/...`）；使用旧版本时请优先选择 GitHub 源或手动下载。
3. **网络波动**：v0.3.3+ 下载内置容错会自动重试（探活每源 2 次 + 整体最多 6 轮约 2 分钟，界面显示「网络波动，第 N/6 轮重试…」）；若自动重试后仍失败，多为网络不通或源不可达。

**解决**：

1. 看错误信息：v0.2.6+ 会**列出所有源**的失败原因（如「github（请求失败（超时/网络））; gitee（Gitee raw 返 HTML（大文件受限））」），可以一眼判断是网络问题还是源问题。
2. 点击「重试」重新下载（再次并行探活所有源）。
3. 若持续失败，点击「浏览器下载」跳转浏览器手动下载安装包。
4. 检查网络是否能访问对应平台（GitHub 下载可能需要科学上网，可优先使用 Gitee 源）。
5. 手动下载安装包后直接运行覆盖安装即可，无需先卸载旧版本。
6. v0.2.4+ 下载走 4 路并发 HTTP Range，从 18s 降到 4-6s；v0.2.6+ 探活改 GET 替代 HEAD，避开部分网络对 HEAD 的限制；v0.3.3+ 网络波动自动重试，下载中断会同源重试。

### 9.7 安装后无法启动 / 闪退

**现象**：双击快捷方式后应用未启动或立即退出。

**解决**：

1. 以管理员身份运行快捷方式（右键 → 以管理员身份运行）。
2. 检查杀毒软件是否误报拦截，将 KunyaoGit 加入白名单。
3. 查看事件查看器（`eventvwr.msc`）的 Windows 日志 → 应用程序，寻找相关错误信息。
4. 尝试便携版或从源码 `npm run dev` 运行，查看控制台错误。

### 9.8 安装包体积过大 / 下载缓慢

**现象**：安装包约 86 MB，下载耗时较长。

**解决**：

1. 优先从 Gitee Release 下载（国内速度更快）。
2. v0.2.4+ 应用内下载器走 4 路并发 HTTP Range，90MB 从单连接 18s 降到 4-6s；可在「设置 → 关于 → 检查更新」试一下
3. 使用支持断点续传的下载工具（如 IDM、aria2）下载。
4. 若本机已有 Node.js 环境，可改用便携版（约 3.5 MB）。

### 9.9 卸载后仍有残留

**现象**：卸载后开始菜单或桌面仍残留快捷方式。

**解决**：

1. 手动删除桌面上的「KunyaoGit」快捷方式。
2. 删除开始菜单中的「KunyaoGit」文件夹。
3. 删除用户数据目录 `%APPDATA%\KunyaoGit`（NSIS 配置 `deleteAppDataOnUninstall` 已开启，正常卸载会自动清理）。

### 9.10 打包时 electron-builder 下载失败

**现象**：`npm run build:win` 时 electron-builder 下载 NSIS 或 Electron 二进制超时失败。

**解决**：

1. 设置 Electron 镜像：
   ```powershell
   $env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
   $env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"
   ```
2. 手动下载对应二进制放入缓存目录 `%LOCALAPPDATA%\electron-builder\Cache`。
3. 重试 `npm run build:win`。

---

## 附录：版本与下载速查

| 版本 | 安装包（GitHub） | 便携版（GitHub） | 主要变化 |
|------|-------------------|------------------|----------|
| **v0.6.0** | `KunyaoGit-Setup-0.6.0-x64.exe` | `KunyaoGit-portable-v0.6.0.zip` | 📎 Release 附件上传/下载/删除 + ✏️ Release 编辑 + 🎨 详情抽屉（Markdown 渲染）+ 🔍 列表搜索 |
| v0.5.0 | `KunyaoGit-Setup-0.5.0-x64.exe` | `KunyaoGit-portable-v0.5.0.zip` | ⌨️ Ctrl+P 跳转文件 + 📜 文件历史 / Blame |
| v0.4.0 | `KunyaoGit-Setup-0.4.0-x64.exe` | `KunyaoGit-portable-v0.4.0.zip` | 🔍 命令面板 + ⌨️ 全局快捷键 + 📦 Stash 队列 + 🍒 Cherry-pick / Revert + 🌐 PR·MR 创建 + 📊 底部状态栏 |
| v0.3.8 | `KunyaoGit-Setup-0.3.8-x64.exe` | `KunyaoGit-portable-v0.3.8.zip` | 📁 日志归档 + 🔧 变更面板布局修复 |
| v0.3.4 | `KunyaoGit-Setup-0.3.4-x64.exe` | `KunyaoGit-portable-v0.3.4.zip` | ☁️ 云端仓库搜索 |
| v0.3.3 | `KunyaoGit-Setup-0.3.3-x64.exe` | `KunyaoGit-portable-v0.3.3.zip` | 🔁 更新下载修复 + 网络波动自动重试 |
| v0.3.2 | `KunyaoGit-Setup-0.3.2-x64.exe` | `KunyaoGit-portable-v0.3.2.zip` | 🌲 文件树折叠 |
| v0.3.1 | `KunyaoGit-Setup-0.3.1-x64.exe` | `KunyaoGit-portable-v0.3.1.zip` | 🔧 Gitee 下载源修复（改用 Release 附件直链）|
| v0.3.0 | `KunyaoGit-Setup-0.3.0-x64.exe` | `KunyaoGit-portable-v0.3.0.zip` | 📁 文件管理 + 多远程推送 |
| v0.2.6 | `KunyaoGit-Setup-0.2.6-x64.exe` | `KunyaoGit-portable-v0.2.6.zip` | 🐛 修应用内更新器探活用 GET 替代 HEAD |
| v0.2.5 | `KunyaoGit-Setup-0.2.5-x64.exe` | `KunyaoGit-portable-v0.2.5.zip` | 🎨 三主题切换（暗色 / 深蓝 / 亮色）|
| v0.2.4 | `KunyaoGit-Setup-0.2.4-x64.exe` | `KunyaoGit-portable-v0.2.4.zip` | ⚡ 下载速度优化 3~6 倍（4 路 Range 并发）|
| v0.2.3 | `KunyaoGit-Setup-0.2.3-x64.exe` | `KunyaoGit-portable-v0.2.3.zip` | 🌐 多语言切换（中/英）|
| v0.2.2 | `KunyaoGit-Setup-0.2.2-x64.exe` | `KunyaoGit-portable-v0.2.2.zip` | ✨ 应用内自动更新（基础）|
| v0.2.1 | `KunyaoGit-Setup-0.2.1-x64.exe` | `KunyaoGit-portable-v0.2.1.zip` | 修 IPC handler 重复注册等 bug |
| v0.2.0 | `KunyaoGit-Setup-0.2.0-x64.exe` | `KunyaoGit-portable-v0.2.0.zip` | Release 管理 + CHANGELOG 自动生成 |

GitHub Release 主页：https://github.com/buxiaju/KunyaoGit/releases
Gitee Release 主页：https://gitee.com/buxiaju/KunyaoGit/releases

> 建议始终使用最新版本以获得最新功能与问题修复。
