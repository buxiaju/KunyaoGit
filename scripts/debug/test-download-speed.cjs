// 简单对照：单连接 vs 4 连接 Range
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { URL } = require('node:url');

const URL_ = 'https://nodejs.org/dist/v22.10.0/node-v22.10.0-x64.msi';

function get(u) {
  return new Promise((resolve, reject) => {
    const uo = new URL(u);
    const req = https.get(uo, { headers: { 'User-Agent': 'test' } }, (res) => resolve(res));
    req.on('error', reject);
    req.setTimeout(60000, () => req.destroy(new Error('timeout')));
  });
}

async function getSize() {
  return new Promise((resolve, reject) => {
    const uo = new URL(URL_);
    const req = https.request({ ...uo, method: 'HEAD', headers: { 'User-Agent': 'test' } }, (res) => {
      const sz = Number(res.headers['content-length'] || 0);
      res.resume();
      resolve(sz);
    });
    req.on('error', reject);
    req.setTimeout(60000, () => req.destroy(new Error('timeout')));
    req.end();
  });
}

function downloadSingle(dest) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const w = fs.createWriteStream(dest);
    get(URL_).then((res) => {
      res.pipe(w);
      w.on('finish', () => resolve(Date.now() - t0));
      w.on('error', reject);
      res.on('error', reject);
    }, reject);
  });
}

function downloadRange(dest, total, n) {
  return new Promise(async (resolve, reject) => {
    const fd = await fs.promises.open(dest, 'w+');
    const base = Math.floor(total / n);
    const rem = total % n;
    const t0 = Date.now();
    const ranges = [];
    let c = 0;
    for (let i = 0; i < n; i++) {
      const size = base + (i < rem ? 1 : 0);
      ranges.push({ start: c, end: c + size - 1 });
      c += size;
    }
    try {
      await Promise.all(ranges.map((rg) => new Promise((res2, rej2) => {
        const uo = new URL(URL_);
        const req = https.request({ ...uo, headers: { 'User-Agent': 'test', 'Range': `bytes=${rg.start}-${rg.end}` } }, (r) => {
          let recv = 0;
          let chain = Promise.resolve();
          r.on('data', (chunk) => {
            const off = rg.start + recv;
            recv += chunk.length;
            chain = chain.then(() => fd.write(chunk, 0, chunk.length, off).then(() => undefined));
            if (rg.start + recv - 1 >= rg.end) r.destroy();
          });
          r.on('end', async () => { try { await chain; res2(); } catch (e) { rej2(e); } });
          r.on('error', rej2);
          r.on('close', () => { if (!r.complete) { /* 截断即可 */ } });
        });
        req.on('error', rej2);
        req.setTimeout(60000, () => req.destroy(new Error('timeout')));
        req.end();
      })));
      await fd.close();
      resolve(Date.now() - t0);
    } catch (e) { reject(e); }
  });
}

(async () => {
  const total = await getSize();
  console.log(`文件大小: ${(total / 1024 / 1024).toFixed(2)} MB`);

  const t1 = await downloadSingle(path.join(os.tmpdir(), 'kg-s.bin'));
  console.log(`单连接:   ${t1} ms  (${(total / 1024 / 1024 / (t1 / 1000)).toFixed(2)} MB/s)`);
  fs.unlinkSync(path.join(os.tmpdir(), 'kg-s.bin'));

  const t4 = await downloadRange(path.join(os.tmpdir(), 'kg-4.bin'), total, 4);
  console.log(`4 路 Range: ${t4} ms  (${(total / 1024 / 1024 / (t4 / 1000)).toFixed(2)} MB/s)`);
  fs.unlinkSync(path.join(os.tmpdir(), 'kg-4.bin'));

  console.log(`\n加速比: ${(t1 / t4).toFixed(2)}x`);
})().catch((e) => { console.error('ERR:', e); process.exit(1); });
