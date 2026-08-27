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

const RELEASE_BODY = `# KunyaoGit v0.6.3

## v0.6.3 特色 — 🐛 真实使用 bug 集中修（7 项）

v0.6.2 上线后用截图反馈 + 实际点击暴露的 7 个 bug 集中修：

- 🔑 **\`generateSshKey\` 空 keyPath 误 throw**（v0.6.2 真实使用 bug）
  - 原来后端对前端传的 \`keyPath: ''\` 直接抛 \`'keyPath 不能为空'\`
  - \`GenerateSshKeyInput.keyPath\` 改可选 + 新增 \`host?: 'github.com' | 'gitee.com'\`
  - 空 keyPath + 有 host → 自动 \`~/.ssh/id_ed25519_<github|gitee>\`（自动 \`mkdir -p ~/.ssh\`）
  - 空 keyPath + 无 host → throw 明确错误（指明要传 host）
  - 显式 keyPath 不受影响
- 🛠️ **SSH 设置区 UI 精简**
  - 删"SSH 私钥路径（兜底）"输入框（按 host 已有 GitHub / Gitee 私钥，兜底字段冗余）
  - 修复"Git 可执行文件路径"的"选择"按钮：\`window.prompt()\` 在 Electron 渲染层默认禁用，改用 \`window.gitgui.dialog.showOpen({ properties: ['openFile'], filters: [{name: 'Git', extensions: ['exe','cmd','bat']}, ...] })\` 弹系统文件选择器
- 🗂️ **\`listSshKeys\` / \`deleteSshKey\`**（解决"重复生成密钥没入口删"）
  - 后端扫 \`~/.ssh/id_*(ed25519|rsa|ecdsa|dsa)\` + 配对 \`.pub\` → 算 fingerprint，按文件名后缀推断 host
  - 前端 SSH 设置区顶部加"已存在的 SSH 私钥"卡片：每行文件名 + host badge（GitHub/Gitee 紫/橙）+ fingerprint + ✓使用此 key + 🗑删除（带 confirm 弹窗）
  - 删除安全护栏：路径必须在 \`~/.ssh/\` 下 + 文件名必须 \`id_*\` 前缀
- 🎨 **\`parseSshResult\` 漏 stderr**（GitHub ssh -T 行为）
  - GitHub 的 \`ssh -T git@github.com\` 成功消息走 **stderr**（OpenSSH 行为），原 parseSshResult 只查 stdout → 匹配失败 → 走到 fallback error 整段英文 \`Hi buxiaju! ...shell access.\` 露馅
  - 改成 stdout + stderr 合并检测成功标记
- 🎨 **SSH 输出剥 ANSI 颜色码**
  - OpenSSH 交互式终端会加 \`\x1b[36;01m...\`，原样显示用户看到 \`[36;01m不侠居(@buxiaju)[0m\`
  - 新增 \`stripAnsi(s)\` 纯函数统一剥
- 🔧 **拆 \`testResult\` 状态**（解决"测试 Gitee 连接"结果在 Git 路径下方也显示）
- 📦 **\`writeSshConfigFile\` dev ESM \`require\` 报错**
  - 原来 \`require('../lib/sshConfig')\` —— CJS
  - dev 模式 main.js 是 ESM（vite-plugin-electron 编译），ESM 没有 \`require\`
  - 改用文件顶部 \`import { writeSshConfig } from '../lib/sshConfig'\`
- 🖼️ **生成结果卡片位置**（避免与"写入 ~/.ssh/config"按钮视觉混淆）
  - 拆成两个 host 条件卡片放在对应 host 的 Field 下方

### 自动化测试 — 598 → **631 例全绿**（+33 例：stripAnsi × 4 + parseSshResult ANSI/stderr × 4 + listSshKeys × 10 + deleteSshKey × 6 等）

完整 CHANGELOG：https://github.com/buxiaju/KunyaoGit/blob/master/CHANGELOG.md

## v0.6.2 特色 — 🎉 SSH 按 host 路由
- **数据模型**：\`AppSettings.sshKeysByHost = { github?: string, gitee?: string }\` 新增；旧 \`sshKeyPath\` 标记 @deprecated
- **OpenSSH config 路由**：\`electron/lib/sshConfig.ts\` 把 "Host github.com / Host gitee.com" 块写入 \`~/.ssh/config\`
- **GitService 改造**：构造时**不**再注入 \`GIT_SSH_COMMAND\` env
- **新 IPC 通道** 5 个：\`SETTINGS_TEST_SSH_FOR_HOST\` / \`SETTINGS_SSH_GENERATE\` / \`SETTINGS_SSH_READ_PUBKEY\` / \`SETTINGS_SSH_WRITE_CONFIG\` / \`SETTINGS_SSH_READ_CONFIG\`
- 🛠️ **一键生成 SSH 密钥**（设置页「SSH 推送」区）
- 🔍 **按 host 测试连接**（仅白名单 github.com / gitee.com）
- 📋 **写入 \`~/.ssh/config\`** 一键按钮
- 🛡️ **新增纯函数** \`getEffectiveKeyForHost(host, keysByHost, fallback)\` + \`detectRemoteHost(url)\`

## v0.6.1 特色 — 🚀 SSH 推送支持
- **GitService 构造时**根据 sshKeyPath 注入 \`GIT_SSH_COMMAND=ssh -i <key> -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o BatchMode=yes\`
- **URL 互转**：\`parseRemote\`（electron + src 一致）新增 \`detectProtocol\` / \`toSshUrl\` / \`toHttpsUrl\`
- **新 IPC 通道**：\`git:set-remote-url\` + \`settings:test-ssh\`
- **设置页新增「SSH 推送」区**：私钥路径 + 协议偏好 + 测试连接
- **push 失败增强**：\`isNetworkError\` 检测 + \`window.confirm\` 弹窗"是否切换到 SSH"+ \`switchOriginToSsh\` 自动改 remote URL
- 🛡️ **P0 健壮性加固**（共 12 项）
  - **P0 崩溃兜底**：主进程 uncaughtException / unhandledRejection 托盘；渲染进程 error / unhandledrejection 监听；渲染进程崩溃/无响应监听（render-process-gone / unresponsive / did-fail-load，过滤 ERR_ABORTED）；双层 ErrorBoundary
  - **P0 安全加固**：协议白名单 + 仓库根白名单 + 系统目录黑名单 + 配置文件 JSON 损坏自愈 + Markdown sanitize
  - **P0.5/P0.6 补盲**：\`ipc/git.ts\` 32 个 handler 加 \`getGitSafe\` + 5 个 file 参数加 \`assertInsideRepo\`
  - **P1 稳定性**：单实例锁 + Git 命令 60s 超时 + settings 加载/保存容错 + 写串行化 + 二进制文件 10MB 上限 + REPO_LIST_RECENT 并行 + 不可达条目跳过而非删除
  - **P1.5+ 错误脱敏**：\`redactPath\` 把 \`C:\\Users\\kunyao\\Documents\\xxx\\file.txt\` 脱敏为 \`~\\xxx\\file.txt\`
  - **P1.7 渲染层错误落盘**：新增 IPC \`app:log-error\`，写 \`userData/logs/renderer-error.log\`
  - **P1.8 文件树 symlink 环保护**：\`buildFileTree\` 加 realpath 去重

## v0.6.0 特色
- 🏷️ **Release 附件上传 / 下载 / 删除**（GitHub + Gitee 双平台）

## v0.5.0 特色
- 🔍 **Ctrl+P 跳转文件** — 复用命令面板组件
- 🐐 **文件历史 + Blame** — FileHistoryPanel

## v0.4.0 特色
- 🏳️ **底部状态栏** — 三段式布局
- ⌨️ **全局快捷键** — Ctrl/Cmd+Shift+P 命令面板、Ctrl/Cmd+R 刷新、Shift+? 速查表
- 🔍 **命令面板** — VS Code 式 Ctrl+Shift+P 模式
- 🍝 **Stash 队列** — Apply / Pop / Show Diff / Drop
- 🕹️ **Cherry-pick / Revert** — hover 工具条
- 🏭 **PR / MR 创建** — 解析远程 URL + GitHub + Gitee 双平台

## 下载
- **KunyaoGit-Setup-0.6.3-x64.exe** — NSIS 安装包（推荐）
- **KunyaoGit-portable-v0.6.3.zip** — 便携版

## 升级
- **v0.2.0 ~ v0.6.2 用户**：启动应用后会自动检查更新并弹窗，点"立即下载并安装"即可。

## 仓库
- GitHub: https://github.com/buxiaju/KunyaoGit
- Gitee:  https://gitee.com/buxiaju/KunyaoGit

## 下载说明
- **GitHub Release / Gitee Release 两边都已附带完整安装包**（NSIS 86 MB + 便携版 zip），就近下载即可：
  - GitHub: https://github.com/buxiaju/KunyaoGit/releases/download/v0.6.3/KunyaoGit-Setup-0.6.3-x64.exe
  - Gitee:  https://gitee.com/buxiaju/KunyaoGit/releases/tag/v0.6.3
- 旧版用户直接用应用内「自动检查更新」一键升级即可，无需手动下载。

> 注：v0.6.3 起 NSIS 安装包**不再随仓库提交**到 \`.release-assets/\`（Gitee 仓库 git 体积已近 819MB 上限），\`git clone\` 不会包含安装包，请从上方 Release 链接下载。
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
