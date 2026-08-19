// Create / Update Gitee Release v0.2.2 body to match GitHub
// Usage: node scripts/update-gitee-body.cjs
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

## v0.2.2 新特性
- ✨ **应用内自动更新** — 发现新版本时自动弹窗询问"立即下载并安装"，应用内多源下载（Gitee 优先、GitHub 兜底）带实时进度条，下载完成自动启动安装包并退出应用完成更新，无需手动去浏览器下载。
- 🎨 设置页"关于"区新增"立即下载并安装"按钮，可随时触发更新流程。
- 🛠 支持取消下载、错误重试、浏览器兜底下载。

## v0.2.1 修复（沿用）
- 🐛 **修复 v0.2.0 无法启动** — \`app:get-version\` IPC handler 重复注册导致启动时抛错阻断 \`createWindow()\`。
- 🐛 **修复图标棋盘格背景** — 源图透明符号被错误固化进位图，现改为真透明。

## 下载
- **KunyaoGit-Setup-${VERSION}-x64.exe** — NSIS 安装包，仓库根目录 \`.release-assets/\` 下；推荐去 GitHub Release 下载（[https://github.com/buxiaju/KunyaoGit/releases/download/v${VERSION}/KunyaoGit-Setup-${VERSION}-x64.exe](https://github.com/buxiaju/KunyaoGit/releases/download/v${VERSION}/KunyaoGit-Setup-${VERSION}-x64.exe)）
- **KunyaoGit-portable-v${VERSION}.zip** — 便携版，仓库根目录 \`.release-assets/\` 下

## 升级
- **v0.2.0 / v0.2.1 用户**：启动应用后会自动检查更新并弹窗，点"立即下载并安装"即可一键更新到 v${VERSION}。也可手动下载安装包覆盖安装。
- 应用内更新会优先从 Gitee 下载（国内快），失败时自动切换 GitHub 兜底。

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
  // 找 release
  const list = await req({
    hostname: 'gitee.com', method: 'GET',
    path: `/api/v5/repos/${GT_OWNER}/${REPO}/releases?access_token=${GT_TOKEN}`,
    headers: { 'User-Agent': 'KunyaoGit-publish' },
  });
  let r = (list.json || []).find(x => x.tag_name === TAG);

  if (!r) {
    // 创建 release
    console.log('创建 Gitee release', TAG);
    const body = JSON.stringify({
      tag_name: TAG,
      name: `KunyaoGit v${VERSION}`,
      body: RELEASE_BODY,
      target_commitish: 'master',
    });
    const c = await req({
      hostname: 'gitee.com', method: 'POST',
      path: `/api/v5/repos/${GT_OWNER}/${REPO}/releases?access_token=${GT_TOKEN}`,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': 'KunyaoGit-publish',
      },
    }, body);
    if (c.status !== 201) throw new Error('Create failed: ' + c.status + ' ' + c.text);
    r = c.json;
    console.log('✅ Release 创建', r.html_url);
  } else {
    console.log('找到 release id', r.id, r.html_url);
  }

  // PATCH body
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
