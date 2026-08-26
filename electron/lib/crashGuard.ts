// 主进程崩溃兜底与运行时诊断日志（健壮性加固）
//
// 背景：`electron/main.ts` 原本没有任何 `uncaughtException` / `unhandledRejection`
// 处理，也没有监听渲染进程崩溃。后果：
//   - 主进程任一未捕获异常 → 整个应用无声消失，用户不知道发生了什么；
//   - 渲染进程 OOM / 崩溃 → 白屏空窗，主进程完全不知情；
//   - 出问题后本地没有任何线索可供排障。
//
// 设计取舍：
//   1. `uncaughtException` 后进程状态理论上不可信，Node 官方建议退出。但对桌面
//      GUI 应用，直接退出等于「应用消失」，体验比现状更差。这里选择：
//      落盘日志 + 告知用户 + 让用户决定是否继续，默认不自动退出。
//   2. 异常可能高频重复（例如渲染循环里抛错），必须做同签名节流，
//      否则弹窗风暴会让应用彻底不可用。
//   3. 兜底逻辑自身绝不能再抛异常，所有分支都用 try/catch 包裹。

import fs from 'node:fs';
import path from 'node:path';

export type CrashKind =
  | 'uncaughtException'
  | 'unhandledRejection'
  | 'renderProcessGone'
  | 'childProcessGone'
  | 'windowUnresponsive'
  | 'loadFailed';

/** 单个日志文件上限；超过后归档为 .1.log，避免无限增长占满磁盘。 */
const LOG_MAX_BYTES = 1024 * 1024;

/** 同一错误签名的最小弹窗间隔（毫秒），防异常风暴。 */
const DIALOG_THROTTLE_MS = 30_000;

const lastNotifiedAt = new Map<string, number>();

/** 把任意 throw 出来的值转成可读文本（可能是 Error、字符串、对象甚至 undefined）。 */
export function describeError(err: unknown): string {
  if (err instanceof Error) {
    return `${err.name}: ${err.message}\n${err.stack || '(no stack)'}`;
  }
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/** 生成一条日志文本。纯函数，便于单元测试。 */
export function formatCrashEntry(kind: CrashKind, detail: unknown, now: Date = new Date()): string {
  const ts = now.toISOString();
  return `[${ts}] [${kind}] ${describeError(detail)}\n`;
}

/**
 * 取错误签名用于节流：同一处反复抛出的错误应视为同一个。
 * 用 kind + 首行消息，不含时间戳与完整堆栈。
 */
export function crashSignature(kind: CrashKind, detail: unknown): string {
  const text = describeError(detail);
  const firstLine = text.split('\n')[0]?.slice(0, 200) || '';
  return `${kind}::${firstLine}`;
}

/** 判断这条崩溃是否应该提示用户（基于签名节流）。纯函数式的可测入口。 */
export function shouldNotify(kind: CrashKind, detail: unknown, now: number = Date.now()): boolean {
  const sig = crashSignature(kind, detail);
  const prev = lastNotifiedAt.get(sig);
  if (prev !== undefined && now - prev < DIALOG_THROTTLE_MS) return false;
  lastNotifiedAt.set(sig, now);
  return true;
}

/** 测试用：重置节流状态。 */
export function resetNotifyThrottle(): void {
  lastNotifiedAt.clear();
}

/** 追加写日志，带体积轮转。任何失败都静默——日志不能反过来把应用弄崩。 */
export function appendCrashLog(logDir: string, entry: string): void {
  try {
    fs.mkdirSync(logDir, { recursive: true });
    const file = path.join(logDir, 'main-error.log');
    try {
      const stat = fs.statSync(file);
      if (stat.size > LOG_MAX_BYTES) {
        fs.renameSync(file, path.join(logDir, 'main-error.1.log'));
      }
    } catch {
      // 文件不存在，首次写入
    }
    fs.appendFileSync(file, entry, 'utf-8');
  } catch {
    // 磁盘满 / 无权限：放弃记录，不影响主流程
  }
}

export interface CrashGuardDeps {
  /** 日志目录，通常是 app.getPath('userData') + '/logs'。 */
  logDir: string;
  /** 提示用户。传 null 表示只记录不提示（例如测试环境）。 */
  notify: ((kind: CrashKind, message: string) => void) | null;
  /** 控制台输出，默认 console.error。 */
  log?: (msg: string) => void;
}

/**
 * 处理一次崩溃事件：落盘 + 按节流提示用户。
 * 供 installCrashGuards 内部使用，也可被其它监听器（渲染进程崩溃等）直接调用。
 */
export function handleCrash(deps: CrashGuardDeps, kind: CrashKind, detail: unknown): void {
  const entry = formatCrashEntry(kind, detail);
  const logFn = deps.log || ((m: string) => console.error(m));
  try {
    logFn(`[crash-guard] ${entry.trim()}`);
  } catch {
    /* ignore */
  }
  appendCrashLog(deps.logDir, entry);

  if (deps.notify && shouldNotify(kind, detail)) {
    try {
      deps.notify(kind, describeError(detail));
    } catch {
      // 提示失败（例如窗口已销毁）不再升级处理
    }
  }
}

/**
 * 安装进程级全局兜底。返回卸载函数（测试用）。
 * 注意：只处理 process 级事件；渲染进程相关监听在 main.ts 里挂到 webContents 上。
 */
export function installCrashGuards(deps: CrashGuardDeps): () => void {
  const onUncaught = (err: unknown) => handleCrash(deps, 'uncaughtException', err);
  const onRejection = (reason: unknown) => handleCrash(deps, 'unhandledRejection', reason);

  process.on('uncaughtException', onUncaught);
  process.on('unhandledRejection', onRejection);

  return () => {
    process.off('uncaughtException', onUncaught);
    process.off('unhandledRejection', onRejection);
  };
}
