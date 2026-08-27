// v0.6.2+ SSH 按 host 路由（渲染端镜像）
//
// 与 electron/lib/sshConfig.ts 严格一致：必须保持两端函数行为完全相同。
// （src/ 用于 SettingsPage UI 选 host / 预览 config；electron/lib 用于
// 实际写 ~/.ssh/config。）
//
// src 端是**纯函数子集**（不调 fs / shell），便于 UI 即时预览。
//
// 写盘逻辑（writeSshConfigFile）和 IO（readSshConfigFile）**只在主进程**，
// 渲染端不重复。

export type RemoteHost = 'github.com' | 'gitee.com' | 'other' | null;

/** 与 electron/lib/sshConfig 同名常量；UI 端用同一字符串 */
export const MANAGE_START = '# >>> KunyaoGit managed block (do not edit) >>>';
export const MANAGE_END = '# <<< KunyaoGit managed block <<<';

/** 按 host 选 key 路径（UI 预览） */
export function getEffectiveKeyForHost(
  host: string,
  keysByHost: { github?: string; gitee?: string } | undefined,
  fallbackKeyPath: string | undefined
): string | undefined {
  if (!host) return fallbackKeyPath;
  const normalized = host.toLowerCase().trim();
  if (keysByHost) {
    if (normalized === 'github.com' || normalized === 'gist.github.com') return keysByHost.github || fallbackKeyPath;
    if (normalized === 'gitee.com') return keysByHost.gitee || fallbackKeyPath;
  }
  return fallbackKeyPath;
}

/** 从 URL 识别 host */
export function detectRemoteHost(url: string | null | undefined): RemoteHost {
  if (!url || typeof url !== 'string') return null;
  const u = url.toLowerCase();
  if (u.includes('github.com')) return 'github.com';
  if (u.includes('gitee.com')) return 'gitee.com';
  return 'other';
}
