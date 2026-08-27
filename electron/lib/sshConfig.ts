// ~/.ssh/config 写入工具（v0.6.2+ SSH 按 host 路由）
//
// 设计动机：GitService 构造时不再注入 GIT_SSH_COMMAND env（之前 v0.6.1 做法），
// 改用 OpenSSH 标准做法——把 "Host github.com / Host gitee.com" 块写入
// `~/.ssh/config`，让 ssh / git 命令调 `ssh git@github.com` 时自动选对应
// IdentityFile。这更优雅：
//   - 不污染 simpleGit 构造的 env
//   - 与系统其他 ssh 调用一致（git / ssh / ssh-add 走同一份 config）
//   - 用户的自定义 Host 块保留，KunyaoGit 只管自己的命名块
//
// 标记：`# >>> KunyaoGit managed block (do not edit) >>>` 到
// `# <<< KunyaoGit managed block <<<` 之间是 KunyaoGit 写入的，重写时会
// 先删后加。块外（用户自己的 Host）原样保留。
//
// 本模块**纯函数**：不调 fs / shell，全部返回字符串，由调用方写盘。
// 这样单测可纯跑（无 mock）。

/** 块标记——包在 manageStart/manageEnd 之间的内容会被 KunyaoGit 重写时整段替换 */
export const MANAGE_START = '# >>> KunyaoGit managed block (do not edit) >>>';
export const MANAGE_END = '# <<< KunyaoGit managed block <<<';

/** 单个 Host 块 */
export interface SshHostBlock {
  /** 'github.com' / 'gitee.com' / 自定义 */
  host: string;
  /** IdentityFile 私钥绝对路径；undefined = 移除该 Host 块 */
  keyPath?: string;
  /** 是否加 IdentitiesOnly yes（防止 ssh-agent 里其他 key 串台），默认 true */
  identitiesOnly?: boolean;
  /** StrictHostKeyChecking，默认 accept-new */
  strictHostKeyChecking?: 'yes' | 'no' | 'accept-new' | 'ask';
}

/** 把单个 block 渲染成 OpenSSH config 文本（不含标记） */
export function renderBlock(b: SshHostBlock): string {
  if (!b.keyPath) return ''; // 跳过空 keyPath
  const lines: string[] = [];
  lines.push(`Host ${b.host}`);
  lines.push(`  IdentityFile ${b.keyPath}`);
  if (b.identitiesOnly !== false) lines.push('  IdentitiesOnly yes');
  const skh = b.strictHostKeyChecking ?? 'accept-new';
  lines.push(`  StrictHostKeyChecking ${skh}`);
  return lines.join('\n');
}

/** 把一组 block 渲染成"带标记"的完整片段（可直接插入文件） */
export function renderManagedSection(blocks: SshHostBlock[]): string {
  const body = blocks
    .map(renderBlock)
    .filter((s) => s.length > 0)
    .join('\n\n');
  if (!body) return ''; // 没 block → 不写标记
  return `${MANAGE_START}\n${body}\n${MANAGE_END}`;
}

/**
 * 从完整 `~/.ssh/config` 文本中**移除**已有的 KunyaoGit 标记段。
 * 返回 { before, after }：before 是文件前半（不含标记），after 是文件后半（不含标记）。
 * 两段都**保留**末尾换行（如果内容有），去掉**前导**空行。
 * `joinParts` 自己负责补 / 删空行。
 *
 * 若文件不含标记，before = 原文，after = ''。
 */
export function stripManagedSection(content: string): { before: string; after: string } {
  const startIdx = content.indexOf(MANAGE_START);
  if (startIdx < 0) return { before: content, after: '' };
  // 找前面最近的换行（让 before 干净收尾）+ 找 END
  const endIdx = content.indexOf(MANAGE_END, startIdx);
  if (endIdx < 0) return { before: content, after: '' }; // 标记不完整 → 保守不动
  // 删 [startIdx, endIdx + MANAGE_END.length] 并把两端的多余空行收掉
  const before = content.slice(0, startIdx);
  const afterRaw = content.slice(endIdx + MANAGE_END.length).replace(/^\n+/, '');
  return { before, after: afterRaw };
}

/**
 * 把 KunyaoGit managed section 写入 `~/.ssh/config` 文本。
 * - 已有同标记段 → 替换
 * - 没有 → 追加到文件末尾
 *
 * 返回新文件全文。
 */
export function writeSshConfig(currentContent: string, blocks: SshHostBlock[]): string {
  const section = renderManagedSection(blocks);
  if (!section) {
    // blocks 全部空 → 等价于"删除 managed section"
    const { before, after } = stripManagedSection(currentContent);
    return joinParts(before, after);
  }
  const { before, after } = stripManagedSection(currentContent);
  return joinParts(before, section, after);
}

/** join 三段文本：保证 before 末尾 + section 头 + section 尾 + after 头 各有恰好一个换行 */
function joinParts(before: string, section: string, after?: string): string {
  if (before && !before.endsWith('\n')) before += '\n';
  const middle = section;
  if (!after) {
    // 末尾补换行
    let s = before + (before ? '\n' : '') + middle;
    if (!s.endsWith('\n')) s += '\n';
    return s;
  }
  let s = before + (before ? '\n' : '') + middle;
  if (!s.endsWith('\n')) s += '\n';
  s += after;
  if (!s.endsWith('\n')) s += '\n';
  return s;
}

/**
 * 给定 sshKeysByHost + fallback sshKeyPath，按 host 选最终 key 路径。
 *
 * 规则：
 *   1. sshKeysByHost[host] 配了 → 用它
 *   2. 否则用 sshKeyPath 兜底
 *   3. 都没 → undefined（让 git 用 OpenSSH 默认）
 */
export function getEffectiveKeyForHost(
  host: 'github.com' | 'gitee.com' | string,
  keysByHost: { github?: string; gitee?: string } | undefined,
  fallbackKeyPath: string | undefined
): string | undefined {
  if (!host) return fallbackKeyPath;
  // 标准化 host
  const normalized = host.toLowerCase().trim();
  // 按 host 字段查
  if (keysByHost) {
    if (normalized === 'github.com' || normalized === 'gist.github.com') return keysByHost.github || fallbackKeyPath;
    if (normalized === 'gitee.com') return keysByHost.gitee || fallbackKeyPath;
  }
  return fallbackKeyPath;
}

/**
 * 检测 URL 的 host（用于 GitService 路由）。
 * 返回 'github.com' / 'gitee.com' / 'other' / null。
 */
export function detectRemoteHost(url: string | null | undefined): 'github.com' | 'gitee.com' | 'other' | null {
  if (!url || typeof url !== 'string') return null;
  const u = url.toLowerCase();
  if (u.includes('github.com')) return 'github.com';
  if (u.includes('gitee.com')) return 'gitee.com';
  return 'other';
}
