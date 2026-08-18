// 把 build 产物打包成便携版 zip，作为 Gitee Release 附件
// 用法：node scripts/package-portable.cjs

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const https = require('node:https');

const ROOT = path.resolve(__dirname, '..');
const VERSION = require(path.join(ROOT, 'package.json')).version;
const DIST = path.join(ROOT, 'dist');
const DIST_ELECTRON = path.join(ROOT, 'dist-electron');
const OUT_DIR = path.join(ROOT, 'release');
const OUT_ZIP_NAME = `KunyaoGit-portable-v${VERSION}.zip`;
const OUT_ZIP = path.join(OUT_DIR, OUT_ZIP_NAME);

const GT_TOKEN = '721ddfdc2165332edc7a79b18537c2b3';
const GT_OWNER = 'buxiaju';
const REPO = 'KunyaoGit';

function log(...a) { console.log('[portable]', ...a); }

function main() {
  // 检查产物
  if (!fs.existsSync(DIST) || !fs.existsSync(DIST_ELECTRON)) {
    throw new Error('dist/ 或 dist-electron/ 不存在，先跑 vite build');
  }
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  // 用 PowerShell Compress-Archive 打包
  log('打包', OUT_ZIP);
  // -Path 参数要存在，不能是空
  if (fs.existsSync(OUT_ZIP)) fs.unlinkSync(OUT_ZIP);
  // Compress-Archive 在 PowerShell 里
  const ps = `
$ErrorActionPreference = 'Stop'
Compress-Archive -Path '${DIST}','${DIST_ELECTRON}','${path.join(ROOT, 'package.json')}' -DestinationPath '${OUT_ZIP}' -Force
`;
  execSync(`powershell -NoProfile -Command "${ps.replace(/\n/g, '; ')}"`, { stdio: 'inherit', shell: 'cmd.exe' });
  const size = fs.statSync(OUT_ZIP).size;
  log('✅ 便携包完成', `${(size / 1024 / 1024).toFixed(2)} MB`);
  return OUT_ZIP;
}

function httpRequest(opts, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf-8');
        let json = null;
        try { json = JSON.parse(text); } catch {}
        resolve({ status: res.statusCode, text, json });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function uploadToGitee(zpath) {
  const tag = `v${VERSION}`;
  log('创建/查找 Gitee Release', tag);

  // 先看 release 是否存在
  let listRes = await httpRequest({
    hostname: 'gitee.com',
    method: 'GET',
    path: `/api/v5/repos/${GT_OWNER}/${REPO}/releases?access_token=${GT_TOKEN}`,
    headers: { 'User-Agent': 'KunyaoGit-publish/0.1' },
  });
  let release = (listRes.json || []).find(r => r.tag_name === tag);

  if (!release) {
    const body = JSON.stringify({
      tag_name: tag,
      name: `KunyaoGit v${VERSION}`,
      body: `# KunyaoGit v${VERSION}\n\n首个公开版本。\n\n## 下载\n- \`${OUT_ZIP_NAME}\` 是便携版（zip 内有 dist 和 dist-electron，解压后双击 electron.exe 运行）\n- 正式 NSIS 安装包需要到 https://github.com/buxiaju/KunyaoGit/releases 下载（GitHub 那边网络可达的环境跑 \`npm run build:win\` 自行打包）\n\n## 特性\n- 基础 Git 操作（克隆、提交、推送、拉取、分支、合并、冲突解决）\n- GitHub / Gitee 双平台集成\n- 远程仓库文件浏览 / 编辑\n- Monaco Editor 代码编辑\n- 拖拽上传\n- Release 管理`,
      target_commitish: 'master',
    });
    const r = await httpRequest({
      hostname: 'gitee.com',
      method: 'POST',
      path: `/api/v5/repos/${GT_OWNER}/${REPO}/releases?access_token=${GT_TOKEN}`,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': 'KunyaoGit-publish/0.1',
      },
    }, body);
    if (r.status !== 201) throw new Error(`Gitee Release 创建失败 ${r.status}: ${r.text}`);
    release = r.json;
    log('✅ Release 创建', release.html_url);
  } else {
    log('Release 已存在，复用');
  }

  // Gitee 不支持 release asset upload API。把 zip 推送到 raw 路径
  // 先把 zip 提交到 .release-assets/ 目录
  const assetsDir = path.join(ROOT, '.release-assets');
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
  const target = path.join(assetsDir, OUT_ZIP_NAME);
  fs.copyFileSync(zpath, target);
  log('复制 zip 到 .release-assets/，准备 git push');

  // 用 Gitee 上传附件的 raw 方式（projects/{owner}/{repo}/releases/{id}/attach_files）
  // Gitee 的 attach_files API 实际上不支持 release 附件，它返回 404/410
  // 但我们走 raw 路径：把文件提交到仓库，Release 描述里给下载链接

  return release;
}

(async () => {
  const zip = main();
  await uploadToGitee(zip);
  log('完成。请手动 git push 把 .release-assets/ 推到 Gitee:');
  log('  git add .release-assets/');
  log('  git commit -m "release: v' + VERSION + '"');
  log('  git push gitee master');
})().catch(e => {
  console.error('[portable][err]', e.message);
  process.exit(1);
});
