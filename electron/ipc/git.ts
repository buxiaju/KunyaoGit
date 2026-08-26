import { ipcMain } from 'electron';
import { IPC } from '../../shared/ipc-channels';
import { GitService } from '../services/git';
import { getSettings } from '../services/settings';
import { assertSafePath } from '../lib/safePath';

/**
 * 按仓库路径缓存 GitService 实例（健壮性加固 P2）。
 *
 * 原本每个 handler 都 `new GitService(repoPath, settings.gitPath)`：
 *   - 每次都重读 settings.gitPath（多余的 IO）；
 *   - 用户改 gitPath 后**老实例**仍持有旧 binary（行为不一致）；
 *   - 32 个 handler 散落，单元测试无法覆盖 getGit 内部逻辑。
 *
 * 缓存用真实路径作 key：避免 `C:/repo` 和 `C:\repo` 在 Windows 上被当成
 * 不同仓库。同时 handler 在关仓库时通过 `invalidateGitCache` 主动清理。
 */
const gitCache = new Map<string, GitService>();

function cacheKey(repoPath: string): string {
  return process.platform === 'win32' ? repoPath.toLowerCase() : repoPath;
}

/** 测试 / 外部（关仓库）用：移除某个仓库的缓存实例。 */
export function invalidateGitCache(repoPath: string): void {
  gitCache.delete(cacheKey(repoPath));
}

/** 测试用：清空整个缓存。 */
export function clearGitCache(): void {
  gitCache.clear();
}

/**
 * 仓库根路径校验 + 缓存获取 GitService（健壮性加固 A + P2）。
 *
 * 校验失败的 handler 一律返回 `{ ok: false, error: '...' }`，不抛异常：
 * 渲染层弹 toast 即可，不必知道是「路径越界」还是「仓库未打开」。
 */
function getGitSafe(repoPath: unknown): { ok: true; data: GitService } | { ok: false; error: string } {
  if (typeof repoPath !== 'string' || repoPath.trim() === '') {
    return { ok: false, error: '仓库路径无效' };
  }
  const safe = assertSafePath(repoPath);
  if (!safe.ok) return safe;
  const key = cacheKey(safe.data);
  let svc = gitCache.get(key);
  if (!svc) {
    try {
      const settings = getSettings();
      svc = new GitService(safe.data, settings.gitPath, settings.sshKeyPath);
      gitCache.set(key, svc);
    } catch (e) {
      // simple-git 在目录不存在等情况下会直接 throw，统一兜成 Result
      return { ok: false, error: GitService.describeError(e) };
    }
  }
  return { ok: true, data: svc };
}

/**
 * 把所有 32 个 handler 的「先校验、再调用」两步收口成一个 wrapper。
 * handler 只关心「拿到 GitService 后做什么」，不再各自散落校验。
 *
 * 兼容两种入参形态：
 *   1. `ipcMain.handle(IPC.X, (_e, repoPath: string) => ...)` —— 直接传路径
 *   2. `ipcMain.handle(IPC.X, (_e, { path, ... }: { path, ... }) => ...)` —— 包装在对象里
 *
 * 兜底：service 层抛错（simple-git 启动失败 / 目录不存在等）也统一转 Result，
 * 避免 IPC channel 把堆栈吐回渲染层。
 */
function handle<T>(
  fn: (svc: GitService, payload: any) => Promise<T>
): (_e: unknown, payload: any) => Promise<T | { ok: false; error: string }> {
  return async (_e, payload) => {
    let candidate: unknown = payload;
    if (payload && typeof payload === 'object' && 'path' in (payload as object)) {
      candidate = (payload as { path: unknown }).path;
    } else if (typeof payload === 'string') {
      candidate = payload;
    }
    const result = getGitSafe(candidate);
    if (!result.ok) return result;
    try {
      return await fn(result.data, payload);
    } catch (e) {
      return { ok: false, error: GitService.describeError(e) };
    }
  };
}

export function registerGitHandlers() {
  // 基础命令
  ipcMain.handle(IPC.GIT_STATUS, handle((g) => g.status()));
  ipcMain.handle(IPC.GIT_LOG, handle((g, payload: any) => g.log({ maxCount: payload?.maxCount, branch: payload?.branch })));
  ipcMain.handle(IPC.GIT_BRANCHES, handle((g) => g.branches()));
  ipcMain.handle(IPC.GIT_STAGE, handle((g, payload: any) => g.stage(payload?.paths || [])));
  ipcMain.handle(IPC.GIT_UNSTAGE, handle((g, payload: any) => g.unstage(payload?.paths || [])));
  ipcMain.handle(IPC.GIT_DISCARD, handle((g, payload: any) => g.discard(payload?.paths || [])));
  ipcMain.handle(IPC.GIT_COMMIT, handle((g, payload: any) => g.commit(payload?.message, { amend: payload?.amend, signOff: payload?.signOff })));
  ipcMain.handle(IPC.GIT_PUSH, handle((g, payload: any) => g.push({ remote: payload?.remote, branch: payload?.branch, setUpstream: payload?.setUpstream, force: payload?.force })));
  ipcMain.handle(IPC.GIT_PULL, handle((g, payload: any) => g.pull({ remote: payload?.remote, branch: payload?.branch, rebase: payload?.rebase })));
  ipcMain.handle(IPC.GIT_FETCH, handle((g, payload: any) => g.fetch({ remote: payload?.remote, prune: payload?.prune })));
  ipcMain.handle(IPC.GIT_CHECKOUT, handle((g, payload: any) => g.checkout(payload?.target, { create: payload?.create })));
  ipcMain.handle(IPC.GIT_CREATE_BRANCH, handle((g, payload: any) => g.createBranch(payload?.name, payload?.from)));
  ipcMain.handle(IPC.GIT_DELETE_BRANCH, handle((g, payload: any) => g.deleteBranch(payload?.name, payload?.force)));
  ipcMain.handle(IPC.GIT_MERGE, handle((g, payload: any) => g.merge(payload?.branch, { noFF: payload?.noFF, squash: payload?.squash, message: payload?.message })));
  ipcMain.handle(IPC.GIT_DIFF, handle((g, payload: any) => g.diff({ staged: payload?.staged, from: payload?.from, to: payload?.to })));
  ipcMain.handle(IPC.GIT_DIFF_FILE, handle((g, payload: any) => g.diffFile(payload?.file, { staged: payload?.staged })));
  ipcMain.handle(IPC.GIT_STASH, handle((g, payload: any) => g.stash(payload?.message)));
  ipcMain.handle(IPC.GIT_STASH_POP, handle((g) => g.stashPop()));
  // v0.4+ Stash 队列
  ipcMain.handle(IPC.GIT_STASH_LIST, handle((g) => g.stashList()));
  ipcMain.handle(IPC.GIT_STASH_SHOW, handle((g, payload: any) => g.stashShow(payload?.ref)));
  ipcMain.handle(IPC.GIT_STASH_APPLY, handle((g, payload: any) => g.stashApply(payload?.ref)));
  ipcMain.handle(IPC.GIT_STASH_DROP, handle((g, payload: any) => g.stashDrop(payload?.ref)));
  ipcMain.handle(IPC.GIT_RESET, handle((g, payload: any) => g.reset(payload?.target, payload?.mode)));
  ipcMain.handle(IPC.GIT_RESOLVE_CONFLICT, handle((g, payload: any) => g.resolveConflict(payload?.file, payload?.side)));
  // v0.4+ Cherry-pick / Revert
  ipcMain.handle(IPC.GIT_CHERRY_PICK, handle((g, payload: any) => g.cherryPick(payload?.hash, { mainline: payload?.mainline })));
  ipcMain.handle(IPC.GIT_REVERT, handle((g, payload: any) => g.revert(payload?.hash, { mainline: payload?.mainline })));
  ipcMain.handle(IPC.GIT_READ_CONFLICT, handle((g, payload: any) => g.readConflictFile(payload?.file)));
  // v0.5+ 文件级命令
  ipcMain.handle(IPC.GIT_LS_FILES, handle((g, payload: any) => g.listFiles({ maxCount: payload?.maxCount, withStatus: payload?.withStatus })));
  ipcMain.handle(IPC.GIT_BLAME, handle((g, payload: any) => g.blame(payload?.file)));
  ipcMain.handle(IPC.GIT_FILE_LOG, handle((g, payload: any) => g.fileLog(payload?.file, { maxCount: payload?.maxCount, follow: payload?.follow })));
  ipcMain.handle(IPC.GIT_FILE_DIFF, handle((g, payload: any) => g.fileDiff(payload?.file, { fromHash: payload?.fromHash, toHash: payload?.toHash })));
  // Remote
  ipcMain.handle(IPC.GIT_REMOTE_LIST, handle((g) => g.remoteList()));
  ipcMain.handle(IPC.GIT_REMOTE_ADD, handle((g, payload: any) => g.remoteAdd(payload?.name, payload?.url)));
  ipcMain.handle(IPC.GIT_REMOTE_REMOVE, handle((g, payload: any) => g.remoteRemove(payload?.name)));
  // v0.6+ SSH 推送支持：把 origin 切到 SSH（或反向切回 HTTPS）
  // 注：handler 的 wrapper 已经做了仓库根路径校验，URL 内容在 service 层校验
  ipcMain.handle(IPC.GIT_SET_REMOTE_URL, handle((g, payload: any) => g.setRemoteUrl(payload?.name, payload?.url)));
}
