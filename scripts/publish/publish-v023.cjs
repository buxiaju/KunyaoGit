// Create GitHub Release + stream-upload NSIS installer + portable zip
// Usage: GH_TOKEN=xxx node scripts/publish/publish-v023.cjs
//   (未设 GH_TOKEN 时自动从 git remote 'github' 的 URL 里提取 PAT)
// 日志: 同步写入项目根目录 publish-log.txt

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { execSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const VERSION = require(path.join(ROOT, 'package.json')).version;
const TAG = `v${VERSION}`;
const REPO = 'KunyaoGit';
const OWNER = process.env.GH_OWNER || 'buxiaju';
const LOG_FILE = path.join(ROOT, 'publish-log.txt');

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

## v0.3.4 新特性
- 🔍 **云端仓库搜索** — 在 GitHub / Gitee 仓库页顶部栏新增搜索框：
  - 输入即搜（防抖 300ms），**GitHub** 走官方 Search API 全平台搜索任意仓库
  - **Gitee** 官方仓库搜索 API 已失效（恒返回空），自动降级为「我的仓库」本地过滤（按名称/描述匹配），保证功能可用
  - 搜索结果显示数量、空结果提示，点 ✕ 或清空恢复「我的仓库」列表；结果卡片支持打开浏览 / 克隆 / 删除

## v0.3.3 修复（应用内更新下载容错）
- 🔧 **下载失败自动重试** — 实测国内网络对 gitee.com 的连接**高度间歇**（DNS 被劫持到百度云节点，同一分钟内可能连续超时又连续正常）：
  - 每个下载源探活最多尝试 **2 次**（8s 超时快速失败）
  - 两个源全部失败后**自动整轮重试最多 6 轮**（约 2 分钟），轮间显示「网络波动，第 N/6 轮重试…」提示
  - 下载中断自动**同源重试 2 次**，不再一次失败就放弃
  - 之前：单次探活失败直接报「所有下载源都失败」，撞上网络坏窗口必失败

## v0.3.2 优化
- 📂 **文件树默认全部折叠** — 进入仓库「文件」页时所有目录默认收起，界面更清爽，点击箭头展开；此前默认展开前两层。

## v0.3.1 修复
- 🔧 **修复应用内更新下载失败**（"所有下载源都失败"）：
  - Gitee 下载源从 \`raw/\` 直链改为 **Gitee Release 附件下载**（\`releases/download/vX.Y.Z/...\`）——Gitee raw 对 >50MB 大文件直接返回 403，导致 86MB 安装包永远下载失败；Release 附件走官方 CDN（foruda.gitee.com），实测 2MB/s 完整下载且 SHA256 校验一致
  - **新增连接建立阶段超时**——之前 \`req.setTimeout\` 只对已连接 socket 的空闲计时，若 TCP 握手卡死（如 github.com 被墙）会无限挂起；现在 15s（探活）/ 30s（下载）内连不上立即切换下一个源
  - 注：本版修复自 v0.3.1 起生效。v0.2.6 / v0.3.0 用户请**手动下载安装 v0.3.1**（应用内更新用的还是旧下载地址），安装后后续版本可正常应用内升级。

## v0.3.0 新特性
- 📁 **本地文件管理** — 仓库「文件」页支持对本地仓库直接增删改：
  - 文件树工具栏一键**新建文件 / 新建文件夹**，右键菜单可**新建 / 重命名 / 删除 / 打开编辑**
  - 新建文件自动在 Monaco 中打开；操作后自动刷新 git 状态，「变更」页立即可见
  - 删除 / 重命名自动同步 git status，正在编辑的文件随重命名跟随新路径
- 🚀 **多远程推送（GitHub / Gitee）** — 顶部 **Push 按钮下拉选择要推送的远程**（github / gitee / origin…），一键推送到指定平台并自动建立 upstream；「提交并推送」同样支持选择远程
- 🏠 **仓库入口优化** — 打开 / 克隆仓库后**自动进入仓库页**；首页新增「当前已打开仓库」入口卡片，侧边栏仓库卡片也可点击随时返回仓库
- 🔄 **保存即刷新** — 编辑器保存文件后自动刷新工作区状态，改完立刻能在「变更」页暂存提交
- 🔧 **构建修复** — 移除 package.json 的 UTF-8 BOM，修复 Vite/PostCSS 构建失败问题

## v0.2.6 修复（沿用）
- 🔧 应用内更新器探活改用 GET 替代 HEAD，兼容更多 CDN；探活超时提到 15s；错误信息汇总所有源失败原因。

## v0.2.5 特性（沿用）
- 🎨 **三主题切换**（暗色 / 深蓝 / 亮色）— 设置页一键切换，整套 UI 实时跟随，包括 Monaco 代码编辑器；主题自动持久化。

## v0.2.4 新特性（沿用）
- ⚡ **下载速度大幅提升（3~6 倍）** — 应用内更新下载器重构：多源探活 + HTTP Range 4 路并发 + keep-alive 复用 + 失败指数退避重试；进度条新增实时速率显示（MB/s）。

## v0.2.3 特性（沿用）
- 🌐 **多语言支持（中/英切换）** — 在设置页或侧边栏底部一键切换界面语言（中文/English），所有 UI 文本均支持国际化，设置自动持久化。
- 📝 **项目文档完善** — 架构文档、API 参考、功能说明、安装指南、用户指南、开发指南、贡献指南等完整文档体系。
- 🏗 **工程结构优化** — scripts/ 按职责分组（build/publish/debug），release2/ 合并回 release/ 单一输出目录。

## v0.2.2 特性（沿用）
- ✨ **应用内自动更新** — 发现新版本时自动弹窗询问"立即下载并安装"，应用内多源下载（Gitee 优先、GitHub 兜底）带实时进度条，下载完成自动启动安装包并退出应用完成更新。

## 下载
- **KunyaoGit-Setup-${VERSION}-x64.exe** — NSIS 安装包（推荐），双击安装，含专属图标、桌面/开始菜单快捷方式、卸载入口
- **KunyaoGit-portable-v${VERSION}.zip** — 便携版（仅源码 + Electron 入口，需要本机已安装 Node.js 与 Electron）

## 升级
- **v0.2.0 ~ v0.2.6 用户**：启动应用后会自动检查更新并弹窗，点"立即下载并安装"即可一键更新到 v${VERSION}。也可手动下载安装包覆盖安装。
- 应用内更新会优先从 Gitee 下载（国内快），失败时自动切换 GitHub 兜底。

## 安装
下载 Setup .exe → 双击运行 → 选择安装目录 → 安装完成。

## 系统要求
- Windows 10 / 11（x64）
- 已安装 Git（应用通过本地 Git 命令行调用，需要 \`git\` 在 PATH 中）

## 特性
- 基础 Git 操作（克隆、提交、推送、拉取、分支、合并、冲突解决）
- GitHub / Gitee 双平台集成（API + PAT 鉴权）
- **本地文件管理（新建 / 重命名 / 删除 / Monaco 编辑）**
- **多远程推送（Push 下拉选择 GitHub / Gitee）**
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
