const https = require('node:https');
const TOKEN = process.env.GH_TOKEN;
const VERSION = process.env.GH_VERSION || require('../../package.json').version;
const tagUrl = new URL(`https://api.github.com/repos/buxiaju/KunyaoGit/releases/tags/v${VERSION}`);
https.request({
  hostname: tagUrl.hostname,
  method: 'GET',
  path: tagUrl.pathname,
  headers: {
    'Authorization': 'token ' + TOKEN,
    'User-Agent': 'KunyaoGit-publish',
    'Accept': 'application/vnd.github+json',
  },
}, (res) => {
  const cs = [];
  res.on('data', c => cs.push(c));
  res.on('end', () => {
    const j = JSON.parse(Buffer.concat(cs).toString('utf-8'));
    console.log(`Release v${VERSION}: ${j.html_url}`);
    for (const a of j.assets) {
      console.log(`  ${a.name}  ${(a.size/1024/1024).toFixed(2)} MB  ${a.browser_download_url}`);
    }
  });
}).end();
