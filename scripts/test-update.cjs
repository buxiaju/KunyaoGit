// Quick sanity check: hit GitHub + Gitee APIs to verify they return the expected shape
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
          catch { resolve({ status: res.statusCode, text }); }
        });
      }
    );
    req.on('error', reject);
  });
}

(async () => {
  console.log('--- GitHub latest release ---');
  const gh = await get('https://api.github.com/repos/buxiaju/KunyaoGit/releases/latest');
  console.log('status:', gh.status);
  if (gh.data) {
    console.log('tag:', gh.data.tag_name);
    console.log('name:', gh.data.name);
    console.log('assets:', (gh.data.assets || []).map(a => `${a.name} (${a.size})`));
  } else {
    console.log('text:', gh.text?.slice(0, 200));
  }

  console.log('\n--- Gitee latest release ---');
  const gt = await get('https://gitee.com/api/v5/repos/buxiaju/KunyaoGit/releases/latest');
  console.log('status:', gt.status);
  if (gt.data) {
    console.log('tag:', gt.data.tag_name);
    console.log('name:', gt.data.name);
    console.log('assets:', (gt.data.assets || []).map(a => `${a.name} (${a.size})`));
  } else {
    console.log('text:', gt.text?.slice(0, 200));
  }
})();
