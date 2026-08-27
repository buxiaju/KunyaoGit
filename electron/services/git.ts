import simpleGit, { SimpleGit, StatusResult, BranchSummary, LogResult, DefaultLogFields } from 'simple-git';
import path from 'node:path';
import fs from 'node:fs/promises';
import { assertInsideRepo, redactPath } from '../lib/safePath';

import type {
  CommitInfo,
  BranchInfo,
  FileStatus,
  FileDiff,
  DiffHunk,
  DiffLine,
  Result,
  RemoteInfo,
  StashEntry,
  GitFile,
  BlameLine,
} from '../../shared/types';

/**
 * 单次 git 调用的「静默超时」（健壮性加固 P1）。
 *
 * 原本 simple-git 没有配置任何 timeout，一旦底层 git 进程卡住就永不返回：
 * 渲染层的 await 永远不 resolve，界面卡在 loading 且没有任何提示，
 * 用户只能强杀应用。最典型的触发场景是对需要认证的 remote 执行
 * fetch/pull/push —— git 在等凭据输入，而 GUI 里没有可交互的终端。
 *
 * 这里用的是 simple-git 的 `timeout.block`，语义是「两次输出之间的最大间隔」，
 * 不是操作总时长。所以 clone 一个大仓库（有持续进度输出）不会被误杀，
 * 而真正卡死（完全无输出）的调用会在 60s 后失败退出。
 */
const BLOCK_TIMEOUT_MS = 60_000;

export class GitService {
  private git: SimpleGit;

  constructor(private repoPath: string, gitBinPath?: string, _sshKeyPath?: string) {
    // v0.6.2 改造：构造时**不**再注入 GIT_SSH_COMMAND env。
    // 改用 OpenSSH 标准做法——把 "Host github.com / Host gitee.com" 块写入
    // ~/.ssh/config（见 electron/lib/sshConfig.ts + electron/services/settings.ts
    // 的 writeSshConfig），让 OpenSSH 客户端按 host 自动选 IdentityFile。
    //
    // 旧做法（v0.6.1）：每个 GitService 实例注入单一 env，只支持一个 key。
    // 新做法：ssh / git / ssh-agent 都走同一份 ~/.ssh/config，
    // 用户的其他 ssh 调用也自动用对（更优雅）。
    //
    // `_sshKeyPath` 保留参数是为了**向后兼容**（v0.6.1 阶段 ipc/git.ts 的
    // getGitSafe 仍传 settings.sshKeyPath）。新代码忽略它。
    void _sshKeyPath;
    this.git = simpleGit({
      baseDir: repoPath,
      binary: gitBinPath || 'git',
      maxConcurrentProcesses: 4,
      timeout: { block: BLOCK_TIMEOUT_MS },
    });
  }

  /**
   * 把底层错误翻译成用户能看懂的提示。
   * simple-git 的超时错误原文是英文的 "block timeout reached"，
   * 直接抛给界面用户无法理解，也不知道该怎么处理。
   *
   * 同时对消息做路径脱敏：simple-git / Node fs 错误常常带完整绝对路径
   * （如 `ENOENT: ... 'C:\\Users\\kunyao\\Documents\\xxx'`），不能让这些
   * 路径细节随 toast / 日志 / 远程 API 错误回显泄露给渲染层或上游服务。
   */
  static describeError(e: unknown): string {
    const raw = (e as Error)?.message || String(e);
    if (/block timeout reached/i.test(raw)) {
      return `Git 操作超时（${BLOCK_TIMEOUT_MS / 1000}s 无响应）。如果是网络操作，请检查网络连通性、代理设置，或确认该远程仓库是否需要认证凭据`;
    }
    return redactPath(raw);
  }

  /** 统一的失败返回构造，集中做错误消息翻译。 */
  private fail(e: unknown): { ok: false; error: string } {
    return { ok: false, error: GitService.describeError(e) };
  }

  /**
   * 仓库内文件路径校验（健壮性加固 B）。被 `blame` / `fileLog` / `fileDiff` /
   * `diffFile` / `readConflictFile` 五个方法在第一行调用，阻止渲染层传
   * `../../../etc/passwd` 类的越界输入。
   *
   * 失败时直接返回 `{ ok: false, error }` 形态 —— handler 把它当业务错误
   * 透传给 UI，不抛异常。
   */
  private assertInsideRepo(file: unknown): { ok: true; data: string } | { ok: false; error: string } {
    return assertInsideRepo(this.repoPath, file);
  }

  static async isGitRepo(repoPath: string): Promise<boolean> {
    try {
      const gitDir = path.join(repoPath, '.git');
      const stat = await fs.stat(gitDir);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  async status(): Promise<Result<FileStatus[]>> {
    try {
      const s: StatusResult = await this.git.status();
      const files: FileStatus[] = [];

      // ⚠️ 不要依赖 s.modified / s.staged 等便捷数组：simple-git 的 modified 同时包含
      // 「未暂存修改」和「已暂存修改」，会把未暂存文件误标为 staged（v0.3.7 修复）。
      // 用 s.files 的 index（暂存区标记）与 working_dir（工作区标记）精确区分：
      //   index  = 'A'|'M'|'D'|'R'|'C'  → 已暂存；' '（空格）→ 未暂存；'?' → 未跟踪
      //   workdir= 'M'|'D'|'?'          → 工作区状态
      for (const f of s.files) {
        const index: string = (f.index || ' ').trim();
        const workdir: string = (f.working_dir || ' ').trim();
        const staged = index !== '' && index !== '?';

        if (index === '?' || (index === '' && workdir === '?')) {
          files.push({ path: f.path, status: 'untracked', staged: false });
          continue;
        }
        if (index === 'A' || index === 'C') {
          files.push({ path: f.path, status: 'added', staged: true });
        } else if (index === 'M') {
          files.push({ path: f.path, status: 'modified', staged: true });
        } else if (index === 'D') {
          files.push({ path: f.path, status: 'deleted', staged: true });
        } else if (index === 'R') {
          const from = (f as any).from;
          files.push({ path: f.path, oldPath: from || undefined, status: 'renamed', staged: true });
        }
        // 未暂存部分（按 working_dir 独立判断，覆盖 MM / AM 等「暂存+未暂存」混合态）
        if (workdir === 'M') files.push({ path: f.path, status: 'modified', staged: false });
        else if (workdir === 'D') files.push({ path: f.path, status: 'deleted', staged: false });
      }
      for (const f of s.conflicted) files.push({ path: f, status: 'conflicted', staged: false });

      return { ok: true, data: files };
    } catch (e) {
      return this.fail(e);
    }
  }

  async log(opts: { maxCount?: number; branch?: string } = {}): Promise<Result<CommitInfo[]>> {
    try {
      const result: LogResult<DefaultLogFields> = await this.git.log({
        maxCount: opts.maxCount ?? 200,
        ...(opts.branch ? { from: opts.branch } : {}),
      });
      const list: CommitInfo[] = result.all.map((c) => ({
        hash: c.hash,
        shortHash: c.hash.slice(0, 7),
        author: c.author_name,
        email: c.author_email,
        date: c.date,
        message: c.message,
        refs: c.refs?.split(', ').filter(Boolean) || [],
      }));
      return { ok: true, data: list };
    } catch (e) {
      return this.fail(e);
    }
  }

  async branches(): Promise<Result<BranchInfo[]>> {
    try {
      const summary: BranchSummary = await this.git.branch(['-vv', '--all']);
      const list: BranchInfo[] = Object.values(summary.branches).map((b) => {
        const isRemote = b.name.startsWith('remotes/');
        const cleanName = isRemote ? b.name.replace(/^remotes\/[^\/]+\//, '') : b.name;
        const [lastCommit, ...rest] = (b.commit || '').split(' ');
        return {
          name: cleanName,
          current: b.current,
          remote: isRemote,
          upstream: rest.join(' ') || undefined,
          lastCommit,
        };
      });
      // 标注 ahead/behind
      try {
        const status = await this.git.status();
        if (status.tracking) {
          const target = list.find((b) => b.current);
          if (target) {
            target.ahead = status.ahead;
            target.behind = status.behind;
          }
        }
      } catch {
        // ignore
      }
      return { ok: true, data: list };
    } catch (e) {
      return this.fail(e);
    }
  }

  async stage(paths: string[]): Promise<Result<void>> {
    try {
      await this.git.add(paths);
      return { ok: true, data: undefined };
    } catch (e) {
      return this.fail(e);
    }
  }

  async unstage(paths: string[]): Promise<Result<void>> {
    try {
      await this.git.reset(['HEAD', '--', ...paths]);
      return { ok: true, data: undefined };
    } catch (e) {
      return this.fail(e);
    }
  }

  async discard(paths: string[]): Promise<Result<void>> {
    try {
      await this.git.checkout(['--', ...paths]);
      return { ok: true, data: undefined };
    } catch (e) {
      return this.fail(e);
    }
  }

  async commit(message: string, opts: { amend?: boolean; signOff?: boolean } = {}): Promise<Result<{ hash: string }>> {
    try {
      // 用 raw 执行并自行解析：比 simple-git 的 commit() 更可控，
      // 失败时能把 git 原始输出 + 实际暂存区状态带回错误信息便于诊断。
      const args: string[] = ['commit', '-m', message];
      if (opts.signOff) args.push('--signoff');
      if (opts.amend) args.push('--amend');
      const out = await this.git.raw(args);
      // 解析 [branch (root-commit)? hash] 或 [branch hash]（git 输出第一行）
      const m = out.match(/\[([^\s]+)(?: \([^)]+\))? ([0-9a-f]{7,40})\]/i);
      if (!m) {
        // 未产生新提交：区分「暂存区为空」与「输出格式异常」，带原始输出诊断
        let stagedPaths: string[] = [];
        const st = await this.status();
        if (st.ok) stagedPaths = st.data.filter((s) => s.staged).map((s) => s.path);
        const reason = stagedPaths.length === 0
          ? '暂存区为空（没有可提交的文件）'
          : `已暂存 ${stagedPaths.length} 个文件但 git 未产生提交`;
        return {
          ok: false,
          error: `提交失败：${reason}。git 输出：${out.trim().slice(0, 300)}`,
        };
      }
      return { ok: true, data: { hash: m[2] } };
    } catch (e) {
      return this.fail(e);
    }
  }

  async push(opts: { remote?: string; branch?: string; setUpstream?: boolean; force?: boolean } = {}): Promise<Result<string>> {
    try {
      const args: string[] = [];
      if (opts.setUpstream) args.push('-u');
      if (opts.force) args.push('--force-with-lease');
      if (opts.remote) args.push(opts.remote);
      if (opts.branch) args.push(opts.branch);
      const result = await this.git.push(args);
      const summary = result.pushed?.length
        ? `已推送 ${result.pushed.length} 个引用`
        : result.ref?.local || 'push ok';
      return { ok: true, data: summary };
    } catch (e) {
      return this.fail(e);
    }
  }

  async pull(opts: { remote?: string; branch?: string; rebase?: boolean } = {}): Promise<Result<string>> {
    try {
      const args: string[] = [];
      if (opts.rebase) args.push('--rebase');
      if (opts.remote) args.push(opts.remote);
      if (opts.branch) args.push(opts.branch);
      const result = await this.git.pull(args);
      return { ok: true, data: result.summary?.toString() || 'pull ok' };
    } catch (e) {
      return this.fail(e);
    }
  }

  async fetch(opts: { remote?: string; prune?: boolean } = {}): Promise<Result<void>> {
    try {
      const args: string[] = ['fetch'];
      if (opts.prune) args.push('--prune');
      if (opts.remote) args.push(opts.remote);
      await this.git.raw(args);
      return { ok: true, data: undefined };
    } catch (e) {
      return this.fail(e);
    }
  }

  async checkout(target: string, opts: { create?: boolean } = {}): Promise<Result<void>> {
    try {
      // ⚠️ simple-git checkout(options) 直接透传，不要再带 'checkout' 前缀
      const args: string[] = [];
      if (opts.create) args.push('-b');
      args.push(target);
      await this.git.checkout(args);
      return { ok: true, data: undefined };
    } catch (e) {
      return this.fail(e);
    }
  }

  async createBranch(name: string, from?: string): Promise<Result<void>> {
    try {
      const args: string[] = ['-b', name];
      if (from) args.push(from);
      await this.git.checkout(args);
      return { ok: true, data: undefined };
    } catch (e) {
      return this.fail(e);
    }
  }

  async deleteBranch(name: string, force = false): Promise<Result<void>> {
    try {
      await this.git.deleteLocalBranch(name, force);
      return { ok: true, data: undefined };
    } catch (e) {
      return this.fail(e);
    }
  }

  async merge(branch: string, opts: { noFF?: boolean; squash?: boolean; message?: string } = {}): Promise<Result<string>> {
    try {
      const args: string[] = ['merge'];
      if (opts.noFF) args.push('--no-ff');
      if (opts.squash) args.push('--squash');
      if (opts.message) args.push('-m', opts.message);
      args.push(branch);
      const result = await this.git.raw(args);
      return { ok: true, data: result };
    } catch (e) {
      return this.fail(e);
    }
  }

  async stash(message?: string): Promise<Result<void>> {
    try {
      if (message) {
        await this.git.stash(['push', '-m', message]);
      } else {
        await this.git.stash();
      }
      return { ok: true, data: undefined };
    } catch (e) {
      return this.fail(e);
    }
  }

  async stashPop(): Promise<Result<void>> {
    try {
      await this.git.stash(['pop']);
      return { ok: true, data: undefined };
    } catch (e) {
      return this.fail(e);
    }
  }

  /**
   * v0.4+ 列出 stash 队列
   * 用 --format 自定义输出：stash@{0}|hash|subject|isoDate
   * 同时解析 "WIP on branch: hash subject" 提取分支名
   */
  async stashList(): Promise<Result<StashEntry[]>> {
    try {
      // 用空 format 占位，然后单独读每条 message（更可靠）
      const out = await this.git.raw([
        'stash', 'list',
        '--format=%gd|%h|%cI|%s',
      ]);
      if (!out.trim()) return { ok: true, data: [] };
      const lines = out.split('\n').filter(Boolean);
      const entries: StashEntry[] = [];
      for (let i = 0; i < lines.length; i++) {
        const parts = lines[i].split('|');
        if (parts.length < 4) continue;
        const [ref, hash, date, ...msgParts] = parts;
        const message = msgParts.join('|');
        // 提取分支：形如 "WIP on main: 9c9a1b4 xxx" → main
        const m = message.match(/^(?:WIP on |On )([^:]+?):\s*[0-9a-f]+\s*(.*)$/i);
        const branch = m ? m[1] : '';
        const subject = m ? m[2] : message;
        entries.push({
          index: i,
          ref,
          message: subject || message,
          branch,
          hash,
          date,
        });
      }
      return { ok: true, data: entries };
    } catch (e) {
      return this.fail(e);
    }
  }

  /**
   * v0.4+ 显示某个 stash 的 diff（不应用）
   */
  async stashShow(ref: string): Promise<Result<FileDiff[]>> {
    try {
      const out = await this.git.raw(['stash', 'show', '-p', '--no-color', ref]);
      return { ok: true, data: parseUnifiedDiff(out) };
    } catch (e) {
      return this.fail(e);
    }
  }

  /**
   * v0.4+ 应用指定 stash（保留在队列中）
   */
  async stashApply(ref: string): Promise<Result<void>> {
    try {
      await this.git.stash(['apply', ref]);
      return { ok: true, data: undefined };
    } catch (e) {
      return this.fail(e);
    }
  }

  /**
   * v0.4+ 删除指定 stash（不应用）
   */
  async stashDrop(ref: string): Promise<Result<void>> {
    try {
      await this.git.stash(['drop', ref]);
      return { ok: true, data: undefined };
    } catch (e) {
      return this.fail(e);
    }
  }

  async reset(target: string, mode: 'soft' | 'mixed' | 'hard' = 'mixed'): Promise<Result<void>> {
    try {
      await this.git.reset([`--${mode}`, target]);
      return { ok: true, data: undefined };
    } catch (e) {
      return this.fail(e);
    }
  }

  /**
   * v0.4+ Cherry-pick：把指定 commit 应用到当前分支
   * @param hash 完整或短 SHA
   * @param opts.noCommit 不自动提交（v0.4 暂不暴露 UI）
   * @param opts.mainline 合并提交的 parent index（-m 1）
   */
  async cherryPick(hash: string, opts: { noCommit?: boolean; mainline?: number } = {}): Promise<Result<{ hash?: string }>> {
    try {
      const args: string[] = ['cherry-pick'];
      if (opts.mainline !== undefined) args.push('-m', String(opts.mainline));
      if (opts.noCommit) args.push('--no-commit');
      args.push(hash);
      const out = await this.git.raw(args);
      // 成功：解析 [branch hash] 行
      const m = out.match(/\[([^\s]+)(?: \([^)]+\))? ([0-9a-f]{7,40})\]/i);
      return { ok: true, data: { hash: m ? m[2] : undefined } };
    } catch (e) {
      return this.fail(e);
    }
  }

  /**
   * v0.4+ Revert：回退指定 commit（生成一个新 commit 反向应用）
   */
  async revert(hash: string, opts: { noCommit?: boolean; mainline?: number } = {}): Promise<Result<{ hash?: string }>> {
    try {
      const args: string[] = ['revert'];
      if (opts.mainline !== undefined) args.push('-m', String(opts.mainline));
      if (opts.noCommit) args.push('--no-commit');
      args.push(hash);
      const out = await this.git.raw(args);
      const m = out.match(/\[([^\s]+)(?: \([^)]+\))? ([0-9a-f]{7,40})\]/i);
      return { ok: true, data: { hash: m ? m[2] : undefined } };
    } catch (e) {
      return this.fail(e);
    }
  }

  /**
   * 解决冲突：接受 ours（当前分支）或 theirs（要合并进来的分支）
   */
  async resolveConflict(path: string, side: 'ours' | 'theirs'): Promise<Result<void>> {
    try {
      await this.git.raw(['checkout', `--${side}`, '--', path]);
      await this.git.add(path);
      return { ok: true, data: undefined };
    } catch (e) {
      return this.fail(e);
    }
  }

  /**
   * 读取文件原始内容（含冲突标记）
   */
  async readConflictFile(file: string): Promise<Result<{ ours: string; base: string; theirs: string }>> {
    const safeFile = this.assertInsideRepo(file);
    if (!safeFile.ok) return safeFile;
    try {
      const current = await fs.readFile(safeFile.data, 'utf-8');
      // 解析冲突标记
      const oursMatch = current.match(/<{7}\s*\n([\s\S]*?)\n={7}/);
      const theirsMatch = current.match(/={7}\s*\n([\s\S]*?)\n>{7}/);
      return {
        ok: true,
        data: {
          ours: oursMatch ? oursMatch[1] : '',
          base: '',
          theirs: theirsMatch ? theirsMatch[1] : '',
        },
      };
    } catch (e) {
      return this.fail(e);
    }
  }

  async remoteList(): Promise<Result<RemoteInfo[]>> {
    try {
      const list = await this.git.getRemotes(true);
      const out: RemoteInfo[] = list.map((r) => {
        const url = r.refs.fetch || r.refs.push || '';
        const type: RemoteInfo['type'] =
          url.includes('github.com') ? 'github' : url.includes('gitee.com') ? 'gitee' : 'other';
        return { name: r.name, url, type };
      });
      return { ok: true, data: out };
    } catch (e) {
      return this.fail(e);
    }
  }

  async remoteAdd(name: string, url: string): Promise<Result<void>> {
    try {
      await this.git.addRemote(name, url);
      return { ok: true, data: undefined };
    } catch (e) {
      return this.fail(e);
    }
  }

  async remoteRemove(name: string): Promise<Result<void>> {
    try {
      await this.git.removeRemote(name);
      return { ok: true, data: undefined };
    } catch (e) {
      return this.fail(e);
    }
  }

  /**
   * 修改已存在 remote 的 URL（v0.6+ SSH 推送支持）。
   * 用途：把 origin 从 HTTPS URL 切到 SSH URL（`git@github.com:owner/repo.git`），
   * 之后 push/pull/fetch 自动走 SSH。
   *
   * @param name  remote 名（通常是 'origin'）
   * @param url   新 URL（必须是合法 git remote URL；建议先用 `toSshUrl` / `toHttpsUrl` 转换）
   */
  async setRemoteUrl(name: string, url: string): Promise<Result<{ oldUrl: string; newUrl: string }>> {
    try {
      if (typeof name !== 'string' || !name.trim()) {
        return { ok: false, error: 'remote 名称无效' };
      }
      if (typeof url !== 'string' || !url.trim()) {
        return { ok: false, error: 'URL 无效' };
      }
      // 读旧 URL
      const list = await this.git.getRemotes(true);
      const existing = list.find((r) => r.name === name);
      if (!existing) {
        return { ok: false, error: `remote '${name}' 不存在` };
      }
      const oldUrl = existing.refs.fetch || existing.refs.push || '';
      if (oldUrl === url) {
        return { ok: true, data: { oldUrl, newUrl: url } };
      }
      await this.git.remote(['set-url', name, url]);
      // 失效缓存：URL 改了，simple-git 实例对 remote 的引用也得刷新
      // （simple-git 内部没有缓存，但保险起见清掉）
      return { ok: true, data: { oldUrl, newUrl: url } };
    } catch (e) {
      return this.fail(e);
    }
  }

  async currentBranch(): Promise<Result<string>> {
    try {
      const r = await this.git.raw(['rev-parse', '--abbrev-ref', 'HEAD']);
      return { ok: true, data: r.trim() };
    } catch (e) {
      return this.fail(e);
    }
  }

  async diff(opts: { staged?: boolean; from?: string; to?: string } = {}): Promise<Result<FileDiff[]>> {
    try {
      const args: string[] = ['diff', '--no-color'];
      if (opts.staged) args.push('--staged');
      if (opts.from && opts.to) args.push(opts.from, opts.to);
      const raw = await this.git.raw(args);
      return { ok: true, data: parseUnifiedDiff(raw) };
    } catch (e) {
      return this.fail(e);
    }
  }

  async diffFile(file: string, opts: { staged?: boolean } = {}): Promise<Result<FileDiff | null>> {
    const safe = this.assertInsideRepo(file);
    if (!safe.ok) return safe;
    const all = await this.diff(opts);
    if (!all.ok) return all;
    return { ok: true, data: all.data.find((d) => d.path === file || d.oldPath === file) || null };
  }

  /**
   * v0.5+ 列出仓库所有工作区文件（tracked + untracked，已排除 .gitignore）
   * 用于 Ctrl+P 跳转文件搜索
   * @param opts.maxCount 上限（默认 5000），防止大仓库卡死
   * @param opts.staged 可选附带当前暂存状态（额外调一次 status() 拼装）
   */
  async listFiles(opts: { maxCount?: number; withStatus?: boolean } = {}): Promise<Result<GitFile[]>> {
    const max = opts.maxCount ?? 5000;
    try {
      // --cached: tracked；--others: untracked；--exclude-standard: 应用 .gitignore
      // -c: cached only（不重复 untracked）；-o: others only（用两个调用合并去重）
      // --full-name: 相对仓库根，不用 a/ b/ 前缀
      const out = await this.git.raw([
        'ls-files',
        '--cached', '--others', '--exclude-standard',
        '-z',           // NUL 分隔避免文件名含空格
        '--full-name',
      ]);
      const paths = out.split('\0').filter(Boolean);
      // 截断 + 去重（理论上不会重复但保险）
      const unique = Array.from(new Set(paths)).slice(0, max);

      // 附带暂存状态
      if (opts.withStatus) {
        const st = await this.status();
        const statusMap = new Map<string, FileStatus['status']>();
        if (st.ok) {
          for (const f of st.data) {
            // 同一文件可能两条（暂存 + 未暂存），优先取更严重的
            const cur = statusMap.get(f.path);
            const order: Record<FileStatus['status'], number> = {
              conflicted: 5, deleted: 4, modified: 3, renamed: 3, added: 2, untracked: 1,
            };
            if (!cur || order[f.status] > order[cur]) statusMap.set(f.path, f.status);
          }
        }
        return { ok: true, data: unique.map((p) => ({ path: p, status: statusMap.get(p) })) };
      }
      return { ok: true, data: unique.map((p) => ({ path: p })) };
    } catch (e) {
      return this.fail(e);
    }
  }

  /**
   * v0.5+ 解析 git blame --line-porcelain 输出为 BlameLine[]
   * 输出格式：每行 3 段（被换行符分隔）
   *   <sha> <原始行号> <最终行号>
   *   author <name>
   *   author-mail <<email>>
   *   author-time <unix-timestamp>
   *   author-tz <tz>
   *   summary <message 第一行>
   *   [filename <file>]
   *   <上一行继续>
   *   <空行>
   */
  async blame(file: string): Promise<Result<BlameLine[]>> {
    const safe = this.assertInsideRepo(file);
    if (!safe.ok) return safe;
    try {
      // 切到仓库根目录运行 blame（file 相对路径）
      const out = await this.git.raw(['blame', '--line-porcelain', '--', file]);
      const lines = out.split('\n');
      const result: BlameLine[] = [];
      let current: Partial<BlameLine> = {};
      let pendingLine = 0;
      for (const raw of lines) {
        // 头部行：<sha> <orig> <final>
        const headerMatch = raw.match(/^([0-9a-f]{7,40})\s+\d+\s+(\d+)/);
        if (headerMatch) {
          // 上一个块未完成，先 push
          if (current.line && current.hash) {
            result.push({
              line: current.line,
              hash: current.hash,
              author: current.author || '',
              email: current.email || '',
              date: current.date || '',
              message: current.message || '',
            });
          }
          current = { hash: headerMatch[1], line: parseInt(headerMatch[2], 10) };
          pendingLine = parseInt(headerMatch[2], 10);
          continue;
        }
        if (raw.startsWith('author ')) current.author = raw.slice('author '.length).trim();
        else if (raw.startsWith('author-mail ')) current.email = raw.slice('author-mail '.length).replace(/^<|>$/g, '');
        else if (raw.startsWith('author-time ')) {
          const ts = parseInt(raw.slice('author-time '.length).trim(), 10);
          if (!isNaN(ts)) current.date = new Date(ts * 1000).toISOString();
        } else if (raw.startsWith('summary ')) current.message = raw.slice('summary '.length).trim();
        else if (raw === '' && current.line && current.hash) {
          // 块结束：author-time/summary 可能因为边界行缺失，但 line 必有
          if (!current.date) current.date = '';
          if (!current.author) current.author = '';
          if (!current.email) current.email = '';
          if (!current.message) current.message = '';
          result.push({
            line: current.line,
            hash: current.hash,
            author: current.author,
            email: current.email,
            date: current.date,
            message: current.message,
          });
          current = {};
        }
        // 其他字段（committer / previous / boundary 等）忽略
      }
      // 收尾：最后一个块可能没遇到空行
      if (current.line && current.hash) {
        result.push({
          line: current.line,
          hash: current.hash,
          author: current.author || '',
          email: current.email || '',
          date: current.date || '',
          message: current.message || '',
        });
      }
      return { ok: true, data: result };
    } catch (e) {
      return this.fail(e);
    }
  }

  /**
   * v0.5+ 列出文件历史（用 --follow 跟踪重命名）
   * 返回 CommitInfo[]，按时间倒序
   */
  async fileLog(file: string, opts: { maxCount?: number; follow?: boolean } = {}): Promise<Result<CommitInfo[]>> {
    const safe = this.assertInsideRepo(file);
    if (!safe.ok) return safe;
    const maxCount = opts.maxCount ?? 50;
    const follow = opts.follow ?? true;
    try {
      const args = ['log', `--max-count=${maxCount}`, '--format=%H|%h|%an|%ae|%cI|%s'];
      if (follow) args.push('--follow');
      args.push('--', file);
      const out = await this.git.raw(args);
      if (!out.trim()) return { ok: true, data: [] };
      const lines = out.split('\n').filter(Boolean);
      const result: CommitInfo[] = lines.map((line) => {
        const [hash, shortHash, author, email, date, ...msgParts] = line.split('|');
        return {
          hash,
          shortHash,
          author,
          email,
          date,
          message: msgParts.join('|'),
          refs: [],
        };
      });
      return { ok: true, data: result };
    } catch (e) {
      return this.fail(e);
    }
  }

  /**
   * v0.5+ 获取文件两个版本之间的 diff
   * 用于 FileHistoryPanel「点击某次 commit 看 diff」
   * @param fromHash 较早的 commit（不含），undefined 表示与 HEAD 对比
   * @param toHash 较新的 commit（含），undefined 表示工作区
   */
  async fileDiff(
    file: string,
    opts: { fromHash?: string; toHash?: string } = {}
  ): Promise<Result<FileDiff | null>> {
    const safe = this.assertInsideRepo(file);
    if (!safe.ok) return safe;
    try {
      const args: string[] = ['diff', '--no-color'];
      if (opts.fromHash) args.push(`${opts.fromHash}^`);
      if (opts.toHash) args.push(opts.toHash);
      else if (opts.fromHash) args.push(opts.fromHash);
      args.push('--', file);
      const out = await this.git.raw(args);
      const all = parseUnifiedDiff(out);
      return { ok: true, data: all.find((d) => d.path === file || d.oldPath === file) || null };
    } catch (e) {
      return this.fail(e);
    }
  }
}

/**
 * 解析 unified diff 文本为 FileDiff 结构
 */
export function parseUnifiedDiff(text: string): FileDiff[] {
  if (!text.trim()) return [];
  const files: FileDiff[] = [];
  const lines = text.split(/\r?\n/);
  let i = 0;
  let current: FileDiff | null = null;

  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('diff --git ')) {
      // diff --git a/path b/path
      const m = line.match(/^diff --git a\/(.+) b\/(.+)$/);
      if (current) files.push(current);
      current = {
        path: m ? m[2] : '',
        oldPath: m && m[1] !== m[2] ? m[1] : undefined,
        isBinary: false,
        hunks: [],
      };
      i++;
      // 跳过分隔行直到遇到 @@
      while (i < lines.length && !lines[i].startsWith('@@') && !lines[i].startsWith('diff --git ')) {
        if (lines[i].startsWith('Binary files') || lines[i].startsWith('GIT binary patch')) {
          if (current) current.isBinary = true;
        }
        i++;
      }
      continue;
    }
    if (line.startsWith('@@') && current) {
      const m = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (m) {
        const hunk: DiffHunk = {
          oldStart: parseInt(m[1], 10),
          oldLines: m[2] ? parseInt(m[2], 10) : 1,
          newStart: parseInt(m[3], 10),
          newLines: m[4] ? parseInt(m[4], 10) : 1,
          lines: [],
        };
        i++;
        let oldLine = hunk.oldStart;
        let newLine = hunk.newStart;
        while (i < lines.length) {
          const l = lines[i];
          if (l.startsWith('diff --git ') || l.startsWith('@@') || l.startsWith('--- ') || l.startsWith('+++ ')) break;
          if (l.startsWith('+')) {
            hunk.lines.push({ type: 'add', content: l.slice(1), newLine: newLine++ });
          } else if (l.startsWith('-')) {
            hunk.lines.push({ type: 'del', content: l.slice(1), oldLine: oldLine++ });
          } else if (l.startsWith(' ')) {
            hunk.lines.push({ type: 'context', content: l.slice(1), oldLine: oldLine++, newLine: newLine++ });
          } else if (l === '\\ No newline at end of file') {
            // ignore
          }
          i++;
        }
        current.hunks.push(hunk);
        continue;
      }
    }
    i++;
  }
  if (current) files.push(current);
  return files;
}
