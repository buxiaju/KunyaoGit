// 验证 GitService 修复后的 commit / checkout / createBranch 行为（全部用 simple-git，不 spawn shell）
const simpleGit = require('simple-git');
const fs = require('fs');
const path = require('path');
const os = require('os');

(async () => {
  const root = path.join(os.tmpdir(), 'kg-fix-test-' + Date.now());
  const localDir = path.join(root, 'local');
  const remoteDir = path.join(root, 'remote.git');
  fs.mkdirSync(localDir, { recursive: true });
  fs.mkdirSync(remoteDir, { recursive: true });

  const gitLocal = simpleGit({ baseDir: localDir, maxConcurrentProcesses: 4 });
  const gitRemote = simpleGit({ baseDir: remoteDir });

  await gitRemote.raw(['init', '--bare', '-b', 'main']);
  await gitLocal.init(['-b', 'main']);
  await gitLocal.raw(['config', 'user.name', 'tester']);
  await gitLocal.raw(['config', 'user.email', 't@t.com']);
  await gitLocal.raw(['remote', 'add', 'origin', remoteDir]);
  const rawLocal = (args) => gitLocal.raw(args);
  const rawRemote = (args) => gitRemote.raw(args);

  fs.writeFileSync(path.join(localDir, 'a.txt'), 'hello v1');

  // 1) stage
  await gitLocal.add(['a.txt']);
  console.log('== stage 后 status ==');
  console.log((await rawLocal(['status', '--short'])) || '(空)');

  // 2) commit —— 修复后的调用方式：commit([message], options[])
  console.log('\n== commit([msg], []) ==');
  const r = await gitLocal.commit(['提交测试 v1'], []);
  console.log('commit result:', JSON.stringify(r));
  if (!r.commit) { console.log('❌ commit 仍返回空！'); process.exit(1); }
  console.log('staged 是否清空:', (await rawLocal(['status', '--short'])) || '(空 = 已清空)');
  console.log('log:', (await rawLocal(['log', '--oneline', '-1'])).trim());

  // 3) push -u origin main
  console.log('\n== push(["-u", "origin", "main"]) ==');
  const p = await gitLocal.push(['-u', 'origin', 'main']);
  console.log('push pushed refs:', JSON.stringify(p.pushed), 'branch:', p.ref?.local);
  console.log('远程是否有提交:', (await rawRemote(['log', '--oneline', '-1'])).trim());

  // 4) 再提交并直接 push（走 upstream）
  fs.writeFileSync(path.join(localDir, 'b.txt'), 'hello v2');
  await gitLocal.add(['b.txt']);
  await gitLocal.commit(['提交测试 v2'], []);
  await gitLocal.push();
  console.log('\n== 第二次 push 后远程 log ==');
  console.log((await rawRemote(['log', '--oneline', '-2'])).trim());

  // 5) checkout / createBranch 修复验证
  console.log('\n== createBranch 走 checkout(["-b", name]) ==');
  await gitLocal.checkout(['-b', 'feature-x']);
  console.log('当前分支:', (await rawLocal(['branch', '--show-current'])).trim());
  await gitLocal.checkout(['main']);
  console.log('切回 main:', (await rawLocal(['branch', '--show-current'])).trim());

  fs.rmSync(root, { recursive: true, force: true });
  console.log('\n✅ 全部通过');
  process.exit(0);
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
