const https = require('node:https');

const opts = {
  hostname: 'api.github.com',
  method: 'GET',
  path: '/repos/electron/electron/releases/tags/v33.4.11',
  headers: {
    'User-Agent': 'KunyaoGit-build/0.1',
    'Accept': 'application/vnd.github+json',
  },
};
const req = https.request(opts, (res) => {
  const cs = [];
  res.on('data', (c) => cs.push(c));
  res.on('end', () => {
    const text = Buffer.concat(cs).toString('utf-8');
    if (res.statusCode !== 200) { console.log('status', res.statusCode, text.slice(0, 200)); return; }
    const rel = JSON.parse(text);
    const a = rel.assets.find(x => x.name === 'electron-v33.4.11-win32-x64.zip');
    if (a) console.log('name:', a.name, '\ndigest:', a.digest, '\nsize:', a.size, 'bytes');
  });
});
req.on('error', console.error);
req.end();
