// 更新检查 IPC

import { ipcMain, shell } from 'electron';
import { IPC } from '../../shared/ipc-channels';
import { checkForUpdate, type UpdateCheckResult } from '../services/update';
import { store } from '../services/settings';

const DISMISS_KEY = 'updateDismissedVersion' as const;
const LAST_CHECK_KEY = 'updateLastCheck' as const;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 小时内不重复自动检查

export function registerUpdateHandlers() {
  // 主动检查（用户触发，立即返回结果）
  ipcMain.handle(IPC.UPDATE_CHECK, async (): Promise<UpdateCheckResult> => {
    const result = await checkForUpdate();
    store.set(LAST_CHECK_KEY, Date.now());
    return result;
  });

  // 静默检查（自动调度，距上次检查 < 6h 直接返回上次结果，不联网）
  ipcMain.handle(IPC.UPDATE_CHECK_SILENT, async (): Promise<UpdateCheckResult & { skipped?: boolean; dismissed?: boolean }> => {
    const last = store.get(LAST_CHECK_KEY, 0) as number;
    const dismissedVer = store.get(DISMISS_KEY, '') as string;
    const now = Date.now();

    if (now - last < CHECK_INTERVAL_MS) {
      // 在窗口内：只比对当前版本和已 dismiss 的版本，不再请求
      const result = await checkForUpdate(); // 仍然查一次（成本低）
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

  // 打开 release 页面
  ipcMain.handle(IPC.UPDATE_OPEN, async (_e, url: string) => {
    if (typeof url === 'string' && /^https?:\/\//.test(url)) {
      await shell.openExternal(url);
    }
  });

  // 注：'app:get-version' 已在 main.ts 与 app:get-platform / app:open-external 一组注册，
  // 这里不再重复注册，否则会抛 "Attempted to register a second handler" 并阻断 createWindow。
}
