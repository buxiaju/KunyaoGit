import { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme, session } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerGitHandlers } from './ipc/git.js';
import { registerFsHandlers } from './ipc/fs.js';
import { registerRepoHandlers } from './ipc/repo.js';
import { registerSettingsHandlers } from './ipc/settings.js';
import { registerGithubHandlers } from './ipc/github.js';
import { registerGiteeHandlers } from './ipc/gitee.js';
import { registerReleaseHandlers } from './ipc/release.js';
import { registerDialogHandlers } from './ipc/dialog.js';
import { registerUpdateHandlers } from './ipc/update.js';
import { registerAppHandlers } from './ipc/app.js';
import { assertSafeExternalUrl } from './lib/safeUrl.js';
import { installCrashGuards, handleCrash, type CrashGuardDeps } from './lib/crashGuard.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Vite 注入的环境变量
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const isDev = !!VITE_DEV_SERVER_URL;

// CSP：dev 模式放行 HMR，生产模式收紧
function setupCsp() {
  const csp = isDev
    ? "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: ws: http://localhost:* http://127.0.0.1:*; img-src 'self' data: https:; font-src 'self' data:;"
    : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: https:; connect-src 'self' https://api.github.com https://gitee.com https://api.gitee.com;";

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });
}

let mainWindow: BrowserWindow | null = null;

// ---------------------------------------------------------------------------
// 崩溃兜底（健壮性加固）
// 在模块顶层就安装，这样启动早期（whenReady 之前）的异常也能被捕获。
// app.getPath('userData') 只做路径计算，在 app ready 前调用是安全的。
// ---------------------------------------------------------------------------
const crashLogDir = path.join(app.getPath('userData'), 'logs');

function notifyCrash(kind: string, message: string) {
  const short = message.split('\n')[0]?.slice(0, 300) || '未知错误';
  const logFile = path.join(crashLogDir, 'main-error.log');
  const canReload = kind === 'renderProcessGone' || kind === 'loadFailed';
  const buttons = canReload ? ['重新加载界面', '继续运行', '退出应用'] : ['继续运行', '退出应用'];

  dialog
    .showMessageBox({
      type: 'error',
      title: 'KunyaoGit 遇到问题',
      message: `应用发生了一个未预期的错误（${kind}）`,
      detail: `${short}\n\n诊断日志已写入：\n${logFile}`,
      buttons,
      defaultId: 0,
      cancelId: canReload ? 1 : 0,
      noLink: true,
    })
    .then((r) => {
      const label = buttons[r.response];
      if (label === '退出应用') app.quit();
      else if (label === '重新加载界面') mainWindow?.webContents.reload();
    })
    .catch(() => {
      // 弹窗自身失败（例如无可用窗口）时不再升级处理
    });
}

const crashDeps: CrashGuardDeps = {
  logDir: crashLogDir,
  notify: (kind, message) => notifyCrash(kind, message),
};

installCrashGuards(crashDeps);

/** 统一的外部链接打开入口：只放行 http/https。 */
function openExternalSafely(url: unknown) {
  const checked = assertSafeExternalUrl(url);
  if (!checked.ok) {
    console.warn(`[security] 拒绝打开外部链接：${checked.error} (${String(url).slice(0, 200)})`);
    return { ok: false as const, error: checked.error };
  }
  shell.openExternal(checked.data).catch((e) => {
    console.warn(`[security] openExternal 失败：${(e as Error).message}`);
  });
  return { ok: true as const, data: undefined };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#111827',
    title: 'KunyaoGit',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // 把渲染层 console 转发到主进程 console（写到 vite.log）
  mainWindow.webContents.on('console-message', (_e, level, message, _line, _sourceId) => {
    const tag = ['debug', 'log', 'warn', 'error'][level] || 'log';
    console.log(`[renderer.${tag}] ${message}`);
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafely(url);
    return { action: 'deny' };
  });

  // --- 渲染进程健康监听（健壮性加固）---------------------------------------
  // 渲染进程崩溃后页面会变成空白，主进程原本完全不知情，用户只能强杀重启。
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    handleCrash(crashDeps, 'renderProcessGone', `reason=${details.reason} exitCode=${details.exitCode}`);
  });

  mainWindow.webContents.on('unresponsive', () => {
    handleCrash(crashDeps, 'windowUnresponsive', '渲染进程长时间无响应');
  });

  mainWindow.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL, isMainFrame) => {
    // -3 = ERR_ABORTED，属于正常的导航取消（例如 HMR 期间），不算故障
    if (!isMainFrame || errorCode === -3) return;
    handleCrash(crashDeps, 'loadFailed', `code=${errorCode} ${errorDescription} url=${validatedURL}`);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.setAppUserModelId('com.kunyao.kunyaogit');

// ---------------------------------------------------------------------------
// 单实例锁（健壮性加固 P1）
//
// 原本没有加锁，多开实例会有两个主进程同时读写 %APPDATA%/gitgui-settings.json。
// electron-store 是「读改写整个文件」的模式，并发写会互相覆盖，
// 极端情况下写入过程被打断就会产生半截 JSON —— 也就是 P0 修的那种「配置损坏」。
// 换言之：不加这把锁，配置损坏的成因就一直存在。
//
// 拿不到锁说明已有实例在运行：退出自己，并让已有实例把窗口拉到前台。
// ---------------------------------------------------------------------------
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // 用户再次启动应用（或双击关联文件）时，聚焦已有窗口而不是新开一个
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });

  bootstrap();
}

function bootstrap() {
app.whenReady().then(() => {
  setupCsp();

  // 注册所有 IPC 处理器
  registerGitHandlers();
  registerFsHandlers();
  registerRepoHandlers();
  registerSettingsHandlers();
  registerGithubHandlers();
  registerGiteeHandlers();
  registerReleaseHandlers();
  registerDialogHandlers();
  registerUpdateHandlers();
  registerAppHandlers();

  // 暴露给渲染进程的安全 API
  ipcMain.handle('app:get-platform', () => process.platform);
  ipcMain.handle('app:get-version', () => app.getVersion());
  ipcMain.handle('app:open-external', (_, url: string) => openExternalSafely(url));

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// 深色主题跟随系统
nativeTheme.themeSource = 'dark';
}
