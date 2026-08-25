// Create GitHub Release + stream-upload NSIS installer + portable zip
// v0.6.0 专用模板（基于 publish-v026.cjs，沿用流式上传 + 复用 release 逻辑）
// Usage: GH_TOKEN=xxx node scripts/publish/publish-v060.cjs
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

## v0.6.0 特性
- 📎 **Release 附件上传 / 下载 / 删除（GitHub + Gitee 双平台）** — 创建 release 时可同时选择多个本地附件（git add 后由 Contents API 等价路径发布），已发布 release 可在详情抽屉继续上传 / 下载 / 删除附件
  - **GitHub**：\`oct.repos.uploadReleaseAsset\` + \`deleteReleaseAsset\`，单文件软限 2GB
  - **Gitee**：\`POST .../releases/{id}/attach_files\` multipart + \`DELETE .../attach_files/{id}\`，单文件 ≤ 100MB
  - **ReleaseAsset** 扩展：新增 \`id\` / \`state\` / \`contentType\` / \`uploadedAt\` / \`htmlUrl\` 字段（删除 / 后续操作依赖 id）
- ✏️ **Release 编辑** — 详情抽屉可改 name / body / prerelease；GitHub 支持 draft ↔ release 切换，Gitee 部分支持（不支持 draft 切换）
- 🎨 **Release 详情抽屉** — 640px 右侧抽屉，body 用 \`marked\` 渲染 Markdown（标题 / 列表 / 代码块 / 链接高亮），附件完整列表（大小 / 下载次数 / 下载 / 删除）+ 顶部「发布草稿」按钮（仅 GitHub draft）
- 🔍 **Release 列表搜索** — 顶部搜索框按 tag / name 实时过滤
- 📚 **依赖新增**：\`marked@^15\`（Markdown 渲染）、\`form-data@^4\`（Gitee multipart 上传）
- 🧪 **自动化测试** — 268 → **281 例**（+13）：新增 MarkdownBody 6 例 + ReleaseCard 7 例

## v0.5.0 特性
- ⌨️ **Ctrl+P 跳转文件** — 复用命令面板组件，VS Code 式模糊搜索（连续字符加分 + 路径分隔符后字符加分）；git ls-files --cached --others --exclude-standard 上限 5000 文件
- 📜 **文件历史 + Blame** — 编辑器顶部「历史」按钮打开 FileHistoryPanel 侧边抽屉，commit 列表（git log --follow 跟踪重命名）+ 点开展开 diff；点击 Monaco 行号 gutter 触发 blame 浮窗（git blame --line-porcelain 解析为 BlameLine[]）
- 🧪 **v0.4 自动化测试** — 218 例（10 文件）扩展到 268 例（12 文件）：新增 FileHistoryPanel 13 例 + useShortcuts Ctrl+P 6 例 + fuzzyMatch 14 例 + gitService.listFiles 9 例

## v0.4.0 特性
- 📊 **底部状态栏** — 三段式布局实时显示：左（仓库名/分支/↑N↓M 同步）、中（已暂存/未暂存/冲突 计数）、右（应用版本号）
- ⌨️ **全局快捷键** — Ctrl/Cmd+Shift+P 打开命令面板、Ctrl/Cmd+R 刷新、Shift+? 显示速查表（输入框内自动让位）
- 🔍 **命令面板** — VS Code 式 Ctrl+Shift+P 模态：4 类 20+ 命令（git/navigation/view/settings），支持模糊搜索 + 键盘导航
- 📦 **Stash 队列** — 折叠面板集成在 ChangesPanel 顶部，提供 Apply（保留）/ Pop（应用+删除）/ Show Diff（弹窗）/ Drop；message 自定义
- 🍒 **Cherry-pick / Revert** — Commit 历史每行 hover 工具条入口，冲突时 toast 引导到变更页（复用现有冲突解决流程）
- 🌐 **PR / MR 创建** — 解析远程 URL（https / ssh / 含凭据）→ 自动拉默认 base 分支 + 默认 title 取 log[0] subject → GitHub（含 draft）+ Gitee 双平台支持
- 👁️ **可发现性改进** — 侧边栏底部「快捷键 ?」+「命令面板 ⇧P」常驻双按钮；「创建 Pull Request」按钮从 hover 提到 BranchPanel 标题行 + RepoPage 顶部工具栏（双入口常驻）
- 🧪 **自动化测试** — 218 例单元 + 组件测试（10 文件，约 3 秒跑完）：Vitest 4 + happy-dom + Testing Library 16；覆盖 parseRemote / parseUnifiedDiff / GitService / i18n / commands / StatusBar / CommandPalette / StashList / CreatePRDialog / useShortcuts

## v0.3.8 改动
- 📁 **项目目录清理** — 根目录 48 个日志文件统一归档到 \`logs/\` 目录（build/publish/debug 三类）
- 🔧 **变更面板布局修复** — 文件多时提交信息框不再被挤出可视区域，文件列表可正常滚动
- 📝 **文档完善** — 更新 ARCHITECTURE.md / development-guide.md / features.md 反映最新结构
- 🧹 **.gitignore 优化** — 合并冗余 release-v* 规则，统一日志忽略模式

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
