// 手动构造 win-unpacked 目录（绕过 electron-builder 的 GitHub 下载）
// 用法：node scripts/build-unpacked.cjs

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const PKG = require(path.join(ROOT, 'package.json'));
const VERSION = PKG.version;
const PRODUCT = PKG.name; // 'kunyaogit'

const SOURCE_ELECTRON_DIST = path.join(ROOT, 'node_modules', 'electron', 'dist');
const DIST = path.join(ROOT, 'dist');
const DIST_ELECTRON = path.join(ROOT, 'dist-electron');
const TARGET = path.join(ROOT, 'release', 'win-unpacked');
const APP_RESOURCES = path.join(TARGET, 'resources');
const APP_DIR = path.join(APP_RESOURCES, 'app');

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

function main() {
  if (!fs.existsSync(SOURCE_ELECTRON_DIST)) throw new Error('node_modules/electron/dist 缺失');
  if (!fs.existsSync(DIST) || !fs.existsSync(DIST_ELECTRON)) throw new Error('dist/ 或 dist-electron/ 缺失');

  log('清理旧的 win-unpacked');
  if (fs.existsSync(TARGET)) fs.rmSync(TARGET, { recursive: true, force: true });
  fs.mkdirSync(TARGET, { recursive: true });

  log('1) 复制 Electron runtime（除 electron.exe 外的所有文件）');
  for (const entry of fs.readdirSync(SOURCE_ELECTRON_DIST, { withFileTypes: true })) {
    if (entry.name === 'electron.exe') continue; // 单独处理并改名
    const s = path.join(SOURCE_ELECTRON_DIST, entry.name);
    const d = path.join(TARGET, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }

  log('2) 重命名 electron.exe -> ' + PRODUCT + '.exe');
  fs.copyFileSync(path.join(SOURCE_ELECTRON_DIST, 'electron.exe'), path.join(TARGET, PRODUCT + '.exe'));

  log('3) 准备 resources/app/');
  fs.mkdirSync(APP_DIR, { recursive: true });

  log('4) 复制 dist/');
  copyDir(DIST, path.join(APP_DIR, 'dist'));
  log('5) 复制 dist-electron/');
  copyDir(DIST_ELECTRON, path.join(APP_DIR, 'dist-electron'));
  log('6) 复制 package.json');
  fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(APP_DIR, 'package.json'));

  // 写一个 .gitkeep 让 resources 目录被 git 跟踪
  log('✅ win-unpacked 构建完成');
  log('位置:', TARGET);
  log('主程序:', path.join(TARGET, PRODUCT + '.exe'));
  log('大小:', (fs.statSync(path.join(TARGET, PRODUCT + '.exe')).size / 1024 / 1024).toFixed(2), 'MB');

  // 试启动一下确认能跑
  log('--- 试启动（3 秒后自动关） ---');
  try {
    const exe = path.join(TARGET, PRODUCT + '.exe');
    const p = require('node:child_process').spawn(exe, [], { detached: true, stdio: 'ignore' });
    setTimeout(() => { try { p.kill(); } catch {} }, 3000);
    log('启动了 (pid ' + p.pid + ')，3 秒后自动 kill');
  } catch (e) {
    log('试启动失败（可忽略，文件已就位）:', e.message);
  }
}

main();
