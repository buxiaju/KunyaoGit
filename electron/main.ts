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
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.setAppUserModelId('com.kunyao.kunyaogit');

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

  // 暴露给渲染进程的安全 API
  ipcMain.handle('app:get-platform', () => process.platform);
  ipcMain.handle('app:get-version', () => app.getVersion());
  ipcMain.handle('app:open-external', (_, url: string) => shell.openExternal(url));

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
