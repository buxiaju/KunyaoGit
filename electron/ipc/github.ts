import { ipcMain } from 'electron';
import { Octokit } from '@octokit/rest';
import { IPC } from '../../shared/ipc-channels';
import { getSettings } from '../services/settings';
import type { PullRequestInfo, IssueInfo, RemoteFile, RemoteFileContent, Result } from '../../shared/types';

function getOctokit(): Octokit | null {
  const token = getSettings().auth?.github?.token;
  if (!token) return null;
  return new Octokit({ auth: token, userAgent: 'GitGUI/0.1' });
}

export function registerGithubHandlers() {
  ipcMain.handle(IPC.GH_LIST_REPOS, async (_e, params: { visibility?: 'all' | 'public' | 'private'; sort?: string } = {}) => {
    const oct = getOctokit();
    if (!oct) return { ok: false, error: '未配置 GitHub Token' };
    try {
      const r = await oct.repos.listForAuthenticatedUser({
        visibility: params.visibility as any || 'all',
        sort: (params.sort as any) || 'updated',
        per_page: 50,
      });
      return { ok: true, data: r.data };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

  // 搜索 GitHub 全平台仓库（Search API）
  ipcMain.handle(IPC.GH_SEARCH_REPOS, async (_e, { query, sort, order }: { query: string; sort?: string; order?: 'asc' | 'desc' }): Promise<Result<any[]>> => {
    const oct = getOctokit();
    if (!oct) return { ok: false, error: '未配置 GitHub Token' };
    if (!query || !query.trim()) return { ok: true, data: [] };
    try {
      const r = await oct.search.repos({
        q: query.trim(),
        sort: (sort as any) || 'best_match',
        order: order || 'desc',
        per_page: 50,
      });
      return { ok: true, data: r.data.items as any[] };
    } catch (e: any) {
      return { ok: false, error: e.response?.data?.message || e.message };
    }
  });

  ipcMain.handle(IPC.GH_CREATE_REPO, async (_e, params: { name: string; description?: string; private?: boolean; autoInit?: boolean; gitignoreTemplate?: string; licenseTemplate?: string }): Promise<Result<any>> => {
    const oct = getOctokit();
    if (!oct) return { ok: false, error: '未配置 GitHub Token' };
    try {
      const r = await oct.repos.createForAuthenticatedUser({
        name: params.name,
        description: params.description,
        private: params.private ?? false,
        auto_init: params.autoInit ?? true,
        gitignore_template: params.gitignoreTemplate,
        license_template: params.licenseTemplate,
      });
      return { ok: true, data: r.data };
    } catch (e: any) {
      return { ok: false, error: e.response?.data?.message || e.message };
    }
  });

  ipcMain.handle(IPC.GH_DELETE_REPO, async (_e, { owner, repo }: { owner: string; repo: string }): Promise<Result<void>> => {
    const oct = getOctokit();
    if (!oct) return { ok: false, error: '未配置 GitHub Token' };
    try {
      await oct.repos.delete({ owner, repo });
      return { ok: true, data: undefined };
    } catch (e: any) {
      return { ok: false, error: e.response?.data?.message || e.message };
    }
  });

  ipcMain.handle(IPC.GH_LIST_PRS, async (_e, { owner, repo, state }: { owner: string; repo: string; state?: 'open' | 'closed' | 'all' }) => {
    const oct = getOctokit();
    if (!oct) return { ok: false, error: '未配置 GitHub Token' };
    try {
      const r = await oct.pulls.list({ owner, repo, state: state || 'open', per_page: 50 });
      const list: PullRequestInfo[] = r.data.map((p) => ({
        number: p.number,
        title: p.title,
        state: p.merged_at ? 'merged' : (p.state as any),
        author: p.user?.login || '',
        createdAt: p.created_at,
        updatedAt: p.updated_at,
        url: p.html_url,
        base: p.base.ref,
        head: p.head.ref,
        platform: 'github',
      }));
      return { ok: true, data: list };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

  ipcMain.handle(IPC.GH_LIST_ISSUES, async (_e, { owner, repo, state }: { owner: string; repo: string; state?: string }) => {
    const oct = getOctokit();
    if (!oct) return { ok: false, error: '未配置 GitHub Token' };
    try {
      const r = await oct.issues.listForRepo({ owner, repo, state: (state as any) || 'open', per_page: 50 });
      const list: IssueInfo[] = r.data.map((i) => ({
        number: i.number,
        title: i.title,
        state: i.state as any,
        author: i.user?.login || '',
        createdAt: i.created_at,
        url: i.html_url,
        labels: i.labels.map((l) => (typeof l === 'string' ? l : l.name || '')),
        platform: 'github',
      }));
      return { ok: true, data: list };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

  // Contents API
  ipcMain.handle(IPC.GH_CONTENTS_LIST, async (_e, { owner, repo, path = '' }: { owner: string; repo: string; path?: string }): Promise<Result<RemoteFile[]>> => {
    const oct = getOctokit();
    if (!oct) return { ok: false, error: '未配置 GitHub Token' };
    try {
      const r = await oct.repos.getContent({ owner, repo, path: path || '' });
      if (!Array.isArray(r.data)) return { ok: true, data: [] };
      const list: RemoteFile[] = r.data.map((entry: any) => ({
        name: entry.name,
        path: entry.path,
        type: entry.type === 'dir' ? 'dir' : 'file',
        size: entry.size,
        sha: entry.sha,
        url: entry.url,
        htmlUrl: entry.html_url,
      }));
      return { ok: true, data: list };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle(IPC.GH_CONTENTS_READ, async (_e, { owner, repo, path, ref }: { owner: string; repo: string; path: string; ref?: string }): Promise<Result<RemoteFileContent>> => {
    const oct = getOctokit();
    if (!oct) return { ok: false, error: '未配置 GitHub Token' };
    try {
      const r = await oct.repos.getContent({ owner, repo, path, ...(ref ? { ref } : {}) });
      const entry: any = r.data;
      if (Array.isArray(entry) || entry.type !== 'file') return { ok: false, error: '不是文件' };
      const encoding = entry.encoding || 'base64';
      let content = entry.content || '';
      let isBinary = false;
      if (encoding === 'base64') {
        try {
          // base64 -> text（可能是 UTF-8）
          const buf = Buffer.from(content.replace(/\n/g, ''), 'base64');
          // 简单启发式：包含 NUL 字节视为二进制
          isBinary = buf.includes(0);
          content = buf.toString('utf-8');
        } catch {
          isBinary = true;
        }
      }
      return {
        ok: true,
        data: {
          path: entry.path,
          sha: entry.sha,
          content,
          encoding: 'utf-8',
          size: entry.size,
          isBinary,
        },
      };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle(IPC.GH_CONTENTS_WRITE, async (_e, { owner, repo, path, content, message, sha, branch }: { owner: string; repo: string; path: string; content: string; message: string; sha?: string; branch?: string }): Promise<Result<{ sha: string }>> => {
    const oct = getOctokit();
    if (!oct) return { ok: false, error: '未配置 GitHub Token' };
    try {
      const b64 = Buffer.from(content, 'utf-8').toString('base64');
      const r = await oct.repos.createOrUpdateFileContents({
        owner, repo, path, message, content: b64, branch, sha,
      });
      return { ok: true, data: { sha: r.data.content?.sha || '' } };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle(IPC.GH_CONTENTS_DELETE, async (_e, { owner, repo, path, message, sha, branch }: { owner: string; repo: string; path: string; message: string; sha: string; branch?: string }): Promise<Result<void>> => {
    const oct = getOctokit();
    if (!oct) return { ok: false, error: '未配置 GitHub Token' };
    try {
      await oct.repos.deleteFile({ owner, repo, path, message, sha, branch });
      return { ok: true, data: undefined };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  });
}
