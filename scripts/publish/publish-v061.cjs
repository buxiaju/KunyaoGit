// Create GitHub Release + stream-upload NSIS installer + portable zip
// v0.6.1 专用模板（基于 publish-v060.cjs，沿用流式上传 + 复用 release 逻辑）
// Usage: GH_TOKEN=xxx node scripts/publish/publish-v061.cjs
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

const INSTALLER = path.join(ROOT, 'release', `KunyaoGit-Setup-${VERSION}-x64.exe`);
const PORTABLE  = path.join(ROOT, 'release', `KunyaoGit-portable-v${VERSION}.zip`);
if (!fs.existsSync(INSTALLER)) { log('❌ missing ' + INSTALLER); process.exit(1); }

const RELEASE_BODY = `# KunyaoGit v${VERSION}

## v0.6.1 特性
- 🔐 **SSH 推送支持**（解决 github.com:443 受限场景，国内环境必备）
  - **设置项**：\`AppSettings.sshKeyPath\` + \`preferredProtocol\`（auto / https / ssh 三选一）
  - **GitService 构造时**按 sshKeyPath 注入 \`GIT_SSH_COMMAND=ssh -i <key> -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o BatchMode=yes\`，push / fetch / pull 自动走指定 key
  - **URL 互转**：\`parseRemote\`（electron + src 两镜像强一致）新增 \`detectProtocol\` / \`toSshUrl\` / \`toHttpsUrl\`
  - **新 IPC 通道**：\`git:set-remote-url\`（一键改 origin）+ \`settings:test-ssh\`（探测 git@github.com）
  - **设置页新增「SSH 推送」区**：私钥路径 + 协议偏好 + 测试连接
  - **push 失败增强**：\`isNetworkError\` 检测 \`Failed to connect to ... port 443\` 类错误，\`window.confirm\` 弹窗"是否切换到 SSH？"，确认后 \`switchOriginToSsh\` 自动改 remote URL
- 🛡️ **P0 健壮性加固**（4 轮共 12 项）
  - **P0 崩溃兜底**：主进程 uncaughtException / unhandledRejection 落盘（30s 节流）+ 渲染进程 error / unhandledrejection 监听（5s 节流）+ 渲染进程崩溃/无响应监听（render-process-gone / unresponsive / did-fail-load，过滤 ERR_ABORTED）+ 两层 ErrorBoundary（外层包 Router/I18nProvider，内层保 Layout 侧边栏；刻意不依赖 useI18n，Provider 缺席时双层兜底）
  - **P0 安全加固**：协议白名单扩 4 入口（WHATWG URL 解析挡 java\\\\nscript: / 大小写混写）+ 仓库根白名单 + 系统目录黑名单（path.relative 而非 startsWith，防 C:\\\\repo-evil 命中 C:\\\\repo）+ 配置文件 JSON 损坏自愈（备份为 .corrupt-<时间戳>.json 后重建，目录不可写降级内存 store）+ Markdown sanitize（DOMPurify + 启动自检探针 + 失效降级，实测 3.4.14 在 happy-dom 下静默失效的发现）
  - **P0.5/P0.6 补漏**：\`ipc/git.ts\` 32 个 handler 收口走 \`getGitSafe\`（含 \`Map<repoPath, GitService>\` 缓存 + simple-git 启动异常 try/catch 兜成 Result）+ 5 个 file 参数（blame / fileLog / fileDiff / diffFile / readConflictFile）走 \`assertInsideRepo\` 仓库内校验
  - **P1 稳定性**：单实例锁（git requestSingleInstanceLock + second-instance 唤起，根因：单实例锁之前并发写 gitgui-settings.json 会产生半截 JSON 触发 P0 损坏自愈）+ Git 命令 60s 超时 + Block timeout reached 翻译中文 + settings 加载/保存容错（失败也置 loaded:true 不卡 loading）+ settings 写串行化（writeQueue: Promise chain，单进程内并发不再丢更新）+ 二进制文件读取 10MB 上限 + REPO_LIST_RECENT 并行化（Promise.all 而非串行 fs.access）+ 不可达条目跳过而非删除（移动硬盘未插时不让用户记录莫名消失）
  - **P1.5+ 错误脱敏**：\`redactPath\` 把 C:\\\\Users\\\\kunyao\\\\Documents\\\\xxx\\\\file.txt 脱敏为 \`~\\\\xxx\\\\file.txt\`（保留最后两段：文件名 + 直接父目录），GitService.describeError + globalErrorHandler.describeReason 双层脱敏，toast / 日志 / 远程 API 错误回显统一处理
  - **P1.7 渲染层错误落盘**：新增 IPC \`app:log-error\`，\`userData/logs/renderer-error.log\`（与 main-error.log 独立，1MB 轮转，16KB 单条上限，失败静默）
  - **P1.8 文件树 symlink 环保护**：\`buildFileTree\` 走 realpath 去重
- 🛡️ **错误消息路径脱敏**（\`electron/lib/safePath.ts\` 的 \`redactPath\`）
  - Windows 盘符路径 \`C:\\\\Users\\\\kunyao\\\\Documents\\\\xxx\\\\file.txt\` → \`~\\\\xxx\\\\file.txt\`（保留最后两段）
  - POSIX 用户路径 \`/Users/bob/proj/foo.ts\` → \`~/proj/foo.ts\`
  - UNC 长路径前缀 \`\\\\\\\\?\\\\C:\\\\...\` → \`<long-path>\\\\...\`
  - WSL 路径 \`\\\\\\\\wsl$\\\\\\\\Ubuntu\\\\...\` → \`<wsl>\\\\...\`

## v0.6.0 特性
- 📎 **Release 附件上传 / 下载 / 删除（GitHub + Gitee 双平台）** — 创建 release 时可同时选择多个本地附件，已发布 release 可在详情抽屉继续上传 / 下载 / 删除附件
  - **GitHub**：\`oct.repos.uploadReleaseAsset\` + \`deleteReleaseAsset\`，单文件软限 2GB
  - **Gitee**：\`POST .../releases/{id}/attach_files\` multipart + \`DELETE .../attach_files/{id}\`，单文件 ≤ 100MB
- ✏️ **Release 编辑** — 详情抽屉可改 name / body / prerelease；GitHub 支持 draft ↔ release 切换，Gitee 部分支持
- 🎨 **Release 详情抽屉** — 640px 右侧抽屉，body 用 \`marked\` 渲染 Markdown + 附件完整列表
- 🔍 **Release 列表搜索** — 顶部搜索框按 tag / name 实时过滤
- 🧪 **自动化测试** — 268 → **281 例**（+13）

## v0.5.0 特性
- ⌨️ **Ctrl+P 跳转文件** — 复用命令面板组件，VS Code 式模糊搜索
- 📜 **文件历史 + Blame** — FileHistoryPanel 侧边抽屉，\`git log --follow\` 跟踪重命名 + \`git blame --line-porcelain\` 解析

## v0.4.0 特性
- 📊 **底部状态栏** — 三段式布局实时显示
- ⌨️ **全局快捷键** — Ctrl/Cmd+Shift+P 命令面板、Ctrl/Cmd+R 刷新、Shift+? 速查表
- 🔍 **命令面板** — VS Code 式 Ctrl+Shift+P 模态
- 📦 **Stash 队列** — Apply / Pop / Show Diff / Drop
- 🍒 **Cherry-pick / Revert** — hover 工具条入口
- 🌐 **PR / MR 创建** — 解析远程 URL + GitHub + Gitee 双平台

## 下载
- **KunyaoGit-Setup-${VERSION}-x64.exe** — NSIS 安装包（推荐）

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

// ─── 流式上传（用于大文件 binary upload）───
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
