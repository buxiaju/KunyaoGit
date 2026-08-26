// v0.6+ 远程 URL 解析工具（主进程版）
//
// 与 src/lib/parseRemote.ts 镜像实现。原因：主进程（electron/）不能跨层
// import 渲染层（src/）代码；纯函数逻辑共享最干净的方式是放各自目录。
// 两边实现必须保持一致；改动时记得同步 src/lib/parseRemote.ts。

export type RemotePlatform = 'github' | 'gitee' | 'other';

export interface ParsedRemote {
  owner: string;
  repo: string;
  platform: RemotePlatform;
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

  let host = '';
  if (/github\.com/i.test(clean)) host = 'github.com';
  else if (/gitee\.com/i.test(clean)) host = 'gitee.com';

  let pathPart = '';
  const sshMatch = clean.match(/:([^:]+)$/);
  if (sshMatch && /@/.test(clean.split(':')[0])) {
    pathPart = sshMatch[1];
  } else {
    try {
      const noScheme = clean.replace(/^[a-z]+:\/\//, '');
      const pathStart = noScheme.indexOf('/');
      if (pathStart < 0) return null;
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

  const segs = pathPart.replace(/^\/+/, '').split('/').filter(Boolean);
  if (segs.length < 2) return null;
  const owner = segs[0];
  let repo = segs[1];
  if (!owner || !repo) return null;
  repo = repo.replace(/\.git$/, '');

  let platform: RemotePlatform = 'other';
  if (host === 'github.com') platform = 'github';
  else if (host === 'gitee.com') platform = 'gitee';

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
 * 不能识别时返回 null。
 */
export function toSshUrl(url: string): string | null {
  const parsed = parseRemoteUrl(url);
  if (!parsed) return null;
  // 平台专属 host：GitHub 用 github.com，Gitee 用 gitee.com，其它保留原 host
  let host = 'github.com';
  if (parsed.platform === 'gitee') host = 'gitee.com';
  else if (parsed.platform === 'other') {
    // 尽力从原 URL 抽 host
    const m = url.match(/(?:@|@?[\w-]+@|\/\/)([\w.-]+?)(?::\d+)?[\/:]/);
    if (m && m[1]) host = m[1];
    else return null;
  }
  return `git@${host}:${parsed.owner}/${parsed.repo}.git`;
}

/**
 * 把任意形式的 remote URL 转换成 HTTPS 形式。
 * 不能识别时返回 null。
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
