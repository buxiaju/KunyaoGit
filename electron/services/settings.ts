import Store from 'electron-store';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AppSettings } from '../../shared/types';

const execFileAsync = promisify(execFile);

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  defaultCloneDir: '',
  diffView: 'split',
  auth: {},
};

export const store = new Store<AppSettings>({
  name: 'gitgui-settings',
  defaults: DEFAULT_SETTINGS,
});

export function getSettings(): AppSettings {
  return store.store;
}

export function setSettings(settings: Partial<AppSettings>) {
  const current = store.store;
  store.store = { ...current, ...settings };
  return store.store;
}

export function getRecentRepos(): string[] {
  return (store.get('recentRepos' as any) as string[] | undefined) || [];
}

export function addRecentRepo(repoPath: string) {
  const list = getRecentRepos().filter((p) => p !== repoPath);
  list.unshift(repoPath);
  store.set('recentRepos' as any, list.slice(0, 20));
}

export function removeRecentRepo(repoPath: string) {
  const list = getRecentRepos().filter((p) => p !== repoPath);
  store.set('recentRepos' as any, list);
}

export async function testGit(gitPath?: string): Promise<{ ok: boolean; version?: string; error?: string }> {
  try {
    const { stdout } = await execFileAsync(gitPath || 'git', ['--version']);
    const m = stdout.match(/git version (\S+)/);
    return { ok: true, version: m?.[1] || stdout.trim() };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
