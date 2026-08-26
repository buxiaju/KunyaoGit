import { ipcMain, dialog, BrowserWindow } from 'electron';
import { IPC } from '../../shared/ipc-channels';
import { getSettings, setSettings, testGit, testSshConnection } from '../services/settings';

export function registerSettingsHandlers() {
  ipcMain.handle(IPC.SETTINGS_GET, async () => {
    return getSettings();
  });

  ipcMain.handle(IPC.SETTINGS_SET, async (_e, partial: any) => {
    return setSettings(partial);
  });

  ipcMain.handle(IPC.SETTINGS_TEST_GIT, async (_e, gitPath?: string) => {
    return testGit(gitPath);
  });

  // v0.6+ SSH 推送支持：测试 SSH 连接
  ipcMain.handle(IPC.SETTINGS_TEST_SSH, async (_e, sshKeyPath?: string) => {
    return testSshConnection(sshKeyPath);
  });

  ipcMain.handle(IPC.SETTINGS_TEST_AUTH, async (_e, { platform, token }: { platform: 'github' | 'gitee'; token: string }) => {
    if (platform === 'github') {
      try {
        const r = await fetch('https://api.github.com/user', {
          headers: { Authorization: `token ${token}`, 'User-Agent': 'GitGUI' },
        });
        if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
        const data = (await r.json()) as { login: string; name?: string };
        return { ok: true, data: { user: data.login, name: data.name } };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    } else {
      try {
        const r = await fetch(`https://gitee.com/api/v5/user?access_token=${token}`);
        if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
        const data = (await r.json()) as { login: string; name?: string };
        return { ok: true, data: { user: data.login, name: data.name } };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    }
  });
}
