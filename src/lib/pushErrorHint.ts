// v0.6+ SSH 推送支持：检测 push 失败是不是网络问题，并提示用户切换 SSH。
//
// 触发场景：国内访问 github.com:443 受限时，git push 报
//   "Failed to connect to github.com port 443 after 21060 ms: Could not connect to server"
//   或 Gitee 类似。
//
// 这里的判断只是"经验性"——只要错误消息里含下列任一模式，就认为是网络问题。
// 这些是 git CLI / libcurl / ssh 客户端的常见报错原文。

const NETWORK_PATTERNS = [
  /Failed to connect to [^ ]+ port (443|22) after \d+ ms/i,
  /Could not connect to server/i,
  /Connection timed out/i,
  /Connection refused/i,
  /Could not resolve hostname/i,
  /Network is unreachable/i,
  /A connection attempt failed/i,
  // GitHub specific
  /kex_exchange_identification/i,
  /no matching host key type/i,
];

/** 给一段 git / 网络错误文本，返回"是否看起来是网络问题"。 */
export function isNetworkError(error: string): boolean {
  if (!error || typeof error !== 'string') return false;
  return NETWORK_PATTERNS.some((re) => re.test(error));
}

/**
 * 构造一个带"切换 SSH"动作的 toast 提示（v0.6+ SSH 推送支持）。
 *
 * 调用方传入仓库路径 + 默认远端名（如 'origin'）+ 原始错误消息。
 * 函数检测错误是否网络问题，**不**是则返回 null（调用方走普通 toast）。
 * 是则返回结构化对象，调用方按结构渲染 toast + 切换按钮。
 */
export interface SwitchToSshHint {
  /** 用户可见的提示标题 */
  title: string;
  /** 简短错误摘要（已脱敏） */
  errorShort: string;
  /** 点击切换按钮时执行的动作 */
  action: 'switchToSsh';
  repoPath: string;
  remoteName: string;
}

export function buildSwitchToSshHint(
  repoPath: string,
  remoteName: string,
  error: string,
  t: (key: string, params?: Record<string, any>) => string
): SwitchToSshHint | null {
  if (!isNetworkError(error)) return null;
  // 截短错误文本，避免 toast 过长
  const errShort = error.length > 200 ? error.slice(0, 200) + '…' : error;
  return {
    title: t('settings.pushFailedNetwork', { error: errShort }),
    errorShort: errShort,
    action: 'switchToSsh',
    repoPath,
    remoteName,
  };
}

/**
 * 把仓库的 origin 从 HTTPS URL 切到 SSH URL（v0.6+ SSH 推送支持）。
 * 失败抛错（不吞），让上层 toast 报错。
 */
export async function switchOriginToSsh(
  repoPath: string,
  remoteName: string
): Promise<{ ok: boolean; oldUrl: string; newUrl: string; error?: string }> {
  // 1. 读现配的 remote URL
  const listRes: any = await window.gitgui.git.remoteList(repoPath);
  if (!listRes.ok) {
    return { ok: false, oldUrl: '', newUrl: '', error: listRes.error || '读取远程列表失败' };
  }
  const target = listRes.data.find((r: any) => r.name === remoteName);
  if (!target) {
    return { ok: false, oldUrl: '', newUrl: '', error: `remote '${remoteName}' 不存在` };
  }
  const oldUrl: string = target.fetch || target.push || '';
  if (!oldUrl) {
    return { ok: false, oldUrl: '', newUrl: '', error: '原 URL 为空' };
  }
  // 2. 转 SSH 形式
  // 动态 import 避免循环依赖
  const { toSshUrl } = await import('./parseRemote');
  const newUrl = toSshUrl(oldUrl);
  if (!newUrl) {
    return { ok: false, oldUrl, newUrl: '', error: '无法解析为 SSH URL（可能不是 GitHub / Gitee）' };
  }
  if (newUrl === oldUrl) {
    return { ok: false, oldUrl, newUrl, error: '当前 remote 已是 SSH 协议' };
  }
  // 3. 写回
  const setRes: any = await window.gitgui.git.setRemoteUrl(repoPath, remoteName, newUrl);
  if (!setRes.ok) {
    return { ok: false, oldUrl, newUrl, error: setRes.error || '修改失败' };
  }
  return { ok: true, oldUrl, newUrl };
}
