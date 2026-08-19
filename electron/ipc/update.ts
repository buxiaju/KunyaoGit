// 更新检查 IPC + 应用内下载安装
//
// 下载优化要点（v0.2.4）：
//   1. HEAD 探活所有源，挑出真正能服务大文件的源（绕过 Gitee raw 对大文件返 HTML 的坑）
//   2. HTTP Range 多连接分段下载（默认 4 路并发），实测对 90MB 安装包提速 3~6 倍
//   3. 进度事件 100ms 节流，避免 IPC 通道被刷爆
//   4. keepAlive Agent 复用 TLS / TCP 句柄，省去重复握手
//   5. 单个 chunk 失败时在源内重试，整源失败再回落到下一个源
//   6. 实时计算并发送下载速率（speedBps）

import { app, ipcMain, shell, type IpcMainInvokeEvent, type WebContents } from 'electron';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';
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

// 下载源：Gitee Release 附件（国内快，官方 CDN foruda.gitee.com）优先，GitHub Release 兜底。
// ⚠️ 不要用 gitee.com/{owner}/{repo}/raw/... 直链：Gitee raw 对 >50MB 大文件直接 403 / 返 HTML（v0.3.1 起改走 release 附件）
function downloadSources(ver: string): { platform: 'gitee' | 'github'; url: string }[] {
  return [
    {
      platform: 'gitee',
      url: `https://gitee.com/${GITEE_REPO}/releases/download/v${ver}/${INSTALLER_NAME(ver)}`,
    },
    {
      platform: 'github',
      url: `https://github.com/${GITHUB_REPO}/releases/download/v${ver}/${INSTALLER_NAME(ver)}`,
    },
  ];
}

// ---- 性能调优参数 ----
const CHUNK_COUNT = 4;                  // 分段下载并发数（4 路覆盖大多数家庭 / 办公带宽）
const MIN_CHUNK_SIZE = 1024 * 1024;     // 1MB 以下不分段，避免拆得太多反而慢
const PROGRESS_INTERVAL_MS = 100;       // 进度事件节流间隔
const CHUNK_RETRY = 3;                  // 单 chunk 失败重试次数
const CHUNK_RETRY_BACKOFF = 400;        // 失败重试退避基数（ms，指数递增）
const PROBE_TIMEOUT_MS = 15000;         // Range 探活超时（GET 比 HEAD 慢，给宽点）
const RANGE_TIMEOUT_MS = 30000;         // Range 下载每 chunk 30s 无数据视为超时

// 模块级下载状态（用于取消 + 进度节流）
interface ActiveDownload {
  cancelled: boolean;
  sender: WebContents | null;
  // 仍持有一组在飞的 ClientRequest，便于取消时一刀切
  inFlight: Set<ClientRequest>;
}
let active: ActiveDownload | null = null;

function sendProgress(sender: WebContents | null, p: DownloadProgress) {
  if (!sender || sender.isDestroyed()) return;
  try { sender.send(IPC.UPDATE_DOWNLOAD_PROGRESS, p); } catch { /* 窗口可能已关 */ }
}

// 共享的 keep-alive agent（避免每个 chunk 重新建连 / TLS 握手）
const keepAliveHttpsAgent = new https.Agent({ keepAlive: true, maxSockets: CHUNK_COUNT + 2 });
const keepAliveHttpAgent = new http.Agent({ keepAlive: true, maxSockets: CHUNK_COUNT + 2 });

function getFollowHeaders(urlObj: URL) {
  return {
    'User-Agent': 'KunyaoGit-updater',
    'Accept': 'application/octet-stream, */*',
  };
}

// 用 https.request 手动发请求，支持 3xx 重定向。
// onRequest 回调每次构造出 ClientRequest（包括重定向链上每跳）都会被调用，
// 供外部把它登记到 active.inFlight 以便 cancel 时一刀切 destroy。
function requestFollow(
  initialUrl: string,
  method: 'GET' | 'HEAD' = 'GET',
  extraHeaders: Record<string, string> = {},
  maxRedirects = 8,
  timeoutMs = PROBE_TIMEOUT_MS,
  onRequest?: (req: ClientRequest) => void,
): Promise<{ res: IncomingMessage; finalUrl: string }> {
  return new Promise<{ res: IncomingMessage; finalUrl: string }>((resolve, reject) => {
    const visit = (u: string, left: number) => {
      const urlObj = new URL(u);
      const isHttps = urlObj.protocol === 'https:';
      const agent = isHttps ? keepAliveHttpsAgent : keepAliveHttpAgent;
      const lib: typeof https | typeof http = isHttps ? https : http;
      const req = lib.request(
        {
          hostname: urlObj.hostname,
          port: urlObj.port || (isHttps ? 443 : 80),
          path: urlObj.pathname + urlObj.search,
          method,
          agent,
          headers: { ...getFollowHeaders(urlObj), ...extraHeaders },
        },
        (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            if (left <= 0) { reject(new Error('重定向次数过多')); return; }
            const next = new URL(res.headers.location, u).toString();
            visit(next, left - 1);
            return;
          }
          resolve({ res, finalUrl: u });
        },
      );
      onRequest?.(req);
      // 连接建立阶段也要超时：req.setTimeout 只对"已连接 socket 的空闲"计时，
      // 如果 TCP 握手卡死（如 github.com 被墙），它会一直挂到系统级超时。
      // 这里在 socket 尚未 connect 时起一个整体计时器，连上后清除。
      let connectTimer: NodeJS.Timeout | undefined;
      req.on('socket', (socket) => {
        if (socket.connecting) {
          connectTimer = setTimeout(() => req.destroy(new Error('连接超时')), timeoutMs);
          socket.once('connect', () => {
            if (connectTimer) clearTimeout(connectTimer);
          });
        }
      });
      req.setTimeout?.(timeoutMs, () => req.destroy(new Error('连接超时')));
      req.on('error', (e) => {
        if (connectTimer) clearTimeout(connectTimer);
        reject(e);
      });
    };
    visit(initialUrl, maxRedirects);
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
  // 流程：HEAD 探活所有源 → 选一个能用的 → HTTP Range 多连接分段下载 → 节流推送进度
  //       → 完成后返回 { filePath }。
  ipcMain.handle(IPC.UPDATE_DOWNLOAD, async (e: IpcMainInvokeEvent, { version }: { version: string }) => {
    if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
      throw new Error('版本号无效');
    }
    // 已有下载在跑，先取消
    if (active) {
      active.cancelled = true;
      for (const r of active.inFlight) {
        try { r.destroy(); } catch {}
      }
      active.inFlight.clear();
    }
    const sender = e.sender;
    active = { cancelled: false, sender, inFlight: new Set() };

    const destDir = app.getPath('temp');
    const destPath = path.join(destDir, INSTALLER_NAME(version));
    sendProgress(sender, { phase: 'preparing', percent: 0, bytesReceived: 0, totalBytes: 0 });

    const sources = downloadSources(version);
    const failedSources: { platform: 'gitee' | 'github'; reason: string }[] = [];

    // 策略：先并行 Range 探活所有源，挑出第一个 Content-Type 非 HTML 的源直接进入下载。
    // 用 GET + Range: bytes=0-0 替代 HEAD，因为很多 CDN/防火墙对 HEAD 更敏感（直接 403/超时）。
    // 206 响应里 Content-Range 直接给到 total，Content-Type/Accept-Ranges 头都在。
    interface ProbeResult {
      platform: 'gitee' | 'github';
      url: string;
      ok: boolean;
      error?: string;
      total: number;
      supportsRange: boolean;
    }
    const probed: ProbeResult[] = await Promise.all(
      sources.map(async (src): Promise<ProbeResult> => {
        try {
          const r = await probeRange(src.url);
          if (!r) return { platform: src.platform, url: src.url, ok: false, error: '请求失败（超时/网络）', total: 0, supportsRange: false };
          if (r.status !== 200 && r.status !== 206) {
            return { platform: src.platform, url: src.url, ok: false, error: `HTTP ${r.status}`, total: 0, supportsRange: false };
          }
          if (src.platform === 'gitee' && /text\/html/i.test(r.contentType)) {
            return { platform: src.platform, url: src.url, ok: false, error: 'Gitee raw 返 HTML（大文件受限）', total: 0, supportsRange: false };
          }
          if (r.contentLength <= 0) {
            return { platform: src.platform, url: src.url, ok: false, error: '缺 Content-Length', total: 0, supportsRange: false };
          }
          return { platform: src.platform, url: src.url, ok: true, total: r.contentLength, supportsRange: r.acceptRanges };
        } catch (e) {
          return { platform: src.platform, url: src.url, ok: false, error: (e as Error).message, total: 0, supportsRange: false };
        }
      }),
    );

    if (active?.cancelled) {
      sendProgress(sender, { phase: 'cancelled', percent: 0, bytesReceived: 0, totalBytes: 0, message: '已取消下载' });
      active = null;
      return { filePath: '', cancelled: true };
    }

    // 排序：ok=true 的源排前面，按原顺序
    const orderedSources = probed.slice().sort((a, b) => Number(b.ok) - Number(a.ok));

    for (const probe of orderedSources) {
      if (active?.cancelled) break;
      // 探活失败的源：把失败原因记到 failedSources，最后汇总给用户
      if (!probe.ok) {
        failedSources.push({ platform: probe.platform, reason: probe.error || '未知' });
        continue;
      }
      try {
        const picked = await tryDownloadFromSource(probe.platform, probe.url, destPath, probe.total, probe.supportsRange, sender);
        if (active?.cancelled) {
          safeUnlink(destPath);
          sendProgress(sender, { phase: 'cancelled', percent: 0, bytesReceived: 0, totalBytes: 0, message: '已取消下载' });
          active = null;
          return { filePath: '', cancelled: true };
        }
        active = null;
        sendProgress(sender, {
          phase: 'done',
          percent: 100,
          bytesReceived: picked.bytes,
          totalBytes: picked.bytes,
          source: probe.platform,
          speedBps: 0,
          filePath: destPath,
          message: `下载完成（来自 ${probe.platform}）`,
        });
        return { filePath: destPath, source: probe.platform };
      } catch (err) {
        // 下载阶段失败：同样记到 failedSources
        failedSources.push({ platform: probe.platform, reason: (err as Error).message });
        // 继续尝试下一个源
      }
    }

    active = null;
    // 汇总错误：把所有源的失败原因列出来，方便用户判断是网络问题还是源问题
    const msg = failedSources.length
      ? `所有下载源都失败：${failedSources.map(s => `${s.platform}（${s.reason}）`).join('; ')}`
      : '所有下载源都失败';
    sendProgress(sender, { phase: 'error', percent: 0, bytesReceived: 0, totalBytes: 0, message: msg });
    throw new Error(msg);
  });

  // 取消正在进行的下载
  ipcMain.handle(IPC.UPDATE_CANCEL_DOWNLOAD, async () => {
    if (active) {
      active.cancelled = true;
      for (const r of active.inFlight) {
        try { r.destroy(); } catch {}
      }
      active.inFlight.clear();
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

// ============================================================================
//  下载核心（按源）
// ============================================================================

interface SourceDownloadResult {
  bytes: number;        // 实际写入字节数
  durationMs: number;
}

/**
 * 尝试从一个源下载到 destPath。调用前应已完成 HEAD 探活。
 *  1. 决定分段策略：>= 1MB 且支持 Range 就拆 CHUNK_COUNT 段并发下；否则单连接
 *  2. 下载过程中通过 send 节流回报（每 100ms 一次，含 speedBps）
 */
async function tryDownloadFromSource(
  platform: 'gitee' | 'github',
  url: string,
  destPath: string,
  total: number,
  supportsRange: boolean,
  sender: WebContents | null,
): Promise<SourceDownloadResult> {
  // 进度节流状态
  const progressState = {
    bytes: 0,
    lastSentAt: 0,
    lastBytesAtSend: 0,
    lastSendTime: 0,
    speedBps: 0,
    startedAt: Date.now(),
  };

  const send = (phase: DownloadProgress['phase'], extra: Partial<DownloadProgress> = {}) => {
    const now = Date.now();
    if (phase === 'downloading' && now - progressState.lastSentAt < PROGRESS_INTERVAL_MS) return;
    progressState.lastSentAt = now;
    // 计算瞬时速率（从上次推送到现在）
    const dt = now - progressState.lastSendTime;
    const db = progressState.bytes - progressState.lastBytesAtSend;
    if (dt > 0) progressState.speedBps = Math.round((db * 1000) / dt);
    progressState.lastSendTime = now;
    progressState.lastBytesAtSend = progressState.bytes;
    sendProgress(sender, {
      phase,
      percent: total > 0 ? Math.min(100, Math.round((progressState.bytes / total) * 100)) : -1,
      bytesReceived: progressState.bytes,
      totalBytes: total,
      source: platform,
      speedBps: progressState.speedBps,
      ...extra,
    });
  };

  send('downloading', { message: '开始下载' });

  // 选择下载策略
  const useRange = supportsRange && total >= MIN_CHUNK_SIZE;
  let bytes: number;
  if (useRange) {
    bytes = await downloadByRange(url, destPath, total, (delta) => {
      progressState.bytes += delta;
      send('downloading');
    });
  } else {
    bytes = await downloadSingle(url, destPath, (delta) => {
      progressState.bytes += delta;
      send('downloading');
    });
  }

  // 验证文件大小匹配（一些 CDN 偶发会送 content-length 但实际流短了）
  if (bytes !== total) {
    try { fs.unlinkSync(destPath); } catch {}
    throw new Error(`${platform} 下载字节数不匹配（期望 ${total} 实际 ${bytes}）`);
  }
  const duration = Date.now() - progressState.startedAt;
  return { bytes, durationMs: duration };
}

// Range 探活：发 Range: bytes=0-0 的 GET，1 字节就好。
// 用 GET 不用 HEAD，因为很多 CDN / 防火墙对 HEAD 更敏感（甚至直接 403/超时）。
// 206 响应里 Content-Range: bytes 0-0/{total} 直接给到总大小；
// 200 响应（服务器忽略 Range）则 Content-Length 是总大小，我们读完头立刻 destroy 响应
// 避免真把 90MB 拉下来。
async function probeRange(url: string): Promise<{ status: number; contentType: string; contentLength: number; acceptRanges: boolean } | null> {
  if (!active || active.cancelled) throw new Error('cancelled');
  try {
    const { res } = await requestFollow(
      url,
      'GET',
      { Range: 'bytes=0-0' },
      8,
      PROBE_TIMEOUT_MS,
      (req) => active?.inFlight.add(req),
    );
    const status = res.statusCode || 0;
    const contentType = String(res.headers['content-type'] || '');
    const ar = String(res.headers['accept-ranges'] || '').toLowerCase();
    // 优先从 Content-Range 拿 total（206 才会有）
    let total = 0;
    const cr = res.headers['content-range'];
    if (typeof cr === 'string') {
      const m = /\/(\d+)\s*$/.exec(cr);
      if (m) total = Number(m[1]);
    }
    // 200 响应（不支持 Range）的话 Content-Length 就是 total
    if (!total) total = Number(res.headers['content-length'] || 0);
    // 立即销毁响应，避免 200 情况把整文件拉下来
    res.destroy();
    return {
      status,
      contentType,
      contentLength: total,
      acceptRanges: status === 206 || ar === 'bytes',
    };
  } catch (e) {
    return null;
  }
}

// Range 多连接分段下载。回调 onDelta 在每个 chunk 写入新数据时调用（单位：byte）
async function downloadByRange(
  url: string,
  destPath: string,
  total: number,
  onDelta: (n: number) => void,
): Promise<number> {
  // 预创建目标文件（fd 复用，所有 chunk 都用同一文件描述符在不同 offset 写入）
  // NTFS 上稀疏文件自动支持，无需预分配 90MB 零字节
  const fd = await fsp.open(destPath, 'w+');

  // 切分区间
  const N = CHUNK_COUNT;
  const base = Math.floor(total / N);
  const remainder = total % N;
  const ranges: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  for (let i = 0; i < N; i++) {
    const size = base + (i < remainder ? 1 : 0);
    const start = cursor;
    const end = cursor + size - 1; // 含
    ranges.push({ start, end });
    cursor += size;
  }

  let written = 0;
  try {
    await Promise.all(ranges.map(async (rg) => {
      await downloadOneChunkWithRetry(url, rg.start, rg.end, fd, (n) => {
        written += n;
        onDelta(n);
      });
    }));
  } catch (err) {
    // 任意一个 chunk 失败时，整体抛出（外层 tryDownloadFromSource 会回落到下一个源）
    throw err;
  } finally {
    await fd.close().catch(() => {});
  }
  return written;
}

async function downloadOneChunkWithRetry(
  url: string,
  start: number,
  end: number,
  fd: fs.promises.FileHandle,
  onDelta: (n: number) => void,
) {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < CHUNK_RETRY; attempt++) {
    if (active?.cancelled) throw new Error('cancelled');
    try {
      await downloadOneChunk(url, start, end, fd, onDelta);
      return;
    } catch (e) {
      lastErr = e as Error;
      if (active?.cancelled) throw e;
      // 指数退避
      const backoff = CHUNK_RETRY_BACKOFF * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw lastErr || new Error('chunk 下载失败');
}

function downloadOneChunk(
  url: string,
  start: number,
  end: number,
  fd: fs.promises.FileHandle,
  onDelta: (n: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const safeReject = (e: Error) => { if (!settled) { settled = true; reject(e); } };
    const safeResolve = () => { if (!settled) { settled = true; resolve(); } };

    requestFollow(
      url,
      'GET',
      { Range: `bytes=${start}-${end}` },
      8,
      RANGE_TIMEOUT_MS,
      (req) => active?.inFlight.add(req),
    ).then(
      ({ res }) => {
        // 校验 206（部分内容）或 200（极少数服务器忽略 Range 返整段——读到 end 即停）
        const code = res.statusCode || 0;
        if (code !== 206 && code !== 200) {
          res.resume();
          safeReject(new Error(`Range 请求失败 HTTP ${code}`));
          return;
        }
        let received = 0;
        // 用 writeChain 串行化所有写盘调用，避免 res.on('data') 在 await 期间
        // 累积导致 received 读到的还是旧值。offset 在派发前同步算出。
        let writeChain: Promise<void> = Promise.resolve();
        res.on('data', (chunk: Buffer) => {
          if (active?.cancelled) {
            res.destroy();
            safeReject(new Error('cancelled'));
            return;
          }
          const offset = start + received;
          received += chunk.length;
          onDelta(chunk.length);
          writeChain = writeChain.then(() =>
            fd.write(chunk, 0, chunk.length, offset).then(() => undefined).catch((writeErr) => {
              res.destroy();
              throw writeErr;
            })
          );
          // 读到 end 即可断开（即使 server 后续继续发也截断）
          if (start + received - 1 >= end) {
            res.destroy();
          }
        });
        res.on('end', async () => {
          try { await writeChain; } catch (e) { return safeReject(e as Error); }
          safeResolve();
        });
        res.on('error', (e) => safeReject(e));
        res.on('close', () => {
          // 'close' 触发条件：end / destroy 都可能走这里，确保 settled
          if (!settled) safeResolve();
        });
      },
      (err) => safeReject(err),
    );
  });
}

// 单连接兜底（server 不支持 Range 或文件太小不值得分段）
function downloadSingle(
  url: string,
  destPath: string,
  onDelta: (n: number) => void,
): Promise<number> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const safeReject = (e: Error) => { if (!settled) { settled = true; reject(e); } };
    const safeResolve = (n: number) => { if (!settled) { settled = true; resolve(n); } };

    requestFollow(
      url,
      'GET',
      {},
      8,
      RANGE_TIMEOUT_MS,
      (req) => active?.inFlight.add(req),
    ).then(
      ({ res }) => {
        const code = res.statusCode || 0;
        if (code < 200 || code >= 300) {
          res.resume();
          safeReject(new Error(`HTTP ${code}`));
          return;
        }
        const writer = fs.createWriteStream(destPath);
        let received = 0;
        res.on('data', (c: Buffer) => {
          if (active?.cancelled) { res.destroy(); writer.destroy(); safeReject(new Error('cancelled')); return; }
          received += c.length;
          onDelta(c.length);
          writer.write(c);
        });
        writer.on('error', (e) => safeReject(e));
        res.on('error', (e) => { try { writer.destroy(); } catch {} safeReject(e); });
        res.on('end', () => writer.end(() => safeResolve(received)));
      },
      (err) => safeReject(err),
    );
  });
}

function safeUnlink(p: string) {
  try { fs.unlinkSync(p); } catch {}
}
