// Delete old asset and re-upload new installer
// Usage: GH_TOKEN=xxx node scripts/replace-installer.cjs
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const ROOT = path.resolve(__dirname, '..');
const VERSION = require(path.join(ROOT, 'package.json')).version;
const TAG = `v${VERSION}`;
const OWNER = process.env.GH_OWNER || 'buxiaju';
const REPO = 'KunyaoGit';
const TOKEN = process.env.GH_TOKEN;
const ASSET_NAME = `KunyaoGit-Setup-${VERSION}-x64.exe`;
const FILE = path.join(ROOT, 'release', ASSET_NAME);

if (!TOKEN) { console.error('缺少 GH_TOKEN'); process.exit(1); }
if (!fs.existsSync(FILE)) { console.error('找不到', FILE); process.exit(1); }

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
  // 找到 release
  const u = new URL(`https://api.github.com/repos/${OWNER}/${REPO}/releases/tags/${TAG}`);
  const r = await req({
    hostname: u.hostname, method: 'GET', path: u.pathname,
    headers: { 'Authorization': 'token ' + TOKEN, 'User-Agent': 'KunyaoGit-publish', 'Accept': 'application/vnd.github+json' },
  });
  if (r.status !== 200) throw new Error('Release not found: ' + r.status);
  const release = r.json;
  console.log('Release:', release.html_url);

  // 找到现有 asset
  const existing = (release.assets || []).find(a => a.name === ASSET_NAME);
  if (existing) {
    console.log('删除旧 asset:', existing.id, existing.name, `(${(existing.size/1024/1024).toFixed(2)} MB)`);
    const du = new URL(existing.url);
    const del = await req({
      hostname: du.hostname, method: 'DELETE', path: du.pathname,
      headers: { 'Authorization': 'token ' + TOKEN, 'User-Agent': 'KunyaoGit-publish', 'Accept': 'application/vnd.github+json' },
    });
    if (del.status !== 204) throw new Error('Delete failed: ' + del.status + ' ' + del.text);
    console.log('✅ 旧 asset 已删除');
    await sleep(1000);
  }

  // 重新上传
  const fileSize = fs.statSync(FILE).size;
  const fileBuf = fs.readFileSync(FILE);
  console.log(`上传 ${ASSET_NAME} (${(fileSize/1024/1024).toFixed(2)} MB)`);
  const baseUrl = release.upload_url.split('{')[0];
  const upUrl = new URL(baseUrl);
  upUrl.searchParams.set('name', ASSET_NAME);
  const r2 = await req({
    hostname: upUrl.hostname, method: 'POST', path: upUrl.pathname + upUrl.search,
    headers: {
      'Authorization': 'token ' + TOKEN,
      'User-Agent': 'KunyaoGit-publish',
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/octet-stream',
      'Content-Length': fileSize,
    },
  }, fileBuf);
  if (r2.status !== 201) throw new Error('Upload failed: ' + r2.status + ' ' + r2.text);
  console.log('✅ 新 asset 上传:', r2.json.browser_download_url);
  console.log('\n🎉 完成');
}

main().catch(e => { console.error('[err]', e.message); process.exit(1); });
