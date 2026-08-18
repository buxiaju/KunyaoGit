// Upload NSIS installer to existing GitHub Release v0.1.0 (and update release body)
// Usage: GH_TOKEN=xxx node scripts/upload-installer.cjs

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const ROOT = path.resolve(__dirname, '..');
const VERSION = require(path.join(ROOT, 'package.json')).version;
const TAG = `v${VERSION}`;
const REPO = 'KunyaoGit';
const OWNER = process.env.GH_OWNER || 'buxiaju';
const TOKEN = process.env.GH_TOKEN;

if (!TOKEN) { console.error('缺少 GH_TOKEN'); process.exit(1); }

const INSTALLER = path.join(ROOT, 'release', `KunyaoGit-Setup-${VERSION}-x64.exe`);
const PORTABLE  = path.join(ROOT, 'release', `KunyaoGit-portable-v${VERSION}.zip`);

const ASSETS = [];
if (fs.existsSync(INSTALLER)) ASSETS.push(INSTALLER);
if (fs.existsSync(PORTABLE))  ASSETS.push(PORTABLE);

if (ASSETS.length === 0) {
  console.error('找不到任何待上传的产物');
  process.exit(1);
}

const RELEASE_BODY = `# KunyaoGit v${VERSION}

首个公开版本（Windows x64）。

## 下载
- **KunyaoGit-Setup-${VERSION}-x64.exe** — NSIS 安装包，118 MB，包含完整 Electron 运行时；提供桌面/开始菜单快捷方式、卸载入口。
- **KunyaoGit-portable-v${VERSION}.zip** — 便携版（3.5 MB，仅源码 + Electron 入口，需要本机已安装 Node.js 与 Electron）。

## 安装
下载 Setup .exe，双击运行 → 选择安装目录 → 安装完成。

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

## 安装 Token
打开应用 → 设置 → 选择 GitHub / Gitee → 填入 Personal Access Token → 测试并保存。

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
        resolve({ status: res.statusCode, text, json, headers: res.headers });
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
    hostname: tagUrl.hostname,
    method: 'GET',
    path: tagUrl.pathname,
    headers: {
      'Authorization': 'token ' + TOKEN,
      'User-Agent': 'KunyaoGit-publish',
      'Accept': 'application/vnd.github+json',
    },
  });
  if (exists.status !== 200) throw new Error('Release 不存在: ' + exists.status);
  let release = exists.json;
  console.log('找到 release', release.html_url);

  // 更新 release body
  const body = JSON.stringify({ body: RELEASE_BODY });
  const upd = await req({
    hostname: 'api.github.com',
    method: 'PATCH',
    path: `/repos/${OWNER}/${REPO}/releases/${release.id}`,
    headers: {
      'Authorization': 'token ' + TOKEN,
      'User-Agent': 'KunyaoGit-publish',
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  }, body);
  if (upd.status !== 200) throw new Error('Update body failed: ' + upd.status + ' ' + upd.text);
  release = upd.json;
  console.log('✅ Release body 更新');

  // 列出已存在的 asset
  const existingNames = new Set((release.assets || []).map(a => a.name));
  console.log('已有 assets:', [...existingNames].join(', ') || '(空)');

  // 上传每个 asset
  for (const f of ASSETS) {
    const fileName = path.basename(f);
    if (existingNames.has(fileName)) {
      console.log('跳过（已存在）:', fileName);
      continue;
    }
    const fileSize = fs.statSync(f).size;
    const fileBuf = fs.readFileSync(f);
    console.log(`上传 ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);

    const baseUrl = release.upload_url.split('{')[0];
    const u = new URL(baseUrl);
    u.searchParams.set('name', fileName);
    const uploadPath = u.pathname + u.search;
    const r2 = await req({
      hostname: u.hostname,
      method: 'POST',
      path: uploadPath,
      headers: {
        'Authorization': 'token ' + TOKEN,
        'User-Agent': 'KunyaoGit-publish',
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/octet-stream',
        'Content-Length': fileSize,
      },
    }, fileBuf);
    if (r2.status !== 201) throw new Error('Upload failed: ' + r2.status + ' ' + r2.text);
    console.log('✅ 上传成功:', r2.json.browser_download_url);
    await sleep(500);
  }

  console.log('\n🎉 全部完成！');
  console.log('Release:', release.html_url);
}

main().catch(e => { console.error('[err]', e.message); process.exit(1); });
