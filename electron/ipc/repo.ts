import { ipcMain, dialog, BrowserWindow, shell, app } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import simpleGit from 'simple-git';
import { IPC } from '../../shared/ipc-channels';
import { GitService } from '../services/git';
import { getSettings, addRecentRepo, removeRecentRepo, getRecentRepos } from '../services/settings';
import { registerAllowedRoot, unregisterAllowedRoot, assertSafePath } from '../lib/safePath';
import { assertSafeExternalUrl } from '../lib/safeUrl';
import type { RepoInfo } from '../../shared/types';

async function buildRepoInfo(repoPath: string): Promise<RepoInfo> {
  const name = path.basename(repoPath);
  const isGit = await GitService.isGitRepo(repoPath);
  let remoteUrl: string | undefined;
  let currentBranch: string | undefined;
  if (isGit) {
    const git = new GitService(repoPath);
    const r = await git.remoteList();
    if (r.ok && r.data.length > 0) remoteUrl = r.data[0].url;
    const b = await git.currentBranch();
    if (b.ok) currentBranch = b.data;
  }
  return {
    path: repoPath,
    name,
    remoteUrl,
    currentBranch,
    isGitRepo: isGit,
    lastOpenedAt: Date.now(),
  };
}

export function registerRepoHandlers() {
  ipcMain.handle(IPC.REPO_OPEN_DIALOG, async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const r = await dialog.showOpenDialog(win!, {
      title: '选择 Git 仓库目录',
      properties: ['openDirectory'],
    });
    if (r.canceled || r.filePaths.length === 0) return null;
    return r.filePaths[0];
  });

  ipcMain.handle(IPC.REPO_OPEN, async (_e, repoPath: string) => {
    try {
      const stat = await fs.stat(repoPath);
      if (!stat.isDirectory()) return { ok: false, error: '不是一个目录' };
      const info = await buildRepoInfo(repoPath);
      if (!info.isGitRepo) return { ok: false, error: '该目录不是 Git 仓库' };
      addRecentRepo(repoPath);
      // 登记为允许的文件系统操作根（fs handler 的白名单来源）
      registerAllowedRoot(repoPath);
      return { ok: true, data: info };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC.REPO_LIST_RECENT, async () => {
    const list = getRecentRepos();
    // 健壮性加固 P1：原本是串行 for-await —— 每个仓库都要等前一个的
    // fs.access + buildRepoInfo（后者会调 git 读 remote 和分支）跑完。
    // 最近仓库最多 20 条，其中任何一条位于未挂载的移动硬盘或离线网络驱动器上，
    // fs.access 都会阻塞数秒，首页就会整体卡住。改成并行，总耗时取决于最慢的一条。
    //
    // 注意这里刻意「跳过」而不是「删除」不可访问的条目：
    // 移动硬盘没插、网络盘没连都会让路径临时不可达，
    // 自动清理会让用户的仓库记录莫名消失。
    const settled = await Promise.all(
      list.map(async (p) => {
        try {
          await fs.access(p);
          return await buildRepoInfo(p);
        } catch {
          return null;
        }
      })
    );
    return { ok: true, data: settled.filter((r): r is RepoInfo => r !== null) };
  });

  ipcMain.handle(IPC.REPO_REMOVE_RECENT, async (_e, repoPath: string) => {
    removeRecentRepo(repoPath);
    // 同步撤销文件系统访问授权，避免已移除的仓库仍留在 fs 白名单里
    unregisterAllowedRoot(repoPath);
    return true;
  });

  ipcMain.handle(IPC.REPO_CLONE, async (e, { url, dest }: { url: string; dest: string }) => {
    try {
      const win = BrowserWindow.fromWebContents(e.sender);
      const settings = getSettings();
      const git = simpleGit({ binary: settings.gitPath || 'git' });

      // 解析仓库名
      const repoName = (url.split('/').pop() || 'repo').replace(/\.git$/, '');
      const target = path.join(dest, repoName);

      // 进度回调通过 webContents.send 实现
      await git.clone(url, target, {
        '--progress': null,
      });

      addRecentRepo(target);
      registerAllowedRoot(target);
      return { ok: true, data: { path: target } };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC.REPO_INIT, async (_e, targetPath: string) => {
    try {
      await fs.mkdir(targetPath, { recursive: true });
      const git = simpleGit({ baseDir: targetPath });
      await git.init();
      addRecentRepo(targetPath);
      registerAllowedRoot(targetPath);
      return { ok: true, data: { path: targetPath } };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC.REPO_GET_INFO, async (_e, repoPath: string) => {
    return buildRepoInfo(repoPath);
  });

  ipcMain.handle(IPC.APP_OPEN_PATH, async (_e, target: string) => {
    try {
      // 特殊标记：打开应用数据目录（由 commands.ts 的 openDataDir 命令发出）
      if (target === '@userData') {
        shell.openPath(app.getPath('userData'));
        return true;
      }
      // 其他路径必须通过白名单校验
      const safe = assertSafePath(target);
      if (!safe.ok) return { ok: false, error: safe.error };
      shell.openPath(safe.data);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle(IPC.APP_SHELL_OPEN, async (_e, url: string) => {
    const checked = assertSafeExternalUrl(url);
    if (!checked.ok) return { ok: false, error: checked.error };
    try {
      await shell.openExternal(checked.data);
      return { ok: true, data: undefined };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });
}
