// Create GitHub Release + stream-upload NSIS installer + portable zip
// v0.6.2 专用模板（基于 publish-v061.cjs，沿用流式上传 + 复用 release 逻辑）
// Usage: GH_TOKEN=xxx node scripts/publish/publish-v062.cjs
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

## v0.6.2 特性
- 🔑 **SSH 按 host 路由**（v0.6.1 单一 key → v0.6.2 多 key + OpenSSH config 接管）
  - **数据模型**：\`AppSettings.sshKeysByHost = { github?: string, gitee?: string }\` 新增；旧 \`sshKeyPath\` 标记 @deprecated 保留为兜底
  - **OpenSSH config 路由**：\`electron/lib/sshConfig.ts\` 把 "Host github.com / Host gitee.com" 块写入 \`~/.ssh/config\`，用 \`# >>> KunyaoGit managed block (do not edit) >>>\` / \`# <<< KunyaoGit managed block <<<\` 标记管理。用户的其他 Host 块原样保留
  - **GitService 改造**：构造时**不**再注入 \`GIT_SSH_COMMAND\` env。\`_sshKeyPath\` 参数保留兼容（仅忽略）。让 OpenSSH config 接管 ssh 行为
  - **新 IPC 通道** 5 个：\`SETTINGS_TEST_SSH_FOR_HOST\` / \`SETTINGS_SSH_GENERATE\` / \`SETTINGS_SSH_READ_PUBKEY\` / \`SETTINGS_SSH_WRITE_CONFIG\` / \`SETTINGS_SSH_READ_CONFIG\`
- 🛠️ **一键生成 SSH 密钥**（设置页「SSH 推送」区）
  - 「生成新密钥」按钮（GitHub / Gitee 行各一个）→ 调 \`ssh-keygen -t ed25519 -f <path> -N "" -C <comment>\`
  - 私钥落在 \`~/.ssh/id_ed25519_github\` / \`id_ed25519_gitee\`，**自动复制公钥**到剪贴板 + 跳转平台链接
- 🔍 **按 host 测试连接**：仅白名单 github.com / gitee.com；成功解析 \`Hi <user>!\`，失败分类 Permission denied / DNS / 超时
- 🧪 **自动化测试** — 572 → **598 例**（+26），29 文件

## v0.6.1 特性
- 🔐 **SSH 推送支持**（解决 github.com:443 受限场景，国内环境必备）
  - **设置项**：\`AppSettings.sshKeyPath\` + \`preferredProtocol\`（auto / https / ssh 三选一）
  - **GitService 构造时**按 sshKeyPath 注入 \`GIT_SSH_COMMAND=ssh -i <key> -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o BatchMode=yes\`
  - **URL 互转**：\`parseRemote\`（electron + src 两镜像强一致）新增 \`detectProtocol\` / \`toSshUrl\` / \`toHttpsUrl\`
  - **新 IPC 通道**：\`git:set-remote-url\` + \`settings:test-ssh\`
  - **设置页新增「SSH 推送」区**：私钥路径 + 协议偏好 + 测试连接
  - **push 失败增强**：\`isNetworkError\` 检测 + \`window.confirm\` 弹窗"是否切换到 SSH？" + \`switchOriginToSsh\` 自动改 remote URL
- 🛡️ **P0 健壮性加固**（4 轮共 12 项）
  - **P0 崩溃兜底**：主进程 uncaughtException / unhandledRejection 落盘（30s 节流）+ 渲染进程 error / unhandledrejection 监听（5s 节流）+ 渲染进程崩溃/无响应监听（render-process-gone / unresponsive / did-fail-load，过滤 ERR_ABORTED）+ 两层 ErrorBoundary（外层包 Router/I18nProvider，内层保 Layout 侧边栏；刻意不依赖 useI18n，Provider 缺席时双层兜底）
  - **P0 安全加固**：协议白名单扩 4 入口 + 仓库根白名单 + 系统目录黑名单 + 配置文件 JSON 损坏自愈 + Markdown sanitize
  - **P0.5/P0.6 补漏**：\`ipc/git.ts\` 32 个 handler 收口走 \`getGitSafe\` + 5 个 file 参数走 \`assertInsideRepo\`
  - **P1 稳定性**：单实例锁 + Git 命令 60s 超时 + settings 加载/保存容错 + 写串行化 + 二进制文件 10MB 上限 + REPO_LIST_RECENT 并行化 + 不可达条目跳过而非删除
  - **P1.5+ 错误脱敏**：\`redactPath\` 把 C:\\Users\\kunyao\\Documents\\xxx\\file.txt 脱敏为 \`~\\xxx\\file.txt\`
  - **P1.7 渲染层错误落盘**：新增 IPC \`app:log-error\`，\`userData/logs/renderer-error.log\`
  - **P1.8 文件树 symlink 环保护**：\`buildFileTree\` 走 realpath 去重

## v0.6.0 特性
- 📎 **Release 附件上传 / 下载 / 删除（GitHub + Gitee 双平台）**
- 🧪 **自动化测试** — 268 → **281 例**（+13）

## v0.5.0 特性
- ⌨️ **Ctrl+P 跳转文件** — 复用命令面板组件，VS Code 式模糊搜索
- 📜 **文件历史 + Blame** — FileHistoryPanel 侧边抽屉

## v0.4.0 特性
- 📊 **底部状态栏** — 三段式布局
- ⌨️ **全局快捷键** — Ctrl/Cmd+Shift+P 命令面板、Ctrl/Cmd+R 刷新、Shift+? 速查表
- 🔍 **命令面板** — VS Code 式 Ctrl+Shift+P 模态
- 📦 **Stash 队列** — Apply / Pop / Show Diff / Drop
- 🍒 **Cherry-pick / Revert** — hover 工具条入口
- 🌐 **PR / MR 创建** — 解析远程 URL + GitHub + Gitee 双平台

## 下载
- **KunyaoGit-Setup-${VERSION}-x64.exe** — NSIS 安装包（推荐）
- **KunyaoGit-portable-v${VERSION}.zip** — 便携版

## 升级
- **v0.2.0 ~ v0.6.1 用户**：启动应用后会自动检查更新并弹窗，点"立即下载并安装"即可。

## 仓库
- GitHub: https://github.com/buxiaju/KunyaoGit
- Gitee:  https://gitee.com/buxiaju/KunyaoGit

## NSIS 安装包下载
由于 Gitee Release 附件配额 1 GB 已用完且 Gitee raw 路径对 .exe 返回 403，NSIS 安装包（86 MB）请从 GitHub 下载：
- https://github.com/buxiaju/KunyaoGit/releases/download/v0.6.2/KunyaoGit-Setup-0.6.2-x64.exe

Gitee 用户也可 \`git clone\` 本仓库后在 \`.release-assets/KunyaoGit-Setup-0.6.2-x64.exe\` 路径获取。

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
