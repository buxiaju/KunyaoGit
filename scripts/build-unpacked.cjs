// 手动构造 win-unpacked 目录（绕过 electron-builder 的 GitHub 下载）
// 用法：node scripts/build-unpacked.cjs
//
// 流程：
//   1) 复制 Electron runtime（除 electron.exe 外的所有文件）
//   2) 重命名 electron.exe -> kunyaogit.exe
//   3) 在 release/app-stage/ 下暂存 dist/、dist-electron/、package.json
//   4) npm install --omit=dev 装生产依赖到 app-stage/node_modules/
//   5) @electron/asar pack 把 stage 打包成 resources/app.asar
//   6) 清理 stage 目录

const fs = require('node:fs');
const path = require('node:path');
const { execSync, spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const PKG = require(path.join(ROOT, 'package.json'));
const VERSION = PKG.version;
const PRODUCT = PKG.name; // 'kunyaogit'

const SOURCE_ELECTRON_DIST = path.join(ROOT, 'node_modules', 'electron', 'dist');
const DIST = path.join(ROOT, 'dist');
const DIST_ELECTRON = path.join(ROOT, 'dist-electron');

const TARGET = path.join(ROOT, 'release', 'win-unpacked-v2');
const APP_RESOURCES = path.join(TARGET, 'resources');
const STAGE = path.join(ROOT, 'release', 'app-stage');
const ASAR_BIN = path.join(ROOT, 'node_modules', '@electron', 'asar', 'bin', 'asar.js');

function log(...a) { console.log('[unpacked]', ...a); }

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else if (entry.isFile()) fs.copyFileSync(s, d);
  }
}

function rmrf(p) {
  if (!fs.existsSync(p)) return;
  fs.rmSync(p, { recursive: true, force: true });
}

async function main() {
  if (!fs.existsSync(SOURCE_ELECTRON_DIST)) throw new Error('node_modules/electron/dist 缺失');
  if (!fs.existsSync(DIST) || !fs.existsSync(DIST_ELECTRON)) throw new Error('dist/ 或 dist-electron/ 缺失');
  if (!fs.existsSync(ASAR_BIN)) throw new Error('@electron/asar 未安装');

  log('清理旧的 win-unpacked');
  rmrf(TARGET);
  fs.mkdirSync(TARGET, { recursive: true });

  log('1) 复制 Electron runtime（除 electron.exe 外的所有文件）');
  for (const entry of fs.readdirSync(SOURCE_ELECTRON_DIST, { withFileTypes: true })) {
    if (entry.name === 'electron.exe') continue;
    const s = path.join(SOURCE_ELECTRON_DIST, entry.name);
    const d = path.join(TARGET, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }

  log('2) 重命名 electron.exe -> ' + PRODUCT + '.exe');
  fs.copyFileSync(path.join(SOURCE_ELECTRON_DIST, 'electron.exe'), path.join(TARGET, PRODUCT + '.exe'));

  log('2.5) 嵌入应用图标到 kunyaogit.exe');
  const iconIco = path.join(ROOT, 'assets', 'icon.ico');
  if (fs.existsSync(iconIco)) {
    try {
      // rcedit 5.x is ESM-only, use dynamic import from CJS
      const rceditModule = await import('rcedit');
      const rcedit = rceditModule.rcedit || rceditModule.default;
      await rcedit(path.join(TARGET, PRODUCT + '.exe'), {
        icon: iconIco,
        'version-string': {
          ProductName: 'KunyaoGit',
          CompanyName: 'kunyao',
          FileDescription: 'KunyaoGit - Git GUI client for GitHub and Gitee',
          LegalCopyright: 'Copyright (c) 2026 kunyao',
          OriginalFilename: PRODUCT + '.exe',
        },
      });
      log('   图标已嵌入');
    } catch (e) {
      log('   嵌入失败（可忽略）:', e.message);
    }
  } else {
    log('   跳过（找不到 assets/icon.ico）');
  }

  log('3) 准备 resources/ 目录');
  fs.mkdirSync(APP_RESOURCES, { recursive: true });

  log('4) 暂存 dist/、dist-electron/、package.json 到 app-stage/');
  rmrf(STAGE);
  fs.mkdirSync(STAGE, { recursive: true });
  copyDir(DIST, path.join(STAGE, 'dist'));
  copyDir(DIST_ELECTRON, path.join(STAGE, 'dist-electron'));
  fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(STAGE, 'package.json'));

  log('5) npm install --omit=dev（生产依赖）');
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const r = spawnSync(npmCmd, ['install', '--omit=dev', '--no-save', '--no-audit', '--no-fund', '--prefer-offline'], {
    cwd: STAGE,
    stdio: 'inherit',
    shell: true,
  });
  if (r.status !== 0) throw new Error('npm install 失败 (exit ' + r.status + ')');

  log('6) @electron/asar pack -> resources/app.asar');
  const asarOut = path.join(APP_RESOURCES, 'app.asar');
  const r2 = spawnSync(process.execPath, [ASAR_BIN, 'pack', STAGE, asarOut, '--unpack-dir=node_modules'], {
    stdio: 'inherit',
  });
  if (r2.status !== 0) throw new Error('asar pack 失败 (exit ' + r2.status + ')');

  log('7) 清理 staging 目录');
  rmrf(STAGE);

  const asarSize = (fs.statSync(asarOut).size / 1024 / 1024).toFixed(2);
  log('✅ win-unpacked 构建完成');
  log('位置:', TARGET);
  log('主程序:', path.join(TARGET, PRODUCT + '.exe'), '(' + (fs.statSync(path.join(TARGET, PRODUCT + '.exe')).size / 1024 / 1024).toFixed(2) + ' MB)');
  log('app.asar:', asarOut, '(' + asarSize + ' MB)');

  // 试启动
  log('--- 试启动（3 秒后自动关） ---');
  try {
    const exe = path.join(TARGET, PRODUCT + '.exe');
    const p = require('node:child_process').spawn(exe, [], { detached: true, stdio: 'ignore' });
    setTimeout(() => { try { process.kill(p.pid); } catch {} }, 3000);
    log('启动了 (pid ' + p.pid + ')，3 秒后自动 kill');
  } catch (e) {
    log('试启动失败（可忽略）:', e.message);
  }
}

main();
