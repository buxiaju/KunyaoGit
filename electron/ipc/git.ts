import { ipcMain } from 'electron';
import { IPC } from '../../shared/ipc-channels';
import { GitService } from '../services/git';
import { getSettings } from '../services/settings';

function getGit(repoPath: string): GitService {
  const settings = getSettings();
  return new GitService(repoPath, settings.gitPath);
}

export function registerGitHandlers() {
  ipcMain.handle(IPC.GIT_STATUS, async (_e, repoPath: string) => {
    return getGit(repoPath).status();
  });

  ipcMain.handle(IPC.GIT_LOG, async (_e, { path, maxCount, branch }: { path: string; maxCount?: number; branch?: string }) => {
    return getGit(path).log({ maxCount, branch });
  });

  ipcMain.handle(IPC.GIT_BRANCHES, async (_e, repoPath: string) => {
    return getGit(repoPath).branches();
  });

  ipcMain.handle(IPC.GIT_STAGE, async (_e, { path, paths }: { path: string; paths: string[] }) => {
    return getGit(path).stage(paths);
  });

  ipcMain.handle(IPC.GIT_UNSTAGE, async (_e, { path, paths }: { path: string; paths: string[] }) => {
    return getGit(path).unstage(paths);
  });

  ipcMain.handle(IPC.GIT_DISCARD, async (_e, { path, paths }: { path: string; paths: string[] }) => {
    return getGit(path).discard(paths);
  });

  ipcMain.handle(IPC.GIT_COMMIT, async (_e, { path, message, amend, signOff }: { path: string; message: string; amend?: boolean; signOff?: boolean }) => {
    return getGit(path).commit(message, { amend, signOff });
  });

  ipcMain.handle(IPC.GIT_PUSH, async (_e, { path, remote, branch, setUpstream, force }: { path: string; remote?: string; branch?: string; setUpstream?: boolean; force?: boolean }) => {
    return getGit(path).push({ remote, branch, setUpstream, force });
  });

  ipcMain.handle(IPC.GIT_PULL, async (_e, { path, remote, branch, rebase }: { path: string; remote?: string; branch?: string; rebase?: boolean }) => {
    return getGit(path).pull({ remote, branch, rebase });
  });

  ipcMain.handle(IPC.GIT_FETCH, async (_e, { path, remote, prune }: { path: string; remote?: string; prune?: boolean }) => {
    return getGit(path).fetch({ remote, prune });
  });

  ipcMain.handle(IPC.GIT_CHECKOUT, async (_e, { path, target, create }: { path: string; target: string; create?: boolean }) => {
    return getGit(path).checkout(target, { create });
  });

  ipcMain.handle(IPC.GIT_CREATE_BRANCH, async (_e, { path, name, from }: { path: string; name: string; from?: string }) => {
    return getGit(path).createBranch(name, from);
  });

  ipcMain.handle(IPC.GIT_DELETE_BRANCH, async (_e, { path, name, force }: { path: string; name: string; force?: boolean }) => {
    return getGit(path).deleteBranch(name, force);
  });

  ipcMain.handle(IPC.GIT_MERGE, async (_e, { path, branch, noFF, squash, message }: { path: string; branch: string; noFF?: boolean; squash?: boolean; message?: string }) => {
    return getGit(path).merge(branch, { noFF, squash, message });
  });

  ipcMain.handle(IPC.GIT_DIFF, async (_e, { path, staged, from, to }: { path: string; staged?: boolean; from?: string; to?: string }) => {
    return getGit(path).diff({ staged, from, to });
  });

  ipcMain.handle(IPC.GIT_DIFF_FILE, async (_e, { path, file, staged }: { path: string; file: string; staged?: boolean }) => {
    return getGit(path).diffFile(file, { staged });
  });

  ipcMain.handle(IPC.GIT_STASH, async (_e, { path, message }: { path: string; message?: string }) => {
    return getGit(path).stash(message);
  });

  ipcMain.handle(IPC.GIT_STASH_POP, async (_e, repoPath: string) => {
    return getGit(repoPath).stashPop();
  });

  // v0.4+ Stash 队列管理
  ipcMain.handle(IPC.GIT_STASH_LIST, async (_e, repoPath: string) => {
    return getGit(repoPath).stashList();
  });

  ipcMain.handle(IPC.GIT_STASH_SHOW, async (_e, { path: p, ref }: { path: string; ref: string }) => {
    return getGit(p).stashShow(ref);
  });

  ipcMain.handle(IPC.GIT_STASH_APPLY, async (_e, { path: p, ref }: { path: string; ref: string }) => {
    return getGit(p).stashApply(ref);
  });

  ipcMain.handle(IPC.GIT_STASH_DROP, async (_e, { path: p, ref }: { path: string; ref: string }) => {
    return getGit(p).stashDrop(ref);
  });

  ipcMain.handle(IPC.GIT_RESET, async (_e, { path, target, mode }: { path: string; target: string; mode?: 'soft' | 'mixed' | 'hard' }) => {
    return getGit(path).reset(target, mode);
  });

  ipcMain.handle(IPC.GIT_RESOLVE_CONFLICT, async (_e, { path, file, side }: { path: string; file: string; side: 'ours' | 'theirs' }) => {
    return getGit(path).resolveConflict(file, side);
  });

  // v0.4+ Cherry-pick / Revert
  ipcMain.handle(IPC.GIT_CHERRY_PICK, async (_e, { path, hash, mainline }: { path: string; hash: string; mainline?: number }) => {
    return getGit(path).cherryPick(hash, { mainline });
  });

  ipcMain.handle(IPC.GIT_REVERT, async (_e, { path, hash, mainline }: { path: string; hash: string; mainline?: number }) => {
    return getGit(path).revert(hash, { mainline });
  });

  ipcMain.handle(IPC.GIT_READ_CONFLICT, async (_e, { path, file }: { path: string; file: string }) => {
    return getGit(path).readConflictFile(file);
  });

  // v0.5+ 列出仓库所有工作区文件（tracked + untracked）
  ipcMain.handle(IPC.GIT_LS_FILES, async (_e, { path, maxCount, withStatus }: { path: string; maxCount?: number; withStatus?: boolean }) => {
    return getGit(path).listFiles({ maxCount, withStatus });
  });

  ipcMain.handle(IPC.GIT_REMOTE_LIST, async (_e, repoPath: string) => {
    return getGit(repoPath).remoteList();
  });

  ipcMain.handle(IPC.GIT_REMOTE_ADD, async (_e, { path, name, url }: { path: string; name: string; url: string }) => {
    return getGit(path).remoteAdd(name, url);
  });

  ipcMain.handle(IPC.GIT_REMOTE_REMOVE, async (_e, { path, name }: { path: string; name: string }) => {
    return getGit(path).remoteRemove(name);
  });
}
