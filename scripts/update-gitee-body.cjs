// Update Gitee Release v0.2.0 body to match GitHub
// Usage: GT_TOKEN=xxx node scripts/update-gitee-body.cjs
const https = require('node:https');
const path = require('node:path');
const fs = require('node:fs');
const ROOT = path.resolve(__dirname, '..');
const VERSION = require(path.join(ROOT, 'package.json')).version;
const TAG = `v${VERSION}`;
const GT_TOKEN = process.env.GT_TOKEN || '721ddfdc2165332edc7a79b18537c2b3';
const GT_OWNER = 'buxiaju';
const REPO = 'KunyaoGit';

const RELEASE_BODY = `# KunyaoGit v${VERSION}

## v0.2.0 新增
- ✨ **自动更新检查** — 同时检查 GitHub 和 Gitee 的最新 release，发现新版本可在应用内一键跳转下载
- ✨ **专属应用图标** — Jade 绿 + K + Git 分支头尾节点，绿松石质感
- 🐛 **修复安装包缺 node_modules** — 之前首次安装报 \`Cannot find module 'electron-store'\`；改用 asar 打包后正常

## 下载
- **KunyaoGit-Setup-${VERSION}-x64.exe** — NSIS 安装包，仓库根目录 \`.release-assets/\` 下；推荐去 GitHub Release 下载（[https://github.com/buxiaju/KunyaoGit/releases/download/v${VERSION}/KunyaoGit-Setup-${VERSION}-x64.exe](https://github.com/buxiaju/KunyaoGit/releases/download/v${VERSION}/KunyaoGit-Setup-${VERSION}-x64.exe)）
- **KunyaoGit-portable-v${VERSION}.zip** — 便携版（3.5 MB），仓库根目录 \`.release-assets/\` 下

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

(async () => {
  // 找 release id
  const list = await req({
    hostname: 'gitee.com', method: 'GET',
    path: `/api/v5/repos/${GT_OWNER}/${REPO}/releases?access_token=${GT_TOKEN}`,
    headers: { 'User-Agent': 'KunyaoGit-publish' },
  });
  const r = (list.json || []).find(x => x.tag_name === TAG);
  if (!r) throw new Error('release not found');
  console.log('找到 release id', r.id, r.html_url);

  // PATCH body (Gitee 需要带 tag_name 和 name)
  const body = JSON.stringify({
    tag_name: r.tag_name,
    name: r.name,
    body: RELEASE_BODY,
  });
  const u = await req({
    hostname: 'gitee.com', method: 'PATCH',
    path: `/api/v5/repos/${GT_OWNER}/${REPO}/releases/${r.id}?access_token=${GT_TOKEN}`,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'User-Agent': 'KunyaoGit-publish',
    },
  }, body);
  if (u.status !== 200) throw new Error('PATCH failed: ' + u.status + ' ' + u.text);
  console.log('✅ body updated');
})().catch(e => { console.error('[err]', e.message); process.exit(1); });
