// Create GitHub Release + stream-upload NSIS installer + portable zip
// Usage: GH_TOKEN=xxx node scripts/publish/publish-v025.cjs
//   (未设 GH_TOKEN 时自动从 git remote 'github' 的 URL 里提取 PAT)
// 日志: 同步写入 logs/publish/publish-log.txt

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { execSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const VERSION = require(path.join(ROOT, 'package.json')).version;
const TAG = `v${VERSION}`;
const REPO = 'KunyaoGit';
const OWNER = process.env.GH_OWNER || 'buxiaju';
const LOG_FILE = path.join(ROOT, 'logs', 'publish', 'publish-log.txt');

// ─── 日志 ───
function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n', 'utf-8');
}

// 取 token：优先环境变量，其次从 git remote 'github' URL 提取
let TOKEN = process.env.GH_TOKEN;
if (!TOKEN) {
  try {
    const url = execSync('git remote get-url github', { encoding: 'utf-8' }).trim();
    const m = url.match(/^https:\/\/([^@]+)@github\.com\//);
    if (m) TOKEN = decodeURIComponent(m[1]);
  } catch {}
}
if (!TOKEN) { log('❌ 缺少 GH_TOKEN，也无法从 git remote github 提取'); process.exit(1); }

const INSTALLER = path.join(ROOT, '.release-assets', `KunyaoGit-Setup-${VERSION}-x64.exe`);
const PORTABLE  = path.join(ROOT, '.release-assets', `KunyaoGit-portable-v${VERSION}.zip`);
if (!fs.existsSync(INSTALLER)) { log('❌ missing ' + INSTALLER); process.exit(1); }

const RELEASE_BODY = `# KunyaoGit v${VERSION}

## v0.4.0 特性
- 📊 **底部状态栏** — 三段式布局实时显示：左（仓库名/分支/↑N↓M 同步）、中（已暂存/未暂存/冲突 计数）、右（应用版本号）
- ⌨️ **全局快捷键** — Ctrl/Cmd+Shift+P 打开命令面板、Ctrl/Cmd+R 刷新、Shift+? 显示速查表（输入框内自动让位）
- 🔍 **命令面板** — VS Code 式 Ctrl+Shift+P 模态：4 类 20+ 命令（git/navigation/view/settings），支持模糊搜索 + 键盘导航
- 📦 **Stash 队列** — 折叠面板集成在 ChangesPanel 顶部，提供 Apply（保留）/ Pop（应用+删除）/ Show Diff（弹窗）/ Drop；message 自定义
- 🍒 **Cherry-pick / Revert** — Commit 历史每行 hover 工具条入口，冲突时 toast 引导到变更页（复用现有冲突解决流程）
- 🌐 **PR / MR 创建** — 解析远程 URL（https / ssh / 含凭据）→ 自动拉默认 base 分支 + 默认 title 取 log[0] subject → GitHub（含 draft）+ Gitee 双平台支持
- 👁️ **可发现性改进** — 侧边栏底部「快捷键 ?」+「命令面板 ⇧P」常驻双按钮；「创建 Pull Request」按钮从 hover 提到 BranchPanel 标题行 + RepoPage 顶部工具栏（双入口常驻）
- 🧪 **自动化测试** — 218 例单元 + 组件测试（10 文件，约 3 秒跑完）：Vitest 4 + happy-dom + Testing Library 16；覆盖 parseRemote / parseUnifiedDiff / GitService / i18n / commands / StatusBar / CommandPalette / StashList / CreatePRDialog / useShortcuts

## v0.2.5 新特性
- 🎨 **三主题切换**（暗色 / 深蓝 / 亮色）— 设置页一键切换，整套 UI 实时跟随，包括 Monaco 代码编辑器：
  - **暗色**（默认）—— 原汁原味的 KunyaoGit 暗灰，emerald 品牌色
  - **深蓝** —— 深海 navy 背景，blue 系 primary，沉稳又有色彩
  - **亮色** —— 浅白底，emerald 品牌色，适合白天 / 投影
- 🔧 **零业务代码迁移实现** —— 通过 CSS 变量 + 选择器覆盖，所有现有 \`bg-gray-XXX\` / \`text-gray-XXX\` 等 Tailwind class 不动一行，自动随主题切换。
- 💾 **主题自动持久化** —— 跟语言设置一样存到 electron-store，下次启动保留。

## v0.2.4 新特性（沿用）
- ⚡ **下载速度大幅提升（3~6 倍）** — 应用内更新下载器重构：
  - 多源 HEAD 并行探活，直接跳过 Gitee raw 对大文件返 HTML 的死路，省掉 8s 等超时
  - HTTP Range 多连接分段下载（4 路并发），单连接瓶颈消失
  - keep-alive Agent 复用 TLS / TCP 句柄，免重复握手
  - 进度事件 100ms 节流，避免 IPC 通道被刷爆
  - 单 chunk 失败自动重试（指数退避），网络抖动不再崩整个下载
- 📊 **下载进度条新增实时速率显示**（MB/s）— 让用户直观看到下载是否真在跑、有多快。

## v0.2.3 特性（沿用）
- 🌐 **多语言支持（中/英切换）** — 在设置页或侧边栏底部一键切换界面语言（中文/English），所有 UI 文本均支持国际化，设置自动持久化。
- 📝 **项目文档完善** — 架构文档、API 参考、功能说明、安装指南、用户指南、开发指南、贡献指南等完整体系。
- 🏗 **工程结构优化** — scripts/ 按职责分组（build/publish/debug），release2/ 合并回 release/ 单一输出目录。

## v0.2.2 特性（沿用）
- ✨ **应用内自动更新** — 发现新版本时自动弹窗询问"立即下载并安装"，应用内多源下载（Gitee 优先、GitHub 兜底）带实时进度条，下载完成自动启动安装包并退出应用完成更新。

## 下载
- **KunyaoGit-Setup-${VERSION}-x64.exe** — NSIS 安装包（推荐），双击安装，含专属图标、桌面/开始菜单快捷方式、卸载入口
- **KunyaoGit-portable-v${VERSION}.zip** — 便携版（仅源码 + Electron 入口，需要本机已安装 Node.js 与 Electron）

## 升级
- **v0.2.0 / v0.2.1 / v0.2.2 / v0.2.3 / v0.2.4 用户**：启动应用后会自动检查更新并弹窗，点"立即下载并安装"即可一键更新到 v${VERSION}。也可手动下载安装包覆盖安装。
- 应用内更新会优先从 Gitee 下载（国内快），失败时自动切换 GitHub 兜底。
- 本版本（v0.2.4）开始，下载过程从单连接改为 4 路并发，实测提速 3~6 倍。

## 安装
下载 Setup .exe → 双击运行 → 选择安装目录 → 安装完成。

## 系统要求
- Windows 10 / 11（x64）
- 已安装 Git（应用通过本地 Git 命令行调用，需要 \`git\` 在 PATH 中）

## 特性
- 基础 Git 操作（克隆、提交、推送、拉取、分支、合并、冲突解决）
- GitHub / Gitee 双平台集成（API + PAT 鉴权）
- 远程仓库文件浏览 / 编辑（Monaco Editor）
- 拖拽上传
- 仓库创建 / 删除
- Release 管理
- 内容搜索
- 自动 CHANGELOG 生成
- **应用内自动更新**（启动后静默检测，发现新版本弹窗 → 应用内下载 → 自动安装）
- **多语言切换**（中文 / English）
- **三主题切换**（暗色 / 深蓝 / 亮色）

## 安装 Token
打开应用 → 设置 → 选择 GitHub / Gitee → 填入 Personal Access Token → 测试并保存。

## 仓库
- GitHub: https://github.com/buxiaju/KunyaoGit
- Gitee:  https://gitee.com/buxiaju/KunyaoGit
`;

// ─── HTTP 请求（缓冲模式，用于 JSON API 调用）───
function req(opts, body) {
  return new Promise((resolve, reject) => {
    const headers = { ...opts.headers };
    if (body) headers['Content-Length'] = Buffer.byteLength(body);
    const r = https.request({ ...opts, headers }, (res) => {
      const cs = [];
      res.on('data', (c) => cs.push(c));
      res.on('end', () => {
        const text = Buffer.concat(cs).toString('utf-8');
        let json = null;
        try { json = JSON.parse(text); } catch {}
        resolve({ status: res.statusCode, text, json });
      });
    });
    r.on('error', reject);
    r.setTimeout(120000, () => { r.destroy(new Error('Request timeout (2min)')); });
    if (body) r.write(body);
    r.end();
  });
}

// ─── 流式上传（用于大文件 binary upload，避免一次性读入内存）───
function streamUpload(opts, filePath) {
  return new Promise((resolve, reject) => {
    const fileSize = fs.statSync(filePath).size;
    const stream = fs.createReadStream(filePath);
    const r = https.request({
      hostname: opts.hostname, method: 'POST', path: opts.path,
      headers: {
        ...opts.headers,
        'Content-Length': fileSize,
      },
    }, (res) => {
      const cs = [];
      res.on('data', (c) => cs.push(c));
      res.on('end', () => {
        const text = Buffer.concat(cs).toString('utf-8');
        let json = null;
        try { json = JSON.parse(text); } catch {}
        resolve({ status: res.statusCode, text, json });
      });
    });
    r.on('error', reject);
    r.setTimeout(600000, () => { r.destroy(new Error('Upload timeout (10min)')); });
    stream.pipe(r);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  log('========== GitHub Release 发布开始 ==========');
  log(`版本: ${VERSION}  Tag: ${TAG}`);

  // 1. 检查 release 是否已存在
  log('GET release ' + TAG);
  const tagUrl = new URL(`https://api.github.com/repos/${OWNER}/${REPO}/releases/tags/${TAG}`);
  const exists = await req({
    hostname: tagUrl.hostname, method: 'GET', path: tagUrl.pathname,
    headers: { 'Authorization': 'token ' + TOKEN, 'User-Agent': 'KunyaoGit-publish', 'Accept': 'application/vnd.github+json' },
  });

  let release;
  if (exists.status === 200) {
    log('Release 已存在，复用 ' + exists.json.html_url);
    release = exists.json;
  } else if (exists.status === 404) {
    log('创建 release ' + TAG);
    const body = JSON.stringify({
      tag_name: TAG,
      name: `KunyaoGit v${VERSION}`,
      body: RELEASE_BODY,
      draft: false,
      prerelease: false,
    });
    const r = await req({
      hostname: 'api.github.com', method: 'POST', path: `/repos/${OWNER}/${REPO}/releases`,
      headers: {
        'Authorization': 'token ' + TOKEN, 'User-Agent': 'KunyaoGit-publish',
        'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json',
      },
    }, body);
    if (r.status !== 201) throw new Error('Create failed: ' + r.status + ' ' + r.text);
    release = r.json;
    log('✅ Release 创建 ' + release.html_url);
  } else {
    throw new Error('GET release failed: ' + exists.status + ' ' + exists.text);
  }

  // 2. 更新 body
  const body = JSON.stringify({ body: RELEASE_BODY });
  const upd = await req({
    hostname: 'api.github.com', method: 'PATCH', path: `/repos/${OWNER}/${REPO}/releases/${release.id}`,
    headers: {
      'Authorization': 'token ' + TOKEN, 'User-Agent': 'KunyaoGit-publish',
      'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json',
    },
  }, body);
  if (upd.status !== 200) throw new Error('Update body failed: ' + upd.status + ' ' + upd.text);
  release = upd.json;
  log('✅ body 已更新');

  // 3. 流式上传 assets
  const existingNames = new Set((release.assets || []).map(a => a.name));
  log('已有 assets: ' + ([...existingNames].join(', ') || '(空)'));

  for (const f of [INSTALLER, PORTABLE].filter(p => fs.existsSync(p))) {
    const fileName = path.basename(f);
    if (existingNames.has(fileName)) {
      log('跳过（已存在）: ' + fileName);
      continue;
    }
    const fileSize = fs.statSync(f).size;
    log(`流式上传 ${fileName} (${(fileSize/1024/1024).toFixed(2)} MB)`);
    const baseUrl = release.upload_url.split('{')[0];
    const u = new URL(baseUrl);
    u.searchParams.set('name', fileName);
    const r2 = await streamUpload({
      hostname: u.hostname, path: u.pathname + u.search,
      headers: {
        'Authorization': 'token ' + TOKEN, 'User-Agent': 'KunyaoGit-publish',
        'Accept': 'application/vnd.github+json', 'Content-Type': 'application/octet-stream',
      },
    }, f);
    if (r2.status !== 201) throw new Error('Upload failed: ' + r2.status + ' ' + r2.text);
    log('✅ 上传成功: ' + r2.json.browser_download_url);
    await sleep(500);
  }

  log('🎉 GitHub 发布完成: ' + release.html_url);
  log('========== GitHub Release 发布结束 ==========\n');
}

main().catch(e => { log('[err] ' + e.message); process.exit(1); });
