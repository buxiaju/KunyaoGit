// 渲染进程全局错误兜底（健壮性加固）
//
// 背景：ErrorBoundary 只能捕获 **渲染期** 抛出的异常。以下两类错误它抓不到：
//   1. Promise 未处理的 rejection —— 项目里大量 `await window.gitgui.xxx()` 没有
//      try/catch（例如 src/stores/settings.ts 的 load()），IPC 一旦 reject
//      就是一条静默的 unhandledrejection，用户界面卡在 loading 且毫无提示；
//   2. 异步回调 / 事件监听里抛出的运行时错误（setTimeout、addEventListener 等）。
//
// 这里统一收口：落一条 console.error（main.ts 的 console-message 监听会把它
// 转发进主进程日志），同时给用户一个 toast，让"什么都没发生"变成"看得见的失败"。

import { toast } from '../components/common/Toast';

/** 同一条错误消息的最小提示间隔，防止循环报错刷屏。 */
const THROTTLE_MS = 5000;

const lastShownAt = new Map<string, number>();

function shouldShow(signature: string, now = Date.now()): boolean {
  const prev = lastShownAt.get(signature);
  if (prev !== undefined && now - prev < THROTTLE_MS) return false;
  lastShownAt.set(signature, now);
  return true;
}

/**
 * 简易路径脱敏（健壮性加固 C）。
 * 主进程侧的 redactPath 在 electron/lib/safePath.ts，规则更全；
 * 这里只做最基本的盘符绝对路径替换，作为渲染层兜底。
 */
function redactLocalPath(msg: string): string {
  if (!msg) return msg;
  return msg
    // Windows: C:\Users\xxx\foo\bar.txt → ~\foo\bar.txt
    .replace(/\b[A-Za-z]:[\\/](?:[^\\/:*?"<>|\r\n]+[\\/])+([^\\/:*?"<>|\r\n]+)/g, (_, last) => `~\\${last}`)
    // POSIX: /Users/xxx/foo → ~/foo（只覆盖 Users/home 两类常见位置）
    .replace(/(^|[\s'"(=])(\/(?:Users|home)\/[^/\s'")]+)\/([^/\s'")]+)/g, (_, lead, _root, last) => `${lead}~/${last}`);
}

/** 把任意 reject 值转成可读文本。 */
export function describeReason(reason: unknown): string {
  if (reason instanceof Error) return redactLocalPath(reason.message || reason.name);
  if (typeof reason === 'string') return redactLocalPath(reason);
  if (reason && typeof reason === 'object') {
    // IPC 的 Result 失败形态：{ ok: false, error: '...' }
    const maybe = reason as { error?: unknown; message?: unknown };
    if (typeof maybe.error === 'string') return redactLocalPath(maybe.error);
    if (typeof maybe.message === 'string') return redactLocalPath(maybe.message);
    try {
      return redactLocalPath(JSON.stringify(reason));
    } catch {
      return String(reason);
    }
  }
  return String(reason);
}

/** 测试用：重置节流状态。 */
export function resetErrorThrottle(): void {
  lastShownAt.clear();
}

/**
 * 安装全局监听。返回卸载函数。
 * 幂等：重复调用只会安装一次（HMR 场景下不会叠加监听）。
 */
let installed = false;

export function installGlobalErrorHandlers(): () => void {
  if (installed) return () => {};
  installed = true;

  const onRejection = (event: PromiseRejectionEvent) => {
    const text = describeReason(event.reason);
    console.error('[unhandledrejection]', text, event.reason);
    // 健壮性加固 E：把真实崩溃现场落盘到主进程日志。
    // window.gitgui 在某些环境（如极早期 unit test 加载阶段）可能还不存在，做个防御。
    try {
      window.gitgui?.app?.logError?.({
        kind: 'unhandledrejection',
        message: text + (event.reason instanceof Error && event.reason.stack ? `\n${event.reason.stack}` : ''),
        url: typeof location !== 'undefined' ? location.href : undefined,
        timestamp: new Date().toISOString(),
      });
    } catch {
      /* 日志通道挂了不应当影响错误处理 */
    }
    if (shouldShow(`rejection::${text}`)) {
      toast.error(`操作失败：${text.slice(0, 200)}`);
    }
  };

  const onError = (event: ErrorEvent) => {
    const text = event.message || describeReason(event.error);
    console.error('[window.onerror]', text, event.error);
    try {
      window.gitgui?.app?.logError?.({
        kind: 'error',
        message: text + (event.error instanceof Error && event.error.stack ? `\n${event.error.stack}` : ''),
        url: typeof location !== 'undefined' ? location.href : undefined,
        timestamp: new Date().toISOString(),
      });
    } catch {
      /* ignore */
    }
    if (shouldShow(`error::${text}`)) {
      toast.error(`界面异常：${text.slice(0, 200)}`);
    }
  };

  window.addEventListener('unhandledrejection', onRejection);
  window.addEventListener('error', onError);

  return () => {
    window.removeEventListener('unhandledrejection', onRejection);
    window.removeEventListener('error', onError);
    installed = false;
  };
}
