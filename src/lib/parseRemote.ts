// v0.4+ 远程 URL 解析工具
// 从 remote URL 解析 owner/repo/platform，支持 https / ssh 格式

export type RemotePlatform = 'github' | 'gitee' | 'other';

export interface ParsedRemote {
  owner: string;
  repo: string;
  platform: RemotePlatform;
  /** 去掉 .git 后缀的干净 URL，便于显示 */
  displayUrl: string;
}

/**
 * 解析 git remote URL
 * 支持的格式：
 *   https://github.com/owner/repo.git
 *   https://github.com/owner/repo
 *   git@github.com:owner/repo.git
 *   ssh://git@github.com/owner/repo.git
 *   git://github.com/owner/repo.git
 *   https://username:password@github.com/owner/repo.git （token 注入格式）
 */
export function parseRemoteUrl(url: string): ParsedRemote | null {
  if (!url || typeof url !== 'string') return null;

  const clean = url.trim();

  // 先判断平台（host 提取）
  let host = '';
  if (/github\.com/i.test(clean)) host = 'github.com';
  else if (/gitee\.com/i.test(clean)) host = 'gitee.com';

  // 解析 path 段：owner/repo(.git)?
  let pathPart = '';
  // SSH 格式：git@host:owner/repo.git
  const sshMatch = clean.match(/:([^:]+)$/);
  if (sshMatch && /@/.test(clean.split(':')[0])) {
    pathPart = sshMatch[1];
  } else {
    // URL 格式：scheme://.../owner/repo
    try {
      // 注意要处理带 @ 形式的 user:pass@host
      const noScheme = clean.replace(/^[a-z]+:\/\//, '');
      const pathStart = noScheme.indexOf('/');
      // 跳过 host 部分（注意 host 可能含端口）
      if (pathStart < 0) return null;
      // 找第一个 /，但要跳过第一个 / 后的"假路径"——host:port 形式
      // 简化：取 pathStart+1 之后到第一个 ? 或 # 之间
      const after = noScheme.slice(pathStart + 1);
      const qIdx = after.indexOf('?');
      const hIdx = after.indexOf('#');
      const end = Math.min(
        qIdx < 0 ? after.length : qIdx,
        hIdx < 0 ? after.length : hIdx
      );
      pathPart = after.slice(0, end);
    } catch {
      return null;
    }
  }

  // path 形如 owner/repo.git 或 owner/repo
  const segs = pathPart.replace(/^\/+/, '').split('/').filter(Boolean);
  if (segs.length < 2) return null;
  const owner = segs[0];
  let repo = segs[1];
  if (!owner || !repo) return null;
  repo = repo.replace(/\.git$/, '');

  let platform: RemotePlatform = 'other';
  if (host === 'github.com') platform = 'github';
  else if (host === 'gitee.com') platform = 'gitee';

  // 显示用 URL：保留 scheme + host + path，剥离 user:pass
  let displayUrl = clean;
  displayUrl = displayUrl.replace(/\/\/[^@/]+@/, '//');

  return { owner, repo, platform, displayUrl };
}

/** 远程 URL 协议类型。 */
export type RemoteProtocol = 'ssh' | 'https' | 'git' | 'unknown';

/**
 * 识别一个 git remote URL 用的协议。
 * 注意只识别 URL 自身的协议，不去 DNS 探测。
 */
export function detectProtocol(url: string): RemoteProtocol {
  if (!url || typeof url !== 'string') return 'unknown';
  const clean = url.trim();
  if (/^ssh:\/\//i.test(clean)) return 'ssh';
  if (/^https?:\/\//i.test(clean)) return /^https:\/\//i.test(clean) ? 'https' : 'git';
  if (/^git:\/\//i.test(clean)) return 'git';
  // git@host:owner/repo 形式（scp-like SSH）
  if (/^[\w-]+@[\w.-]+:/.test(clean)) return 'ssh';
  return 'unknown';
}

/**
 * 把任意形式的 remote URL 转换成 SSH 形式（`git@github.com:owner/repo.git`）。
 */
export function toSshUrl(url: string): string | null {
  const parsed = parseRemoteUrl(url);
  if (!parsed) return null;
  let host = 'github.com';
  if (parsed.platform === 'gitee') host = 'gitee.com';
  else if (parsed.platform === 'other') {
    const m = url.match(/(?:@|@?[\w-]+@|\/\/)([\w.-]+?)(?::\d+)?[\/:]/);
    if (m && m[1]) host = m[1];
    else return null;
  }
  return `git@${host}:${parsed.owner}/${parsed.repo}.git`;
}

/**
 * 把任意形式的 remote URL 转换成 HTTPS 形式。
 */
export function toHttpsUrl(url: string): string | null {
  const parsed = parseRemoteUrl(url);
  if (!parsed) return null;
  let host = 'github.com';
  if (parsed.platform === 'gitee') host = 'gitee.com';
  else if (parsed.platform === 'other') {
    const m = url.match(/(?:@|@?[\w-]+@|\/\/)([\w.-]+?)(?::\d+)?[\/:]/);
    if (m && m[1]) host = m[1];
    else return null;
  }
  return `https://${host}/${parsed.owner}/${parsed.repo}.git`;
}
