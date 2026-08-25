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
