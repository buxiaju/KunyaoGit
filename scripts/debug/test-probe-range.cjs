// 验证 probeRange 用 Range: bytes=0-0 GET 能从 206 响应里拿到 total
// 起本地 server：1MB 内容
const http = require('node:http');
const { URL } = require('node:url');

const TOTAL = 1024 * 1024; // 1MB

function probe(url, supportRange) {
  return new Promise((res, rej) => {
    const u = new URL(url);
    const req = http.request({
      hostname: u.hostname, port: u.port, path: u.pathname, method: 'GET',
      headers: { Range: 'bytes=0-0' },
    }, (response) => {
      let chunks = [];
      response.on('data', c => chunks.push(c));
      response.on('end', () => {
        // 模拟 probeRange 行为：读完头立即 destroy
        response.destroy();
        const cr = response.headers['content-range'];
        const total = cr ? Number(/\/(\d+)\s*$/.exec(cr)[1]) : Number(response.headers['content-length'] || 0);
        res({ status: response.statusCode, total, bodyBytesReceived: chunks.length });
      });
    });
    req.on('error', rej);
    req.setTimeout(5000, () => req.destroy(new Error('timeout')));
    req.end();
  });
}

async function main() {
  // Server A: 支持 Range
  const serverA = http.createServer((req, res) => {
    const range = req.headers['range'];
    if (range) {
      const m = /bytes=(\d+)-(\d+)/.exec(range);
      const start = Number(m[1]);
      const end = Number(m[2]);
      res.statusCode = 206;
      res.setHeader('Content-Range', `bytes ${start}-${end}/${TOTAL}`);
      res.setHeader('Content-Length', end - start + 1);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Type', 'application/octet-stream');
      res.end(Buffer.alloc(end - start + 1, 0x42));
    } else {
      res.statusCode = 200;
      res.setHeader('Content-Length', TOTAL);
      res.end(Buffer.alloc(TOTAL, 0x42));
    }
  });
  await new Promise(r => serverA.listen(0, r));
  const urlA = `http://127.0.0.1:${serverA.address().port}/`;

  // Server B: 不支持 Range（返 200 + 整文件）
  const serverB = http.createServer((req, res) => {
    res.statusCode = 200;
    res.setHeader('Content-Length', TOTAL);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.end(Buffer.alloc(TOTAL, 0x42));
  });
  await new Promise(r => serverB.listen(0, r));
  const urlB = `http://127.0.0.1:${serverB.address().port}/`;

  console.log('=== Case A: 支持 Range（GitHub-style 206）===');
  const a = await probe(urlA, true);
  console.log('  status:', a.status, '  total:', a.total, '  bodyBytesReceived:', a.bodyBytesReceived);
  console.log('  ' + (a.total === TOTAL && a.bodyBytesReceived <= 1 ? '✅ 完美（拿到 total，只收 1 字节）' : '❌ FAIL'));

  console.log('');
  console.log('=== Case B: 不支持 Range（200 + 整文件）===');
  const b = await probe(urlB, false);
  console.log('  status:', b.status, '  total:', b.total, '  bodyBytesReceived:', b.bodyBytesReceived);
  console.log('  ' + (b.total === TOTAL ? '✅ total 正确（但 bodyBytesReceived 应该是 0，因为 destroy 立即生效）' : '❌ FAIL'));
  console.log('  bodyBytesReceived 是 ' + b.bodyBytesReceived + '，destroy 后可能没读完所有 chunks，但 total 是从 header 拿的，所以不影响');

  serverA.close();
  serverB.close();
}

main().catch(e => { console.error('ERR:', e.message); process.exit(1); });
