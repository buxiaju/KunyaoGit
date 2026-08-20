// 端到端模拟：应用内更新器新逻辑（v0.3.3+）
// 1) probe 带重试  2) 单连接完整下载（Gitee CDN 不支持 Range） 3) SHA256 与本地产物对比
// 用法：node scripts/debug/diag-e2e.cjs <version>
const https = require('node:https');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { URL } = require('node:url');

const VER = process.argv[2] || '0.3.2';
const INSTALLER = `KunyaoGit-Setup-${VER}-x64.exe`;
const REPO = 'buxiaju/KunyaoGit';
const PROBE_TIMEOUT_MS = 8000;
const RANGE_TIMEOUT_MS = 30000;
const PROBE_ATTEMPTS = 2;
const PROBE_RETRY_BACKOFF = 500;
const PROBE_ROUNDS = 6;
const ROUND_RETRY_DELAY = 3000;
const LOCAL = `.release-assets/${INSTALLER}`;

const agent = new https.Agent({ keepAlive: true, maxSockets: 6 });

function requestFollow(initialUrl, method = 'GET', extraHeaders = {}, maxRedirects = 8, timeoutMs = PROBE_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const visit = (u, left) => {
      const urlObj = new URL(u);
      const req = https.request(
        { hostname: urlObj.hostname, port: 443, path: urlObj.pathname + urlObj.search, method, agent,
          headers: { 'User-Agent': 'KunyaoGit-updater', 'Accept': 'application/octet-stream, */*', ...extraHeaders } },
        (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            if (left <= 0) { reject(new Error('redirects too many')); return; }
            visit(new URL(res.headers.location, u).toString(), left - 1);
            return;
          }
          resolve({ res, finalUrl: u });
        }
      );
      let connectTimer;
      req.on('socket', (socket) => {
        if (socket.connecting) {
          connectTimer = setTimeout(() => req.destroy(new Error('连接超时')), timeoutMs);
          socket.once('connect', () => { if (connectTimer) clearTimeout(connectTimer); });
        }
      });
      req.setTimeout(timeoutMs, () => req.destroy(new Error('连接超时')));
      req.on('error', (e) => { if (connectTimer) clearTimeout(connectTimer); reject(e); });
      req.end();
    };
    visit(initialUrl, maxRedirects);
  });
}

async function probeOnce(url) {
  try {
    const { res } = await requestFollow(url, 'GET', { Range: 'bytes=0-0' }, 8, PROBE_TIMEOUT_MS);
    const status = res.statusCode || 0;
    const contentType = String(res.headers['content-type'] || '');
    const ar = String(res.headers['accept-ranges'] || '').toLowerCase();
    let total = 0;
    const cr = res.headers['content-range'];
    if (typeof cr === 'string') { const m = /\/(\d+)\s*$/.exec(cr); if (m) total = Number(m[1]); }
    if (!total) total = Number(res.headers['content-length'] || 0);
    res.destroy();
    return { status, contentType, total, acceptRanges: status === 206 || ar === 'bytes' };
  } catch { return null; }
}

async function probeWithRetry(url) {
  for (let a = 0; a < PROBE_ATTEMPTS; a++) {
    const r = await probeOnce(url);
    if (r) { if (a > 0) console.log(`  probe 第 ${a + 1} 次成功`); return r; }
    if (a < PROBE_ATTEMPTS - 1) await new Promise((s) => setTimeout(s, PROBE_RETRY_BACKOFF * Math.pow(2, a)));
  }
  return null;
}

async function downloadFull(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    requestFollow(url, 'GET', {}, 8, RANGE_TIMEOUT_MS).then(({ res }) => {
      const code = res.statusCode || 0;
      if (code < 200 || code >= 300) { res.resume(); reject(new Error(`HTTP ${code}`)); return; }
      const ws = fs.createWriteStream(destPath);
      let received = 0;
      const t0 = Date.now();
      res.on('data', (c) => { received += c.length; onProgress?.(received); ws.write(c); });
      ws.on('error', reject);
      res.on('error', (e) => { try { ws.destroy(); } catch {} reject(e); });
      res.on('end', () => ws.end(() => resolve({ received, ms: Date.now() - t0 })));
    }, reject);
  });
}

(async () => {
  const url = `https://gitee.com/${REPO}/releases/download/v${VER}/${INSTALLER}`;
  console.log(`== E2E 模拟 v${VER}（新逻辑：探活 8s×2 次 + 整体 ${PROBE_ROUNDS} 轮 + 单连接下载 + SHA256 校验）==`);

  // 整体轮次：probe 失败 → 等 3s → 下一轮
  let probe = null;
  for (let round = 1; round <= PROBE_ROUNDS; round++) {
    if (round > 1) { console.log(`  第 ${round} 轮重试…`); await new Promise((s) => setTimeout(s, ROUND_RETRY_DELAY)); }
    probe = await probeWithRetry(url);
    if (probe) { console.log(`  （第 ${round} 轮成功）`); break; }
  }
  if (!probe) { console.log('❌ 探活失败（3 轮重试后仍失败）'); process.exit(1); }
  console.log(`✅ 探活成功 status=${probe.status} total=${probe.total} type=${probe.contentType} range=${probe.acceptRanges}`);

  const dest = `${require('node:os').tmpdir()}/kg-e2e-${VER}.exe`;
  try { fs.unlinkSync(dest); } catch {}
  const dl = await downloadFull(url, dest, (n) => {
    if (n % (20 * 1024 * 1024) < 100 * 1024) console.log(`  ...已下载 ${(n / 1024 / 1024).toFixed(0)}MB`);
  });
  console.log(`✅ 下载完成 ${(dl.received / 1024 / 1024).toFixed(2)}MB ${(dl.ms / 1000).toFixed(1)}s (${(dl.received / 1024 / 1024 / (dl.ms / 1000)).toFixed(2)}MB/s)`);

  if (!fs.existsSync(LOCAL)) { console.log(`⚠️ 本地无 ${LOCAL}，跳过 SHA256 对比`); process.exit(0); }
  const h1 = crypto.createHash('sha256').update(fs.readFileSync(dest)).digest('hex');
  const h2 = crypto.createHash('sha256').update(fs.readFileSync(LOCAL)).digest('hex');
  console.log(`✅ SHA256 一致: ${h1 === h2}`);
  if (h1 !== h2) { console.log(`  remote=${h1}\n  local =${h2}`); process.exit(1); }
  try { fs.unlinkSync(dest); } catch {}
  process.exit(0);
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
