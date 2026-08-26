// 应用级 IPC 处理器（健壮性加固 E：渲染层错误落盘）
//
// 背景：主进程有 crashGuard 把 `uncaughtException` / `unhandledRejection` 落盘，
// 但渲染进程的错误（`window.onerror` / `unhandledrejection`）只在 toast 上显示，
// 没说出来的「真实崩溃现场」全部丢失。
//
// 这里给渲染层开一个 `app:log-error` 通道，把原始 stack / message 落盘到
// `userData/logs/renderer-error.log`，与主进程日志独立：
//   - 1MB 轮转（复用 crashGuard 的 appendCrashLog）；
//   - 同样走 redactPath 避免泄露用户路径；
//   - 失败静默 —— 日志落盘不能反过来影响主进程稳定性。

import { ipcMain, app } from 'electron';
import { IPC } from '../../shared/ipc-channels';
import { appendCrashLog } from '../lib/crashGuard';
import { redactPath } from '../lib/safePath';

/** 渲染层传过来的错误条目形态。 */
export interface RendererErrorEntry {
  /** 错误类型，区分 unhandledrejection / error / 自定义。 */
  kind: 'unhandledrejection' | 'error' | 'manual';
  /** 错误消息（可能含 stack / 用户路径）。 */
  message: string;
  /** 发生时的 URL（一般是 `http://localhost:5173/...` 或 `file://...`）。 */
  url?: string;
  /** 发生时间（ISO 字符串）。 */
  timestamp?: string;
}

/** 测试 / 外部用：自定义日志目录。 */
export interface LogErrorDeps {
  logDir: string;
}

/** 默认实现：写到 userData/logs。 */
const defaultDeps = (): LogErrorDeps => {
  try {
    return { logDir: app.getPath('logs') };
  } catch {
    // app 不可用（极少见，仅早期测试环境）；fallback 到当前目录
    return { logDir: process.cwd() };
  }
};

/**
 * 格式化渲染层错误为一条日志文本。纯函数，便于测试。
 * 路径部分走 redactPath 脱敏。
 */
export function formatRendererError(entry: RendererErrorEntry, now: Date = new Date()): string {
  const ts = entry.timestamp || now.toISOString();
  const safe = redactPath(entry.message);
  const url = entry.url ? ` @ ${entry.url}` : '';
  return `[${ts}] [renderer:${entry.kind}]${url} ${safe}\n`;
}

let deps: LogErrorDeps = defaultDeps();

/** 测试用：覆盖日志目录。 */
export function _setLogErrorDepsForTest(d: LogErrorDeps): void {
  deps = d;
}

/** 测试用：恢复默认。 */
export function _resetLogErrorDepsForTest(): void {
  deps = defaultDeps();
}

export function registerAppHandlers() {
  ipcMain.handle(IPC.APP_LOG_ERROR, async (_e, entry: RendererErrorEntry) => {
    // 形态校验：渲染层被 XSS 时可能传奇怪对象，最小防御
    if (!entry || typeof entry !== 'object') return { ok: false, error: '无效的错误条目' };
    const kind = entry.kind;
    if (kind !== 'unhandledrejection' && kind !== 'error' && kind !== 'manual') {
      return { ok: false, error: '未知的错误类型' };
    }
    if (typeof entry.message !== 'string' || entry.message.length === 0) {
      return { ok: false, error: '错误消息为空' };
    }
    // 单条上限 16KB：防止恶意/异常情况下写入巨大字符串撑爆日志
    const truncated = entry.message.length > 16 * 1024 ? entry.message.slice(0, 16 * 1024) + '\n...(truncated)' : entry.message;
    const text = formatRendererError({ ...entry, message: truncated });
    // 文件名独立于主进程 main-error.log，方便用户/开发者区分
    try {
      const fs = require('node:fs') as typeof import('node:fs');
      const pathMod = require('node:path') as typeof import('node:path');
      fs.mkdirSync(deps.logDir, { recursive: true });
      const file = pathMod.join(deps.logDir, 'renderer-error.log');
      try {
        const stat = fs.statSync(file);
        if (stat.size > 1024 * 1024) {
          fs.renameSync(file, pathMod.join(deps.logDir, 'renderer-error.1.log'));
        }
      } catch {
        /* 首次写入 */
      }
      fs.appendFileSync(file, text, 'utf-8');
    } catch {
      // 任何写盘失败都吞掉 —— 日志不能反过来影响 IPC
    }
    // 顺手在主进程 console 也打一行，跟原来 crashGuard 的 logFn 行为一致
    try {
      console.error(`[renderer:${kind}] ${truncated.split('\n')[0]}`);
    } catch {
      /* ignore */
    }
    // 同样落一份到 crashGuard 的 main-error.log（统一查询入口）
    appendCrashLog(deps.logDir, text);
    return { ok: true };
  });
}
