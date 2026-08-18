// 创建 GitHub Release + 上传便携包
// 用法：GH_TOKEN=xxx node scripts/release-github.cjs

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const ROOT = path.resolve(__dirname, '..');
const VERSION = require(path.join(ROOT, 'package.json')).version;
const TAG = `v${VERSION}`;
const REPO = 'KunyaoGit';
const OWNER = process.env.GH_OWNER || 'buxiaju';
const TOKEN = process.env.GH_TOKEN;
const EXE = path.join(ROOT, 'release', `KunyaoGit-portable-v${VERSION}.zip`);

if (!TOKEN) { console.error('缺少 GH_TOKEN'); process.exit(1); }
if (!fs.existsSync(EXE)) { console.error('找不到', EXE); process.exit(1); }

const RELEASE_BODY = `# KunyaoGit v${VERSION}

首个公开版本。

## 下载
下方 \`KunyaoGit-portable-v${VERSION}.zip\` 是便携版（zip 内有 dist/、dist-electron/、package.json；解压后双击 electron.exe 运行，或者执行 \`npx electron dist-electron/main.js\` 启动）。

正式 NSIS 安装包可以本地 \`npm run build:win\` 自行打包（需要能访问 GitHub release 域名）。

## 特性
- 基础 Git 操作（克隆、提交、推送、拉取、分支、合并、冲突解决）
- GitHub / Gitee 双平台集成
- 远程仓库文件浏览 / 编辑
- Monaco Editor 代码编辑
- 拖拽上传
- Release 管理

## 安装 Token
打开应用 → 设置 → 选择 GitHub / Gitee → 填入 Personal Access Token → 测试并保存。

完整文档见 [README](https://github.com/buxiaju/KunyaoGit#readme)
`;

function req(opts, body, headers) {
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

async function main() {
  console.log('创建 GitHub Release', TAG);

  // 用 URL 构造 path（避免 Node http 检查未转义字符）
  const tagUrl = new URL(`https://api.github.com/repos/${OWNER}/${REPO}/releases/tags/${TAG}`);
  console.log('GET', tagUrl.pathname);

  // 创建 release（先检查是否已存在）
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
  let release;
  if (exists.status === 200) {
    console.log('Release 已存在，复用', exists.json.html_url);
    release = exists.json;
  } else if (exists.status === 404) {
    const body = JSON.stringify({
      tag_name: TAG,
      name: `KunyaoGit v${VERSION}`,
      body: RELEASE_BODY,
      draft: false,
      prerelease: false,
    });
    const r = await req({
      hostname: 'api.github.com',
      method: 'POST',
      path: `/repos/${OWNER}/${REPO}/releases`,
      headers: {
        'Authorization': 'token ' + TOKEN,
        'User-Agent': 'KunyaoGit-publish',
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, body);
    if (r.status !== 201) throw new Error('Create failed: ' + r.status + ' ' + r.text);
    release = r.json;
    console.log('✅ Release 创建', release.html_url);
  } else {
    throw new Error('GET release failed: ' + exists.status);
  }

  // 上传 asset
  const fileName = path.basename(EXE);
  const fileSize = fs.statSync(EXE).size;
  const fileBuf = fs.readFileSync(EXE);
  console.log('upload_url =', release.upload_url);
  // upload_url 形如 https://uploads.github.com/repos/.../releases/{id}/assets{?name,label}
  // 去掉 {...} 模板部分
  const baseUrl = release.upload_url.split('{')[0];
  console.log('baseUrl =', baseUrl);
  // 用 URL 对象来正确编码
  const u = new URL(baseUrl);
  u.searchParams.set('name', fileName);
  const uploadPath = u.pathname + u.search;
  console.log('upload path =', uploadPath);
  const opts = {
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
  };
  console.log('opts.path =', opts.path);
  const r2 = await req(opts, fileBuf);
  if (r2.status !== 201) throw new Error('Asset upload failed: ' + r2.status + ' ' + r2.text);
  console.log('✅ Asset 上传', r2.json.browser_download_url);
  console.log('🎉 全部完成！');
  console.log('Release:', release.html_url);
}

main().catch(e => { console.error('[err]', e.message); process.exit(1); });
