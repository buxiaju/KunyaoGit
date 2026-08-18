const crypto = require('crypto');
const url = require('url');
const path = require('path');

const dl = 'https://github.com/electron/electron/releases/download/v33.4.11/electron-v33.4.11-win32-x64.zip';
const u = url.parse(dl);
const { search, hash, pathname, ...rest } = u;
const stripped = url.format({ ...rest, pathname: path.dirname(pathname || 'electron') });
const dir = crypto.createHash('sha256').update(stripped).digest('hex');
console.log('stripped URL:', stripped);
console.log('cache dir:', dir);
console.log('target cache file:', path.join(process.env.LOCALAPPDATA, 'electron-builder', 'Cache', dir, 'electron-v33.4.11-win32-x64.zip'));
