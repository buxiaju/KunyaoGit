// 验证 GitService.commit 的 raw 实现（正常 / 无暂存诊断 / amend）
const simpleGit = require('simple-git');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function commitLike(git, message, opts = {}) {
  const args = ['commit', '-m', message];
  if (opts.signOff) args.push('--signoff');
  if (opts.amend) args.push('--amend');
  const out = await git.raw(args);
  const m = out.match(/\[([^\s]+)(?: \([^)]+\))? ([0-9a-f]{7,40})\]/i);
  if (!m) {
    return { ok: false, out: out.trim().slice(0, 200) };
  }
  return { ok: true, hash: m[2] };
}

(async () => {
  const dir = path.join(os.tmpdir(), 'kg-raw-' + Date.now());
  fs.mkdirSync(dir, { recursive: true });
  const git = simpleGit({ baseDir: dir });
  await git.raw(['init', '-b', 'main']);
  await git.raw(['config', 'user.name', 't']);
  await git.raw(['config', 'user.email', 't@t.com']);

  // 场景 1：正常提交
  fs.writeFileSync(path.join(dir, 'a.txt'), 'hello');
  await git.add(['a.txt']);
  const r1 = await commitLike(git, 'first commit');
  console.log('1) 正常提交:', r1.ok ? '✅ hash=' + r1.hash : '❌ ' + r1.out);

  // 场景 2：无暂存（nothing to commit）—— 诊断输出
  const r2 = await commitLike(git, 'nothing commit');
  console.log('2) 无暂存提交:', r2.ok ? '✅ (意外)' : '❌ (预期) 输出: ' + JSON.stringify(r2.out));

  // 场景 3：amend
  fs.writeFileSync(path.join(dir, 'b.txt'), 'hello2');
  await git.add(['b.txt']);
  const r3 = await commitLike(git, 'second commit');
  const r4 = await commitLike(git, 'second commit amended', { amend: true });
  console.log('3) 第二次提交:', r3.ok ? '✅ ' + r3.hash : '❌ ' + r3.out);
  console.log('4) amend:', r4.ok ? '✅ ' + r4.hash : '❌ ' + r4.out);
  console.log('   log:', (await git.raw(['log', '--oneline', '-3'])).trim());

  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(0);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
