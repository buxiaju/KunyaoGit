import { ipcMain, dialog, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import simpleGit from 'simple-git';
import { IPC } from '../../shared/ipc-channels';
import { GitService } from '../services/git';
import { getSettings, addRecentRepo, removeRecentRepo, getRecentRepos } from '../services/settings';
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
      return { ok: true, data: info };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC.REPO_LIST_RECENT, async () => {
    const list = getRecentRepos();
    const out: RepoInfo[] = [];
    for (const p of list) {
      try {
        await fs.access(p);
        out.push(await buildRepoInfo(p));
      } catch {
        // skip missing
      }
    }
    return { ok: true, data: out };
  });

  ipcMain.handle(IPC.REPO_REMOVE_RECENT, async (_e, repoPath: string) => {
    removeRecentRepo(repoPath);
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
      return { ok: true, data: { path: targetPath } };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC.REPO_GET_INFO, async (_e, repoPath: string) => {
    return buildRepoInfo(repoPath);
  });

  ipcMain.handle(IPC.APP_OPEN_PATH, async (_e, target: string) => {
    shell.openPath(target);
    return true;
  });

  ipcMain.handle(IPC.APP_SHELL_OPEN, async (_e, url: string) => {
    shell.openExternal(url);
    return true;
  });
}
