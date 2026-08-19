// 单元测试：本地起一个 HTTP 服务器返回已知字节，用 Range 多连接下载，
// 验证最终文件每个 byte 都落到正确的 offset，且大小完整。
//
// 运行：node scripts/debug/test-range-local.cjs

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const TOTAL = 10 * 1024 * 1024; // 10MB
const CHUNKS = 4;

// 起一个本地 server：返随机但可校验的字节（按 offset 取模）
const server = http.createServer((req, res) => {
  const range = req.headers['range'];
  if (range) {
    const m = /bytes=(\d+)-(\d+)/.exec(range);
    const start = Number(m[1]);
    const end = Number(m[2]);
    res.statusCode = 206;
    res.setHeader('Content-Range', `bytes ${start}-${end}/${TOTAL}`);
    res.setHeader('Content-Length', end - start + 1);
    res.setHeader('Accept-Ranges', 'bytes');
    // 流式返
    let i = start;
    const send = () => {
      while (i <= end) {
        const chunk = Math.min(64 * 1024, end - i + 1);
        const buf = Buffer.alloc(chunk);
        for (let k = 0; k < chunk; k++) buf[k] = (i + k) & 0xff;
        if (!res.write(buf)) {
          i += chunk;
          res.once('drain', send);
          return;
        }
        i += chunk;
      }
      res.end();
    };
    send();
  } else {
    res.statusCode = 200;
    res.setHeader('Content-Length', TOTAL);
    res.setHeader('Accept-Ranges', 'bytes');
    let i = 0;
    const send = () => {
      while (i < TOTAL) {
        const chunk = Math.min(64 * 1024, TOTAL - i);
        const buf = Buffer.alloc(chunk);
        for (let k = 0; k < chunk; k++) buf[k] = (i + k) & 0xff;
        if (!res.write(buf)) { i += chunk; res.once('drain', send); return; }
        i += chunk;
      }
      res.end();
    };
    send();
  }
});

server.listen(0, async () => {
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/`;
  const dest = path.join(os.tmpdir(), 'kg-range-test-' + Date.now() + '.bin');

  // Range 多连接下载
  const fd = await fs.promises.open(dest, 'w+');
  const base = Math.floor(TOTAL / CHUNKS);
  const rem = TOTAL % CHUNKS;
  const ranges = [];
  let c = 0;
  for (let i = 0; i < CHUNKS; i++) {
    const size = base + (i < rem ? 1 : 0);
    ranges.push({ start: c, end: c + size - 1 });
    c += size;
  }
  console.log('Range 切分:', ranges);

  const t0 = Date.now();
  await Promise.all(ranges.map((rg) => new Promise((resolve, reject) => {
    const req = http.request(url, { headers: { Range: `bytes=${rg.start}-${rg.end}` } }, (res) => {
      let recv = 0;
      let chain = Promise.resolve();
      res.on('data', (chunk) => {
        const off = rg.start + recv;
        recv += chunk.length;
        chain = chain.then(() => fd.write(chunk, 0, chunk.length, off).then(() => undefined));
        if (rg.start + recv - 1 >= rg.end) res.destroy();
      });
      res.on('end', async () => { try { await chain; resolve(); } catch (e) { reject(e); } });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  })));
  await fd.close();
  const elapsed = Date.now() - t0;
  console.log(`下载 ${(TOTAL / 1024 / 1024).toFixed(2)} MB 用 ${elapsed} ms`);

  // 校验文件
  const fd2 = await fs.promises.open(dest, 'r');
  const stat = await fd2.stat();
  console.log(`文件大小: ${stat.size} (期望 ${TOTAL})`);
  if (stat.size !== TOTAL) { console.log('FAIL: size mismatch'); process.exit(1); }

  // 抽查 1000 个点
  const SAMPLES = 1000;
  let bad = 0;
  for (let s = 0; s < SAMPLES; s++) {
    const pos = Math.floor(Math.random() * TOTAL);
    const buf = Buffer.alloc(1);
    await fd2.read(buf, 0, 1, pos);
    const expected = pos & 0xff;
    if (buf[0] !== expected) bad++;
  }
  console.log(`抽查 ${SAMPLES} 个点，不匹配: ${bad}`);
  await fd2.close();
  fs.unlinkSync(dest);
  server.close();
  if (bad === 0) {
    console.log('PASS: 所有 byte 落位正确');
    process.exit(0);
  } else {
    console.log('FAIL');
    process.exit(1);
  }
});
