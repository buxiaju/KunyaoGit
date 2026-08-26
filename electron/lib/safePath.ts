// 主进程文件系统路径边界校验（健壮性加固）
//
// 背景：`electron/ipc/fs.ts` 的 8 个 handler 原本直接使用渲染层传入的路径，
// 没有任何边界校验。渲染层 `src/stores/repo.ts` 里的 `assertSafeRelPath` 只是
// 「善意调用方」的自我约束——攻击者（或被 XSS 的渲染进程）可以绕过 store
// 直接调 `window.gitgui.fs.delete('C:/')`。
//
// 因此边界校验必须在主进程侧做，且必须是白名单式：
//   1. 只有被显式登记为「已打开仓库根」的目录及其子路径可以读写；
//   2. 即使在白名单内，仍然拦截系统关键目录（第二道防线，防止用户把
//      仓库根选成 C:\ 或 C:\Windows 这类目录）。
//
// 本模块刻意不 import electron，保持为纯函数，便于单元测试。

import path from 'node:path';

export type SafePathResult = { ok: true; data: string } | { ok: false; error: string };

/** 已登记的仓库根（规范化后的绝对路径）。仅由 repo:open / clone / init 写入。 */
const allowedRoots = new Set<string>();

/**
 * 规范化路径用于比较：
 * - `path.resolve` 消除 `..` / `.` 与冗余分隔符
 * - Windows 下大小写不敏感，统一转小写
 */
function normalize(p: string): string {
  const resolved = path.resolve(p);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/**
 * 系统关键目录黑名单。命中则一律拒绝，优先级高于白名单。
 * 只列「目录本身」——其子目录是否放行由白名单决定。
 */
function isDangerousPath(resolved: string): boolean {
  const p = normalize(resolved);

  // 盘符根：C:\ / D:\ ...
  if (/^[a-z]:(\\|\/)?$/i.test(p)) return true;
  // POSIX 根
  if (p === '/') return true;

  const dangerousRoots =
    process.platform === 'win32'
      ? [
          'c:\\windows',
          'c:\\program files',
          'c:\\program files (x86)',
          'c:\\programdata',
          'c:\\$recycle.bin',
          'c:\\system volume information',
        ]
      : ['/etc', '/bin', '/sbin', '/usr', '/boot', '/dev', '/proc', '/sys', '/system', '/library'];

  for (const root of dangerousRoots) {
    // 命中目录本身或其内部
    if (p === root || p.startsWith(root + path.sep) || p.startsWith(root + '/')) return true;
  }

  // 用户主目录「根本身」不允许整体操作（子目录允许，仓库通常在这下面）
  const home = process.env.USERPROFILE || process.env.HOME;
  if (home && p === normalize(home)) return true;

  return false;
}

/**
 * 判断 target 是否位于 root 内部（含 root 本身）。
 * 用 path.relative 而非字符串 startsWith，避免 `C:\repo-evil` 命中 `C:\repo` 的前缀陷阱。
 */
export function isInside(root: string, target: string): boolean {
  const rel = path.relative(normalize(root), normalize(target));
  if (rel === '') return true; // 就是 root 本身
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** 登记一个允许访问的仓库根。由 repo:open / repo:clone / repo:init 成功后调用。 */
export function registerAllowedRoot(root: string): void {
  if (!root || typeof root !== 'string') return;
  const resolved = path.resolve(root);
  if (isDangerousPath(resolved)) return; // 拒绝把系统目录登记为仓库根
  allowedRoots.add(normalize(resolved));
}

/** 移除一个仓库根（从最近列表删除时调用）。 */
export function unregisterAllowedRoot(root: string): void {
  if (!root || typeof root !== 'string') return;
  allowedRoots.delete(normalize(root));
}

/** 测试用：清空白名单。 */
export function clearAllowedRoots(): void {
  allowedRoots.clear();
}

/**
 * 校验一个仓库内相对路径是否真的位于仓库根之内。
 *
 * 用于 `git:blame` / `git:file-log` / `git:file-diff` / `git:diff-file` /
 * `git:read-conflict` 这类 handler：它们接收的是仓库**内**的相对文件路径，
 * 渲染层传 `../../../etc/passwd` 时 simple-git 在某些版本能跳出仓库根。
 *
 * 实现：把 file 视为相对于 repoPath 解析，**不**调用 fs 跟随符号链接（让
 * simple-git 自己处理 symlink，避免越界后被静默跟随）。然后用 `isInside`
 * 做边界判定。`file` 是绝对路径时直接当路径校验。
 */
export function assertInsideRepo(
  repoPath: unknown,
  file: unknown
): { ok: true; data: string } | { ok: false; error: string } {
  if (typeof repoPath !== 'string' || repoPath.trim() === '') {
    return { ok: false, error: '仓库路径无效' };
  }
  if (typeof file !== 'string' || file.trim() === '') {
    return { ok: false, error: '文件路径无效' };
  }
  if (file.includes('\0')) {
    return { ok: false, error: '文件路径包含非法字符' };
  }

  const repoResolved = path.resolve(repoPath);
  // file 是绝对路径时直接用；相对路径则相对 repoRoot 解析
  const fileResolved = path.isAbsolute(file) ? path.resolve(file) : path.resolve(repoResolved, file);

  if (isDangerousPath(fileResolved)) {
    return { ok: false, error: '拒绝操作系统关键目录' };
  }

  if (!isInside(repoResolved, fileResolved)) {
    return { ok: false, error: '文件路径超出仓库范围' };
  }

  return { ok: true, data: fileResolved };
}

/** 测试 / 诊断用：查看当前白名单。 */
export function listAllowedRoots(): string[] {
  return [...allowedRoots];
}

/**
 * 校验一个文件系统操作目标路径是否安全。
 * 成功时返回 resolve 后的绝对路径（调用方应当使用这个规范化结果，而不是原始入参）。
 */
export function assertSafePath(target: unknown): SafePathResult {
  if (typeof target !== 'string' || target.trim() === '') {
    return { ok: false, error: '路径无效' };
  }
  // NUL 字节会截断底层系统调用，提前拦截
  if (target.includes('\0')) {
    return { ok: false, error: '路径包含非法字符' };
  }

  const resolved = path.resolve(target);

  if (isDangerousPath(resolved)) {
    return { ok: false, error: '拒绝操作系统关键目录' };
  }

  if (allowedRoots.size === 0) {
    return { ok: false, error: '尚未打开任何仓库，操作被拒绝' };
  }

  for (const root of allowedRoots) {
    if (isInside(root, resolved)) return { ok: true, data: resolved };
  }

  return { ok: false, error: '路径超出已打开仓库范围，操作被拒绝' };
}

/**
 * 把错误消息里的绝对路径脱敏，避免 toast / 日志 / 远程 API 错误回显
 * 直接把 `C:\Users\kunyao\Documents\xxx\yyy.txt` 这样的用户真实路径泄露。
 *
 * 规则（按顺序，先长后短避免误伤）：
 *   1. UNC / 长路径前缀：`\\?\C:\...` → `<long-path>\...`
 *   2. WSL 路径：`\\wsl$\Ubuntu\...` → `<wsl>\...`
 *   3. Windows 盘符路径：保留最后两段（文件名 + 它所在目录），如
 *      `C:\Users\kunyao\Documents\xxx\file.txt` → `~\xxx\file.txt`；
 *      如果总段数 < 2 则只保留文件名。
 *   4. POSIX 用户路径：同上，`/Users/bob/proj/foo.ts` → `~/proj/foo.ts`。
 *
 * 纯函数。空消息返回原样。
 */
export function redactPath(msg: string): string {
  if (!msg) return msg;

  // 1. UNC 形式（长路径前缀）
  let out = msg.replace(/\\\\\?\\[^:\s]+:[^:\s]*\\/g, '<long-path>\\');

  // 2. WSL 形式
  out = out.replace(/\\\\wsl\$\.?[^\\]*\\/gi, '<wsl>\\');

  // 3. Windows 盘符绝对路径（用宽松终止符：空白/引号/尖括号/管道/中括号/逗号分号）
  //    脱敏语义：去掉盘符 + 第一段（用户目录或项目根），保留最后两段。
  out = out.replace(/\b[A-Za-z]:[\\\/][^\s'"<>|,\[\];{}]*/g, (m) => {
    const rest = m.replace(/^[A-Za-z]:[\\\/]+/, '');
    const segs = rest.split(/[\\\/]/).filter(Boolean);
    if (segs.length === 0) return m;
    // 去掉第一段（盘符用户名/项目根）
    const inner = segs.slice(1);
    if (inner.length === 0) return `~\\${segs[0]}`;
    if (inner.length === 1) return `~\\${inner[0]}`;
    return `~\\${inner.slice(-2).join('\\')}`;
  });

  // 4. POSIX 用户路径（/Users/... /home/... /root/... /tmp/...）
  //    capture1 = 前导（^ 或空白/标点），capture2 = 完整路径（以 / 开头）
  //    脱敏语义：去掉 root 类型（Users/home/root/tmp）+ 下一段用户名，
  //    再保留剩余路径的最后两段（文件名 + 所在目录）；剩余不足 2 段时按实际段数保留。
  out = out.replace(
    /(^|[\s'"(<>=,;])(\/(?:Users|home|root|tmp)\/[^\s'"<>|,\[\];]*)/g,
    (_m, lead, path) => {
      const segs = path.split('/').filter(Boolean); // ['Users', 'bob', 'proj', 'foo.ts']
      if (segs.length === 0) return _m;
      // 去掉 root 类型 + 用户名（前 2 段）
      const inner = segs.slice(2);
      if (inner.length === 0) return `${lead}~/${segs[segs.length - 1]}`;
      if (inner.length === 1) return `${lead}~/${inner[0]}`;
      return `${lead}~/${inner.slice(-2).join('/')}`;
    }
  );

  return out;
}
