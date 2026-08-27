// Create / Update Gitee Release: body + installer asset upload
// Usage: node scripts/publish/update-gitee-body.cjs
//   或 GT_TOKEN=xxx node scripts/publish/update-gitee-body.cjs
// 日志: 同步写入 logs/publish/publish-log.txt

const https = require('node:https');
const path = require('node:path');
const fs = require('node:fs');
const ROOT = path.resolve(__dirname, '..', '..');
const VERSION = require(path.join(ROOT, 'package.json')).version;
const TAG = `v${VERSION}`;
const GT_TOKEN = process.env.GT_TOKEN || 'a0d56558c30d9a083fe33282b946cf95';
const GT_OWNER = 'buxiaju';
const REPO = 'KunyaoGit';
const LOG_FILE = path.join(ROOT, 'logs', 'publish', 'publish-log.txt');

// 安装包路径
const INSTALLER = path.join(ROOT, 'release', `KunyaoGit-Setup-${VERSION}-x64.exe`);
const PORTABLE  = path.join(ROOT, 'release', `KunyaoGit-portable-v${VERSION}.zip`);

// ─── 日志 ───
function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n', 'utf-8');
}

const RELEASE_BODY = `# KunyaoGit v0.6.3

## v0.6.3 特性 — 🐛 真实使用 bug 集中修（8 项）

v0.6.2 上线后用截图反馈 + 实际点击暴露的 8 个 bug 集中修：

- 🔑 **\`generateSshKey\` 空 keyPath 误 throw**
  - 原来后端对前端传的 \`keyPath: ''\` 直接抛 \`'keyPath 不能为空'\`
  - \`GenerateSshKeyInput.keyPath\` 改可选 + 新增 \`host?: 'github.com' | 'gitee.com'\`
  - 空 keyPath + 有 host → 自动 \`~/.ssh/id_ed25519_<github|gitee>\`（自动 \`mkdir -p ~/.ssh\`）
  - 空 keyPath + 无 host → throw 明确错误
  - 显式 keyPath 不受影响
- 🛠️ **SSH 设置区 UI 精简**
  - 删"SSH 私钥路径（兜底）"输入框
  - 修复"Git 可执行文件路径"选择按钮：\`window.prompt()\` 不可用，改用 \`dialog.showOpen\` 弹系统文件选择器
- 🗂️ **\`listSshKeys\` / \`deleteSshKey\`**（解决"重复生成密钥没入口删"）
  - 后端扫 \`~/.ssh/id_*(ed25519|rsa|ecdsa|dsa)\` + 配对 \`.pub\` → 算 fingerprint，按文件名后缀推断 host
  - 前端 SSH 设置区顶部加"已存在的 SSH 私钥"卡片：每行文件名 + host badge + fingerprint + ✓使用此 key + 🗑删除（带 confirm）
  - 删除安全护栏：路径必须在 \`~/.ssh/\` 下 + 文件名必须 \`id_*\` 前缀
- 🎨 **\`parseSshResult\` 漏 stderr**（GitHub ssh -T 行为）
  - GitHub 成功消息走 stderr，原 parseSshResult 只查 stdout → 走 fallback error 整段英文
  - 合并 stdout + stderr 检测
- 🎨 **SSH 输出剥 ANSI 颜色码**
  - 新增 \`stripAnsi(s)\` 纯函数统一剥 \`\x1b[36;01m...\` 之类
- 🔧 **拆 \`testResult\` 状态**（解决"测试 Gitee 连接"结果在 Git 路径下方也显示）
- 📦 **\`writeSshConfigFile\` dev ESM \`require\` 报错**
  - dev 模式 main.js 是 ESM，\`require('../lib/sshConfig')\` 抛 \`Cannot find module\`
  - 改用文件顶部 static \`import\`
- 🖼️ **生成结果卡片位置**（避免与"写入 ~/.ssh/config"按钮视觉混淆）

### 自动化测试 — 598 → **631 例全绿**（+33 例）

## v0.6.2 特性
- 🔑 **SSH 按 host 路由**（v0.6.1 单一 key → v0.6.2 多 key + OpenSSH config 接管）
  - **数据模型**：\`AppSettings.sshKeysByHost = { github?: string, gitee?: string }\` 新增；旧 \`sshKeyPath\` 标记 @deprecated 保留为兜底
  - **OpenSSH config 路由**：\`electron/lib/sshConfig.ts\` 把 "Host github.com / Host gitee.com" 块写入 \`~/.ssh/config\`
  - **GitService 改造**：构造时**不**再注入 \`GIT_SSH_COMMAND\` env
- 🛠️ **一键生成 SSH 密钥**（设置页「SSH 推送」区）
- 🔍 **按 host 测试连接**：仅白名单 github.com / gitee.com
- 📋 **写入 \`~/.ssh/config\`** 一键按钮
- 🧪 **自动化测试** — 572 → **598 例**（+26），29 文件

## v0.6.1 特性
- 🔐 **SSH 推送支持**（解决 github.com:443 受限场景）
  - **设置项**：\`AppSettings.sshKeyPath\` + \`preferredProtocol\`
  - **GitService 构造时**按 sshKeyPath 注入 \`GIT_SSH_COMMAND\`
  - **URL 互转**：\`parseRemote\` 新增 \`detectProtocol\` / \`toSshUrl\` / \`toHttpsUrl\`
  - **新 IPC 通道**：\`git:set-remote-url\` + \`settings:test-ssh\`
  - **push 失败增强**：\`isNetworkError\` 检测 + confirm 弹窗"是否切换到 SSH"
- 🛡️ **P0 健壮性加固**（共 12 项）
  - **P0 崩溃兜底**：主进程 uncaughtException / unhandledRejection 托盘；渲染进程 error / unhandledrejection 监听；渲染进程崩溃/无响应监听
  - **P0 安全加固**：协议白名单 + 仓库根白名单 + 系统目录黑名单
  - **P0.5/P0.6 补盲**：\`ipc/git.ts\` 32 个 handler 加 \`getGitSafe\` + 5 个 file 参数加 \`assertInsideRepo\`
  - **P1 稳定性**：单实例锁 + Git 命令 60s 超时 + settings 加载/保存容错 + 写串行化
  - **P1.5+ 错误脱敏**：\`redactPath\` 把绝对路径脱敏为 \`~\\xxx\\file.txt\`
  - **P1.7 渲染层错误落盘**：新增 IPC \`app:log-error\`
  - **P1.8 文件树 symlink 环保护**：\`buildFileTree\` 走 realpath 去重

## v0.6.0 特性
- 📎 **Release 附件上传 / 下载 / 删除（GitHub + Gitee 双平台）**
- 🧪 **自动化测试** — 268 → **281 例**（+13）

## v0.5.0 特性
- 🔍 **Ctrl+P 跳转文件**
- 🐐 **文件历史 + Blame**

## v0.4.0 特性
- 🏳️ **底部状态栏** — 三段式布局
- ⌨️ **全局快捷键** — Ctrl/Cmd+Shift+P 命令面板
- 🔍 **命令面板** — VS Code 式
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
- **本页附件已包含完整安装包**：\`KunyaoGit-Setup-0.6.3-x64.exe\`（NSIS 86 MB）+ \`KunyaoGit-portable-v0.6.3.zip\`（便携版），直接点附件下载即可。
- GitHub 镜像下载：https://github.com/buxiaju/KunyaoGit/releases/download/v0.6.3/KunyaoGit-Setup-0.6.3-x64.exe
- 旧版用户直接用应用内「自动检查更新」一键升级即可，无需手动下载。

> 注：v0.6.3 起 NSIS 安装包**不再随仓库提交**到 \`.release-assets/\`（Gitee 仓库 git 体积已近 819MB 上限），\`git clone\` 不会包含安装包，请从本页附件下载。
`;

// ─── HTTP 请求（缓冲模式，用于 JSON API 调用）───
function req(opts, body, contentType) {
  return new Promise((resolve, reject) => {
    const headers = { ...opts.headers };
    if (contentType) headers['Content-Type'] = contentType;
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

// ─── multipart/form-data 构造（用于 Gitee attach_files 上传）───
function buildMultipartFile(filePath, fieldName) {
  const boundary = '----KunyaoGitBoundary' + Math.random().toString(16).slice(2);
  const fileName = path.basename(filePath);
  const fileBuf = fs.readFileSync(filePath);
  const parts = [];
  parts.push(Buffer.from(`--${boundary}\r\n`));
  parts.push(Buffer.from(`Content-Disposition: form-data; name="${fieldName}"; filename="${fileName}"\r\n`));
  parts.push(Buffer.from('Content-Type: application/octet-stream\r\n\r\n'));
  parts.push(fileBuf);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

// ─── 流式上传（大文件用，避免内存峰值）───
function streamUploadMultipart(opts, filePath, fieldName) {
  return new Promise((resolve, reject) => {
    const boundary = '----KunyaoGitBoundary' + Math.random().toString(16).slice(2);
    const fileName = path.basename(filePath);
    const fileSize = fs.statSync(filePath).size;

    // 构造 multipart body 各部分
    const head = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${fieldName}"; filename="${fileName}"\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n`
    );
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
    const totalSize = head.length + fileSize + tail.length;

    const r = https.request({
      hostname: opts.hostname, method: 'POST', path: opts.path,
      headers: {
        ...opts.headers,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': totalSize,
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

    // 先写 head，再 pipe 文件流，最后写 tail
    r.write(head);
    const stream = fs.createReadStream(filePath);
    stream.on('end', () => { r.write(tail); r.end(); });
    stream.on('error', reject);
    stream.pipe(r, { end: false });
  });
}

async function main() {
  log('========== Gitee Release 发布开始 ==========');
  log(`版本: ${VERSION}  Tag: ${TAG}`);

  // 1. 查找 release（per_page=100 避免被默认 20 截断找不到之前的 release）
  const list = await req({
    hostname: 'gitee.com', method: 'GET',
    path: `/api/v5/repos/${GT_OWNER}/${REPO}/releases?access_token=${GT_TOKEN}&per_page=100`,
    headers: { 'User-Agent': 'KunyaoGit-publish' },
  });
  let r = (list.json || []).find(x => x.tag_name === TAG);
  // 兜底：分页再查一次
  if (!r) {
    const list2 = await req({
      hostname: 'gitee.com', method: 'GET',
      path: `/api/v5/repos/${GT_OWNER}/${REPO}/releases?access_token=${GT_TOKEN}&per_page=100&page=2`,
      headers: { 'User-Agent': 'KunyaoGit-publish' },
    });
    r = (list2.json || []).find(x => x.tag_name === TAG);
  }

  if (!r) {
    // 创建 release
    log('创建 Gitee release ' + TAG);
    const body = JSON.stringify({
      tag_name: TAG,
      name: `KunyaoGit v${VERSION}`,
      body: RELEASE_BODY,
      target_commitish: 'master',
    });
    const c = await req({
      hostname: 'gitee.com', method: 'POST',
      path: `/api/v5/repos/${GT_OWNER}/${REPO}/releases?access_token=${GT_TOKEN}`,
      headers: { 'User-Agent': 'KunyaoGit-publish' },
    }, body, 'application/json');
    if (c.status !== 201) throw new Error('Create failed: ' + c.status + ' ' + c.text);
    r = c.json;
    log('✅ Release 创建 ' + (r.html_url || '(id:' + r.id + ')'));
  } else {
    log('找到 release id ' + r.id);
  }

  // 2. PATCH body
  const body = JSON.stringify({
    tag_name: r.tag_name,
    name: r.name,
    body: RELEASE_BODY,
  });
  const u = await req({
    hostname: 'gitee.com', method: 'PATCH',
    path: `/api/v5/repos/${GT_OWNER}/${REPO}/releases/${r.id}?access_token=${GT_TOKEN}`,
    headers: { 'User-Agent': 'KunyaoGit-publish' },
  }, body, 'application/json');
  if (u.status !== 200) throw new Error('PATCH failed: ' + u.status + ' ' + u.text);
  log('✅ body 已更新');

  // 3. 上传 assets（安装包 + 便携版）
  const attachList = await req({
    hostname: 'gitee.com', method: 'GET',
    path: `/api/v5/repos/${GT_OWNER}/${REPO}/releases/${r.id}/attach_files?access_token=${GT_TOKEN}`,
    headers: { 'User-Agent': 'KunyaoGit-publish' },
  });
  const existingNames = new Set((attachList.json || []).map(a => a.name));
  log('已有 attach files: ' + ([...existingNames].join(', ') || '(空)'));

  for (const f of [INSTALLER, PORTABLE].filter(p => fs.existsSync(p))) {
    const fileName = path.basename(f);
    if (existingNames.has(fileName)) {
      log('跳过（已存在）: ' + fileName);
      continue;
    }
    const fileSize = fs.statSync(f).size;
    log(`流式上传 ${fileName} (${(fileSize/1024/1024).toFixed(2)} MB) 到 Gitee`);
    const up = await streamUploadMultipart({
      hostname: 'gitee.com',
      path: `/api/v5/repos/${GT_OWNER}/${REPO}/releases/${r.id}/attach_files?access_token=${GT_TOKEN}`,
      headers: { 'User-Agent': 'KunyaoGit-publish' },
    }, f, 'file');
    if (up.status !== 201 && up.status !== 200) {
      log('⚠️ 上传失败: ' + up.status + ' ' + up.text);
      continue;
    }
    log('✅ 上传成功: ' + fileName);
  }

  log('🎉 Gitee 发布完成 (release id: ' + r.id + ')');
  log('========== Gitee Release 发布结束 ==========\n');
}

main().catch(e => { log('[err] ' + e.message); process.exit(1); });
