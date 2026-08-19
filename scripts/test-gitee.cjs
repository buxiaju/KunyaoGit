const https = require('node:https');
const { URL } = require('node:url');

function get(u) {
  return new Promise((resolve, reject) => {
    const url = new URL(u);
    const req = https.get(
      { hostname: url.hostname, path: url.pathname + url.search, headers: { 'User-Agent': 'KunyaoGit-updater' } },
      (res) => {
        const cs = [];
        res.on('data', c => cs.push(c));
        res.on('end', () => {
          const text = Buffer.concat(cs).toString('utf-8');
          try { resolve({ status: res.statusCode, data: JSON.parse(text) }); }
          catch { resolve({ status: res.statusCode, text: text.slice(0, 500) }); }
        });
      }
    );
    req.on('error', reject);
  });
}

(async () => {
  // Gitee: list all releases, then find the latest
  console.log('--- Gitee: list releases ---');
  const r = await get('https://gitee.com/api/v5/repos/buxiaju/KunyaoGit/releases?per_page=5');
  console.log('status:', r.status);
  if (Array.isArray(r.data)) {
    for (const rel of r.data) {
      console.log(`- ${rel.tag_name} | ${rel.name} | ${rel.html_url} | prerelease=${rel.prerelease} | draft=${rel.draft}`);
    }
  } else {
    console.log('text:', r.text);
  }
})();
