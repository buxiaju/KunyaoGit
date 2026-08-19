// 只删能删的，跳过 EBUSY 的文件，最后列出"残留"
// 用法：node scripts/debug/force-clean-skip.cjs <dir>
const fs = require('node:fs');
const path = require('node:path');

const target = process.argv[2];
if (!target) { console.error('用法: node force-clean-skip.cjs <dir>'); process.exit(1); }

const skipped = [];

function rmRecursive(p) {
  let st;
  try { st = fs.lstatSync(p); } catch { return; }
  if (st.isDirectory()) {
    let entries = [];
    try { entries = fs.readdirSync(p); } catch { return; }
    for (const e of entries) rmRecursive(path.join(p, e));
    for (let i = 0; i < 3; i++) {
      try { fs.rmdirSync(p); return; } catch { /* skip */ }
    }
  } else {
    for (let i = 0; i < 3; i++) {
      try {
        try { fs.chmodSync(p, 0o666); } catch {}
        fs.unlinkSync(p);
        return;
      } catch (e) {
        if (i === 2) {
          skipped.push(p);
          return;
        }
        const end = Date.now() + 200;
        while (Date.now() < end) {}
      }
    }
  }
}

rmRecursive(target);
console.log(`✅ 清理完毕，跳过 ${skipped.length} 个被锁文件：`);
for (const s of skipped) console.log('   ', s);
