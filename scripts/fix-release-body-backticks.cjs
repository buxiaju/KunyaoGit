// 一次性修复：RELEASE_BODY 模板字符串内未转义的反引号 / ${ 插值
// 用法：node scripts/fix-release-body-backticks.cjs
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FILES = [
  'scripts/publish/publish-v063.cjs',
  'scripts/publish/update-gitee-body.cjs',
];

const START = 'const RELEASE_BODY = `';
const END_RE = /\r?\n`;\r?\n/;

for (const rel of FILES) {
  const abs = path.join(ROOT, rel);
  let s = fs.readFileSync(abs, 'utf-8');

  const i = s.indexOf(START);
  if (i < 0) { console.log('[skip] no start marker:', rel); continue; }
  const bodyStart = i + START.length;

  const m = END_RE.exec(s.slice(bodyStart));
  if (!m) { console.log('[skip] no end marker:', rel); continue; }
  const j = bodyStart + m.index;

  let body = s.slice(bodyStart, j);

  // 先反转义，避免重复运行造成双重转义
  const plain = body.replace(/\\`/g, '`').replace(/\\\$\{/g, '${');
  const rawTicks = (plain.match(/`/g) || []).length;
  const rawInterp = (plain.match(/\$\{/g) || []).length;

  const escaped = plain.replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

  if (escaped === body) { console.log('[ok] already escaped:', rel); continue; }

  s = s.slice(0, bodyStart) + escaped + s.slice(j);
  fs.writeFileSync(abs, s, 'utf-8');
  console.log(`[fixed] ${rel} — escaped ${rawTicks} backticks, ${rawInterp} \${ interpolations`);
}
