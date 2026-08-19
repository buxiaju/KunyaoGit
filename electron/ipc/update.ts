// 更新检查 IPC + 应用内下载安装

import { app, ipcMain, shell, type IpcMainInvokeEvent, type WebContents } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { type ClientRequest, type IncomingMessage } from 'node:http';
import { URL } from 'node:url';
import { IPC } from '../../shared/ipc-channels';
import { checkForUpdate, type UpdateCheckResult } from '../services/update';
import { store } from '../services/settings';
import type { DownloadProgress } from '../../shared/types';

const DISMISS_KEY = 'updateDismissedVersion' as const;
const LAST_CHECK_KEY = 'updateLastCheck' as const;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 小时内不重复自动检查

const GITHUB_REPO = 'buxiaju/KunyaoGit';
const GITEE_REPO = 'buxiaju/KunyaoGit';
const INSTALLER_NAME = (ver: string) => `KunyaoGit-Setup-${ver}-x64.exe`;

// 下载源：Gitee raw（国内快）优先，GitHub CDN 兜底
function downloadSources(ver: string): { platform: 'gitee' | 'github'; url: string }[] {
  return [
    {
      platform: 'gitee',
      url: `https://gitee.com/${GITEE_REPO}/raw/master/.release-assets/${INSTALLER_NAME(ver)}`,
    },
    {
      platform: 'github',
      url: `https://github.com/${GITHUB_REPO}/releases/download/v${ver}/${INSTALLER_NAME(ver)}`,
    },
  ];
}

// 模块级下载状态（用于取消）
interface ActiveDownload {
  req: ClientRequest | null;
  cancelled: boolean;
  sender: WebContents | null;
}
let active: ActiveDownload | null = null;

function sendProgress(sender: WebContents | null, p: DownloadProgress) {
  if (!sender || sender.isDestroyed()) return;
  try { sender.send(IPC.UPDATE_DOWNLOAD_PROGRESS, p); } catch { /* 窗口可能已关 */ }
}

// 跟随 3xx 重定向的 GET；返回最终响应流。可被外部 req 引用取消。
function getFollow(
  url: string,
  onReq: (req: ClientRequest) => void,
  maxRedirects = 8,
): Promise<{ res: IncomingMessage; finalUrl: string }> {
  return new Promise((resolve, reject) => {
    const visit = (u: string, left: number) => {
      const urlObj = new URL(u);
      const req = https.get(
        {
          hostname: urlObj.hostname,
          path: urlObj.pathname + urlObj.search,
          method: 'GET',
          headers: {
            'User-Agent': 'KunyaoGit-updater',
            'Accept': 'application/octet-stream, */*',
          },
          timeout: 20000,
        },
        (res) => {
          // 重定向
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume(); // 丢弃当前响应体
            if (left <= 0) { reject(new Error('重定向次数过多')); return; }
            const next = new URL(res.headers.location, u).toString();
            visit(next, left - 1);
            return;
          }
          resolve({ res, finalUrl: u });
        },
      );
      req.on('error', reject);
      req.on('timeout', () => req.destroy(new Error('连接超时')));
      onReq(req); // 让外部能取消
    };
    visit(url, maxRedirects);
  });
}

export function registerUpdateHandlers() {
  // 主动检查（用户触发，立即返回结果）
  ipcMain.handle(IPC.UPDATE_CHECK, async (): Promise<UpdateCheckResult> => {
    const result = await checkForUpdate();
    store.set(LAST_CHECK_KEY, Date.now());
    return result;
  });

  // 静默检查（自动调度，6h 内复用上次结果逻辑）
  ipcMain.handle(IPC.UPDATE_CHECK_SILENT, async (): Promise<UpdateCheckResult & { skipped?: boolean; dismissed?: boolean }> => {
    const last = store.get(LAST_CHECK_KEY, 0) as number;
    const dismissedVer = store.get(DISMISS_KEY, '') as string;
    const now = Date.now();

    if (now - last < CHECK_INTERVAL_MS) {
      const result = await checkForUpdate();
      store.set(LAST_CHECK_KEY, now);
      const dismissed = !!(dismissedVer && result.latest && result.latest.version === dismissedVer);
      return { ...result, dismissed };
    }
    const result = await checkForUpdate();
    store.set(LAST_CHECK_KEY, now);
    const dismissed = !!(dismissedVer && result.latest && result.latest.version === dismissedVer);
    return { ...result, dismissed };
  });

  // 标记某个版本为"已忽略"
  ipcMain.handle(IPC.UPDATE_DISMISS, async (_e, version: string) => {
    store.set(DISMISS_KEY, version);
  });

  // 打开 release 页面（保留作为浏览器手动下载的兜底）
  ipcMain.handle(IPC.UPDATE_OPEN, async (_e, url: string) => {
    if (typeof url === 'string' && /^https?:\/\//.test(url)) {
      await shell.openExternal(url);
    }
  });

  // 应用内下载安装包。参数：{ version }
  // 流程：依次尝试 Gitee raw → GitHub CDN，把数据流写到 temp 目录，
  // 通过 UPDATE_DOWNLOAD_PROGRESS 事件回报进度，完成后返回 { filePath }。
  ipcMain.handle(IPC.UPDATE_DOWNLOAD, async (e: IpcMainInvokeEvent, { version }: { version: string }) => {
    if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
      throw new Error('版本号无效');
    }
    // 已有下载在跑，先取消
    if (active && active.req) {
      active.cancelled = true;
      try { active.req.destroy(); } catch {}
    }
    const sender = e.sender;
    active = { req: null, cancelled: false, sender };

    const destDir = app.getPath('temp');
    const destPath = path.join(destDir, INSTALLER_NAME(version));
    sendProgress(sender, { phase: 'preparing', percent: 0, bytesReceived: 0, totalBytes: 0 });

    const sources = downloadSources(version);
    let lastErr: Error | null = null;

    for (const src of sources) {
      if (active && active.cancelled) break;
      try {
        const { res, finalUrl } = await getFollow(src.url, (req) => { if (active) active.req = req; });
        if (active && active.cancelled) { res.resume(); break; }

        // Gitee raw 对大文件可能返回 HTML（下载页）而非真实文件——靠 Content-Type 判断
        const ct = res.headers['content-type'] || '';
        const statusOk = res.statusCode && res.statusCode >= 200 && res.statusCode < 300;
        if (!statusOk) {
          res.resume();
          lastErr = new Error(`${src.platform} HTTP ${res.statusCode}`);
          continue;
        }
        if (/text\/html/i.test(ct) && src.platform === 'gitee') {
          res.resume();
          lastErr = new Error('Gitee raw 返回 HTML（可能大文件受限）');
          continue;
        }

        const total = Number(res.headers['content-length'] || 0);
        const fileStream = fs.createWriteStream(destPath);
        let received = 0;
        sendProgress(sender, {
          phase: 'downloading',
          percent: total > 0 ? 0 : -1,
          bytesReceived: 0,
          totalBytes: total,
          source: src.platform,
        });

        const finished = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
          res.on('data', (chunk: Buffer) => {
            if (active && active.cancelled) {
              res.destroy();
              fileStream.destroy();
              resolve({ ok: false, error: 'cancelled' });
              return;
            }
            received += chunk.length;
            fileStream.write(chunk);
            sendProgress(sender, {
              phase: 'downloading',
              percent: total > 0 ? Math.min(100, Math.round((received / total) * 100)) : -1,
              bytesReceived: received,
              totalBytes: total,
              source: src.platform,
            });
          });
          res.on('end', () => {
            fileStream.end(() => {
              resolve({ ok: true });
            });
          });
          res.on('error', (err: Error) => {
            try { fileStream.destroy(); } catch {}
            resolve({ ok: false, error: err.message });
          });
          fileStream.on('error', (err: Error) => {
            resolve({ ok: false, error: err.message });
          });
        });

        if (active && active.cancelled) {
          try { fs.unlinkSync(destPath); } catch {}
          sendProgress(sender, { phase: 'cancelled', percent: 0, bytesReceived: 0, totalBytes: 0, message: '已取消下载' });
          active = null;
          return { filePath: '', cancelled: true };
        }
        if (finished.ok) {
          active = null;
          sendProgress(sender, {
            phase: 'done',
            percent: 100,
            bytesReceived: received,
            totalBytes: total || received,
            source: src.platform,
            filePath: destPath,
            message: `下载完成（来自 ${src.platform}）`,
          });
          return { filePath: destPath, source: src.platform };
        }
        lastErr = new Error(finished.error || '下载中断');
        // 继续尝试下一个源
      } catch (err) {
        lastErr = err as Error;
        // 继续尝试下一个源
      }
    }

    active = null;
    const msg = lastErr ? lastErr.message : '所有下载源都失败';
    sendProgress(sender, { phase: 'error', percent: 0, bytesReceived: 0, totalBytes: 0, message: msg });
    throw new Error(msg);
  });

  // 取消正在进行的下载
  ipcMain.handle(IPC.UPDATE_CANCEL_DOWNLOAD, async () => {
    if (active) {
      active.cancelled = true;
      if (active.req) { try { active.req.destroy(); } catch {} }
    }
  });

  // 启动已下载的安装包并退出当前应用，让 NSIS 安装器覆盖替换文件
  ipcMain.handle(IPC.UPDATE_INSTALL, async (_e, { filePath }: { filePath: string }) => {
    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error('安装包不存在：' + filePath);
    }
    // shell.openPath 在 Windows 上启动 .exe，返回 '' 表示成功
    const err = await shell.openPath(filePath);
    if (err) {
      throw new Error('无法启动安装程序：' + err);
    }
    // 给安装器 1.5s 启动，然后退出本应用，避免 exe 文件被锁、安装器无法覆盖
    setTimeout(() => {
      try { app.quit(); } catch {}
    }, 1500);
    return { ok: true };
  });

  // 注：'app:get-version' 已在 main.ts 与 app:get-platform / app:open-external 一组注册，
  // 这里不再重复注册，否则会抛 "Attempted to register a second handler" 并阻断 createWindow。
}
