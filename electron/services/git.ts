import simpleGit, { SimpleGit, StatusResult, BranchSummary, LogResult, DefaultLogFields } from 'simple-git';
import path from 'node:path';
import fs from 'node:fs/promises';

function pathJoin(...parts: string[]): string {
  return parts.join('/').replace(/\\/g, '/');
}
import type {
  CommitInfo,
  BranchInfo,
  FileStatus,
  FileDiff,
  DiffHunk,
  DiffLine,
  Result,
  RemoteInfo,
} from '../../shared/types';

export class GitService {
  private git: SimpleGit;

  constructor(private repoPath: string, gitBinPath?: string) {
    this.git = simpleGit({
      baseDir: repoPath,
      binary: gitBinPath || 'git',
      maxConcurrentProcesses: 4,
    });
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

      for (const f of s.staged) files.push({ path: f, status: 'added', staged: true });
      for (const f of s.created) files.push({ path: f, status: 'added', staged: true });
      for (const f of s.modified) files.push({ path: f, status: 'modified', staged: true });
      for (const f of s.deleted) files.push({ path: f, status: 'deleted', staged: true });
      for (const r of s.renamed) {
        files.push({ path: r.to, oldPath: r.from, status: 'renamed', staged: true });
      }
      for (const f of s.not_added) files.push({ path: f, status: 'untracked', staged: false });
      for (const f of s.conflicted) files.push({ path: f, status: 'conflicted', staged: false });

      return { ok: true, data: files };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
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
      return { ok: false, error: (e as Error).message };
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
      return { ok: false, error: (e as Error).message };
    }
  }

  async stage(paths: string[]): Promise<Result<void>> {
    try {
      await this.git.add(paths);
      return { ok: true, data: undefined };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  async unstage(paths: string[]): Promise<Result<void>> {
    try {
      await this.git.reset(['HEAD', '--', ...paths]);
      return { ok: true, data: undefined };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  async discard(paths: string[]): Promise<Result<void>> {
    try {
      await this.git.checkout(['--', ...paths]);
      return { ok: true, data: undefined };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  async commit(message: string, opts: { amend?: boolean; signOff?: boolean } = {}): Promise<Result<{ hash: string }>> {
    try {
      const args: string[] = [];
      if (opts.signOff) args.push('--signoff');
      if (opts.amend) args.push('--amend');
      args.push('-m', message);
      const result = await this.git.commit(args);
      return { ok: true, data: { hash: result.commit } };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
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
      return { ok: false, error: (e as Error).message };
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
      return { ok: false, error: (e as Error).message };
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
      return { ok: false, error: (e as Error).message };
    }
  }

  async checkout(target: string, opts: { create?: boolean } = {}): Promise<Result<void>> {
    try {
      const args: string[] = ['checkout'];
      if (opts.create) args.push('-b');
      args.push(target);
      await this.git.checkout(args);
      return { ok: true, data: undefined };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  async createBranch(name: string, from?: string): Promise<Result<void>> {
    try {
      const args: string[] = ['checkout', '-b', name];
      if (from) args.push(from);
      await this.git.checkout(args);
      return { ok: true, data: undefined };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  async deleteBranch(name: string, force = false): Promise<Result<void>> {
    try {
      await this.git.deleteLocalBranch(name, force);
      return { ok: true, data: undefined };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
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
      return { ok: false, error: (e as Error).message };
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
      return { ok: false, error: (e as Error).message };
    }
  }

  async stashPop(): Promise<Result<void>> {
    try {
      await this.git.stash(['pop']);
      return { ok: true, data: undefined };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  async reset(target: string, mode: 'soft' | 'mixed' | 'hard' = 'mixed'): Promise<Result<void>> {
    try {
      await this.git.reset([`--${mode}`, target]);
      return { ok: true, data: undefined };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
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
      return { ok: false, error: (e as Error).message };
    }
  }

  /**
   * 读取文件原始内容（含冲突标记）
   */
  async readConflictFile(path: string): Promise<Result<{ ours: string; base: string; theirs: string }>> {
    try {
      const full = pathJoin(this.repoPath, path);
      const current = await require('node:fs/promises').readFile(full, 'utf-8');
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
      return { ok: false, error: (e as Error).message };
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
      return { ok: false, error: (e as Error).message };
    }
  }

  async remoteAdd(name: string, url: string): Promise<Result<void>> {
    try {
      await this.git.addRemote(name, url);
      return { ok: true, data: undefined };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  async remoteRemove(name: string): Promise<Result<void>> {
    try {
      await this.git.removeRemote(name);
      return { ok: true, data: undefined };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  async currentBranch(): Promise<Result<string>> {
    try {
      const r = await this.git.raw(['rev-parse', '--abbrev-ref', 'HEAD']);
      return { ok: true, data: r.trim() };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
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
      return { ok: false, error: (e as Error).message };
    }
  }

  async diffFile(file: string, opts: { staged?: boolean } = {}): Promise<Result<FileDiff | null>> {
    const all = await this.diff(opts);
    if (!all.ok) return all;
    return { ok: true, data: all.data.find((d) => d.path === file || d.oldPath === file) || null };
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
