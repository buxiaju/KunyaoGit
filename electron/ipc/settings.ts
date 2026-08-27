import { ipcMain, dialog, BrowserWindow } from 'electron';
import { IPC } from '../../shared/ipc-channels';
import {
  getSettings,
  setSettings,
  testGit,
  testSshConnection,
  testSshConnectionForHost,
  generateSshKey,
  readPublicKey,
  readSshConfigFile,
  writeSshConfigFile,
} from '../services/settings';

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

  // v0.6+ SSH 推送支持：测试 SSH 连接（v0.6.1 旧签名，硬编码 github.com）
  ipcMain.handle(IPC.SETTINGS_TEST_SSH, async (_e, sshKeyPath?: string) => {
    return testSshConnection(sshKeyPath);
  });

  // v0.6.2+：按 host 测试（github / gitee）
  ipcMain.handle(IPC.SETTINGS_TEST_SSH_FOR_HOST, async (_e, input: { host: 'github.com' | 'gitee.com'; keyPath?: string }) => {
    return testSshConnectionForHost(input);
  });

  // v0.6.2+：一键生成 ed25519 SSH 密钥
  ipcMain.handle(IPC.SETTINGS_SSH_GENERATE, async (_e, input: { keyPath: string; comment: string; passphrase?: string }) => {
    return generateSshKey(input);
  });

  // v0.6.2+：读 .pub 文件（用于"显示公钥"）
  ipcMain.handle(IPC.SETTINGS_SSH_READ_PUBKEY, async (_e, keyPath: string) => {
    return readPublicKey(keyPath);
  });

  // v0.6.2+：写 ~/.ssh/config（KunyaoGit managed block）
  ipcMain.handle(IPC.SETTINGS_SSH_WRITE_CONFIG, async (_e, blocks: { host: string; keyPath?: string }[]) => {
    return writeSshConfigFile(blocks);
  });

  // v0.6.2+：读 ~/.ssh/config 全文（用于显示给用户预览）
  ipcMain.handle(IPC.SETTINGS_SSH_READ_CONFIG, async () => {
    return { content: readSshConfigFile() };
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
