// Create v0.2.1 GitHub Release + upload NSIS installer + portable zip
// Usage: GH_TOKEN=xxx node scripts/publish/publish-v021.cjs
//   （未设 GH_TOKEN 时自动从 git remote 'github' 的 URL 里提取 PAT）

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { execSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const VERSION = require(path.join(ROOT, 'package.json')).version;
const TAG = `v${VERSION}`;
const REPO = 'KunyaoGit';
const OWNER = process.env.GH_OWNER || 'buxiaju';

// 取 token：优先环境变量，其次从 git remote 'github' URL 提取
let TOKEN = process.env.GH_TOKEN;
if (!TOKEN) {
  try {
    const url = execSync('git remote get-url github', { encoding: 'utf-8' }).trim();
    // https://<token>@github.com/owner/repo.git
    const m = url.match(/^https:\/\/([^@]+)@github\.com\//);
    if (m) TOKEN = decodeURIComponent(m[1]);
  } catch {}
}
if (!TOKEN) { console.error('缺少 GH_TOKEN，也无法从 git remote github 提取'); process.exit(1); }

const INSTALLER = path.join(ROOT, 'release', `KunyaoGit-Setup-${VERSION}-x64.exe`);
const PORTABLE  = path.join(ROOT, 'release', `KunyaoGit-portable-v${VERSION}.zip`);
if (!fs.existsSync(INSTALLER)) { console.error('missing', INSTALLER); process.exit(1); }

const RELEASE_BODY = `# KunyaoGit v${VERSION}

## v0.2.1 修复
- 🐛 **修复 v0.2.0 无法启动** — \`app:get-version\` IPC handler 在 update.ts 和 main.ts 中重复注册，启动时抛 \`Attempted to register a second handler\` 阻断了 \`createWindow()\`，导致进程在跑但窗口不显示。移除 update.ts 中的重复注册。
- 🐛 **修复图标棋盘格背景** — 源图 \`icon-master.png\` 背景被烧成"白格+灰格"棋盘格（图像编辑器表示透明的符号被错误固化进位图），现改为真透明，在任何颜色任务栏/桌面上只显示 Jade 绿 logo，不再有一圈格子。

## 下载
- **KunyaoGit-Setup-${VERSION}-x64.exe** — NSIS 安装包（推荐），双击安装，含专属图标、桌面/开始菜单快捷方式、卸载入口
- **KunyaoGit-portable-v${VERSION}.zip** — 便携版（3.5 MB，仅源码 + Electron 入口，需要本机已安装 Node.js 与 Electron）

## 升级
如果装的是 v0.2.0（双击没反应、看不到窗口），卸载后安装 v0.2.1 即可。v0.2.1 启动后会自动检查新版本。

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
- 自动更新检查（启动后 1.5s 静默检测，发现新版本弹窗提示）

## 安装 Token
打开应用 → 设置 → 选择 GitHub / Gitee → 填入 Personal Access Token → 测试并保存。

> Gitee 公开 release 列表 API 对匿名请求返回 404；如果你在 设置 → Gitee 里配了 token，更新检查会同时拉取 Gitee 端数据。

## 仓库
- GitHub: https://github.com/buxiaju/KunyaoGit
- Gitee:  https://gitee.com/buxiaju/KunyaoGit
`;

function req(opts, body) {
  return new Promise((resolve, reject) => {
    const r = https.request(opts, (res) => {
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
    if (body) r.write(body);
    r.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('GET release', TAG);
  const tagUrl = new URL(`https://api.github.com/repos/${OWNER}/${REPO}/releases/tags/${TAG}`);
  const exists = await req({
    hostname: tagUrl.hostname, method: 'GET', path: tagUrl.pathname,
    headers: { 'Authorization': 'token ' + TOKEN, 'User-Agent': 'KunyaoGit-publish', 'Accept': 'application/vnd.github+json' },
  });

  let release;
  if (exists.status === 200) {
    console.log('Release 已存在，复用', exists.json.html_url);
    release = exists.json;
  } else if (exists.status === 404) {
    console.log('创建 release', TAG);
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
        'Content-Length': Buffer.byteLength(body),
      },
    }, body);
    if (r.status !== 201) throw new Error('Create failed: ' + r.status + ' ' + r.text);
    release = r.json;
    console.log('✅ Release 创建', release.html_url);
  } else {
    throw new Error('GET release failed: ' + exists.status + ' ' + exists.text);
  }

  // 更新 body
  const body = JSON.stringify({ body: RELEASE_BODY });
  const upd = await req({
    hostname: 'api.github.com', method: 'PATCH', path: `/repos/${OWNER}/${REPO}/releases/${release.id}`,
    headers: {
      'Authorization': 'token ' + TOKEN, 'User-Agent': 'KunyaoGit-publish',
      'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  }, body);
  if (upd.status !== 200) throw new Error('Update body failed: ' + upd.status + ' ' + upd.text);
  release = upd.json;
  console.log('✅ body 已更新');

  // 上传两个 asset
  const existingNames = new Set((release.assets || []).map(a => a.name));
  console.log('已有 assets:', [...existingNames].join(', ') || '(空)');

  for (const f of [INSTALLER, PORTABLE].filter(p => fs.existsSync(p))) {
    const fileName = path.basename(f);
    if (existingNames.has(fileName)) {
      console.log('跳过（已存在）:', fileName);
      continue;
    }
    const fileSize = fs.statSync(f).size;
    const fileBuf = fs.readFileSync(f);
    console.log(`上传 ${fileName} (${(fileSize/1024/1024).toFixed(2)} MB)`);
    const baseUrl = release.upload_url.split('{')[0];
    const u = new URL(baseUrl);
    u.searchParams.set('name', fileName);
    const r2 = await req({
      hostname: u.hostname, method: 'POST', path: u.pathname + u.search,
      headers: {
        'Authorization': 'token ' + TOKEN, 'User-Agent': 'KunyaoGit-publish',
        'Accept': 'application/vnd.github+json', 'Content-Type': 'application/octet-stream',
        'Content-Length': fileSize,
      },
    }, fileBuf);
    if (r2.status !== 201) throw new Error('Upload failed: ' + r2.status + ' ' + r2.text);
    console.log('✅ 上传成功:', r2.json.browser_download_url);
    await sleep(500);
  }

  console.log('\n🎉 完成');
  console.log('Release:', release.html_url);
}

main().catch(e => { console.error('[err]', e.message); process.exit(1); });
