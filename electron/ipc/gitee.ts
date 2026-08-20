import { ipcMain } from 'electron';
import axios from 'axios';
import { IPC } from '../../shared/ipc-channels';
import { getSettings } from '../services/settings';
import type { PullRequestInfo, IssueInfo, RemoteFile, RemoteFileContent, Result } from '../../shared/types';

function getClient() {
  const token = getSettings().auth?.gitee?.token;
  if (!token) return null;
  return axios.create({
    baseURL: 'https://gitee.com/api/v5',
    params: { access_token: token },
    timeout: 20000,
    headers: { 'User-Agent': 'GitGUI/0.1' },
  });
}

export function registerGiteeHandlers() {
  ipcMain.handle(IPC.GT_LIST_REPOS, async (_e, params: { visibility?: 'all' | 'public' | 'private'; sort?: string } = {}) => {
    const client = getClient();
    if (!client) return { ok: false, error: '未配置 Gitee Token' };
    try {
      const r = await client.get('/user/repos', {
        params: {
          visibility: params.visibility || 'all',
          sort: params.sort || 'updated',
          per_page: 50,
        },
      });
      return { ok: true, data: r.data };
    } catch (e: any) {
      return { ok: false, error: e.response?.data?.message || e.message };
    }
  });

  // 搜索 Gitee 仓库。
  // Gitee 官方 /search/repositories API 目前对仓库搜索恒返回空数组（已失效），
  // 因此先尝试官方 API，若结果为空则降级为"我的仓库列表本地过滤"（保证功能可用）。
  ipcMain.handle(IPC.GT_SEARCH_REPOS, async (_e, { query }: { query: string; sort?: string }): Promise<Result<any[]>> => {
    const client = getClient();
    if (!client) return { ok: false, error: '未配置 Gitee Token' };
    const q = (query || '').trim();
    if (!q) return { ok: true, data: [] };
    try {
      const r = await client.get('/search/repositories', { params: { q, per_page: 50 } });
      const items: any[] = r.data?.items || r.data || [];
      if (items.length > 0) return { ok: true, data: items };
      // 官方 API 失效 → 降级：拉我的仓库本地过滤
      const my = await client.get('/user/repos', { params: { visibility: 'all', per_page: 100 } });
      const lower = q.toLowerCase();
      const filtered = (my.data || []).filter((repo: any) => {
        const full = String(repo.full_name || repo.name || '').toLowerCase();
        const desc = String(repo.description || '').toLowerCase();
        return full.includes(lower) || desc.includes(lower);
      });
      return { ok: true, data: filtered };
    } catch (e: any) {
      return { ok: false, error: e.response?.data?.message || e.message };
    }
  });

  ipcMain.handle(IPC.GT_CREATE_REPO, async (_e, params: { name: string; description?: string; private?: boolean; autoInit?: boolean; gitignoreTemplate?: string; licenseTemplate?: string; homepage?: string }): Promise<Result<any>> => {
    const client = getClient();
    if (!client) return { ok: false, error: '未配置 Gitee Token' };
    try {
      const body: any = {
        name: params.name,
        description: params.description,
        private: params.private ?? false,
        auto_init: params.autoInit ?? true,
        homepage: params.homepage,
        has_issues: true,
        has_wiki: true,
      };
      if (params.gitignoreTemplate) body.gitignore_template = params.gitignoreTemplate;
      if (params.licenseTemplate) body.license = params.licenseTemplate;
      const r = await client.post('/user/repos', body);
      return { ok: true, data: r.data };
    } catch (e: any) {
      return { ok: false, error: e.response?.data?.message || e.message };
    }
  });

  ipcMain.handle(IPC.GT_DELETE_REPO, async (_e, { owner, repo }: { owner: string; repo: string }): Promise<Result<void>> => {
    const client = getClient();
    if (!client) return { ok: false, error: '未配置 Gitee Token' };
    try {
      await client.delete(`/repos/${owner}/${repo}`);
      return { ok: true, data: undefined };
    } catch (e: any) {
      return { ok: false, error: e.response?.data?.message || e.message };
    }
  });

  ipcMain.handle(IPC.GT_LIST_PRS, async (_e, { owner, repo, state }: { owner: string; repo: string; state?: string }) => {
    const client = getClient();
    if (!client) return { ok: false, error: '未配置 Gitee Token' };
    try {
      const r = await client.get(`/repos/${owner}/${repo}/pulls`, {
        params: { state: state || 'open', per_page: 50 },
      });
      const list: PullRequestInfo[] = r.data.map((p: any) => ({
        number: p.number,
        title: p.title,
        state: p.state === 'merged' ? 'merged' : p.state,
        author: p.user?.login || '',
        createdAt: p.created_at,
        updatedAt: p.updated_at,
        url: p.html_url,
        base: p.base?.ref || '',
        head: p.head?.ref || '',
        platform: 'gitee',
      }));
      return { ok: true, data: list };
    } catch (e: any) {
      return { ok: false, error: e.response?.data?.message || e.message };
    }
  });

  ipcMain.handle(IPC.GT_LIST_ISSUES, async (_e, { owner, repo, state }: { owner: string; repo: string; state?: string }) => {
    const client = getClient();
    if (!client) return { ok: false, error: '未配置 Gitee Token' };
    try {
      const r = await client.get(`/repos/${owner}/${repo}/issues`, {
        params: { state: state || 'open', per_page: 50 },
      });
      const list: IssueInfo[] = r.data.map((i: any) => ({
        number: i.number,
        title: i.title,
        state: i.state,
        author: i.user?.login || '',
        createdAt: i.created_at,
        url: i.html_url,
        labels: (i.labels || []).map((l: any) => l.name || ''),
        platform: 'gitee',
      }));
      return { ok: true, data: list };
    } catch (e: any) {
      return { ok: false, error: e.response?.data?.message || e.message };
    }
  });

  // Contents API（Gitee v5）
  // 关键：axios 会自动编码 URL path 段，**不要**手动 encodeURIComponent，否则会双重编码
  // 但 axios 不会编码 query；path 为空时用根
  const buildContentsUrl = (owner: string, repo: string, path: string) =>
    `/repos/${owner}/${repo}/contents${path ? '/' + path : ''}`;

  ipcMain.handle(IPC.GT_CONTENTS_LIST, async (_e, { owner, repo, path = '', ref }: { owner: string; repo: string; path?: string; ref?: string }): Promise<Result<RemoteFile[]>> => {
    const client = getClient();
    if (!client) return { ok: false, error: '未配置 Gitee Token' };
    try {
      const r = await client.get(buildContentsUrl(owner, repo, path), {
        params: ref ? { ref } : {},
      });
      const list: RemoteFile[] = (r.data as any[]).map((entry: any) => ({
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
      return { ok: false, error: e.response?.data?.message || e.message };
    }
  });

  ipcMain.handle(IPC.GT_CONTENTS_READ, async (_e, { owner, repo, path, ref }: { owner: string; repo: string; path: string; ref?: string }) => {
    const client = getClient();
    if (!client) return { ok: false, error: '未配置 Gitee Token' };
    const url = buildContentsUrl(owner, repo, path);
    console.log(`[gitee.contentsRead] GET ${url}  path="${path}" ref=${ref || '(none)'}`);
    try {
      const r = await client.get(url, { params: ref ? { ref } : {} });
      const entry: any = r.data;
      console.log(`[gitee.contentsRead] status=${r.status} type=${entry?.type} encoding=${entry?.encoding} contentLen=${entry?.content?.length} size=${entry?.size} path=${entry?.path}`);
      // Gitee 可能返回数组（路径是个目录）或空对象，视为错误
      if (Array.isArray(entry)) {
        return { ok: false, error: '路径是目录不是文件' };
      }
      if (!entry || entry.type !== 'file') {
        return { ok: false, error: `不是文件（type=${entry?.type}）` };
      }
      if (!entry.content) {
        return { ok: false, error: 'API 返回成功但 content 为空（可能文件超过 1MB 或权限不足）' };
      }
      const encoding = entry.encoding || 'base64';
      let content = entry.content || '';
      let isBinary = false;
      if (encoding === 'base64') {
        try {
          const buf = Buffer.from(content.replace(/\n/g, ''), 'base64');
          isBinary = buf.includes(0);
          content = buf.toString('utf-8');
        } catch {
          isBinary = true;
        }
      }
      const out: RemoteFileContent = {
        path: entry.path,
        sha: entry.sha,
        content,
        encoding: 'utf-8',
        size: entry.size,
        isBinary,
      };
      console.log(`[gitee.contentsRead] OK path="${out.path}" contentLen=${out.content.length} isBinary=${out.isBinary}`);
      return { ok: true, data: out };
    } catch (e: any) {
      console.log(`[gitee.contentsRead] ERROR status=${e.response?.status} body=${JSON.stringify(e.response?.data)?.slice(0, 200)}`);
      return { ok: false, error: `HTTP ${e.response?.status || ''} ${e.response?.data?.message || e.message}` };
    }
  });

  ipcMain.handle(IPC.GT_CONTENTS_WRITE, async (_e, { owner, repo, path, content, message, sha, branch }: { owner: string; repo: string; path: string; content: string; message: string; sha?: string; branch?: string }): Promise<Result<{ sha: string }>> => {
    const client = getClient();
    if (!client) return { ok: false, error: '未配置 Gitee Token' };
    try {
      const b64 = Buffer.from(content, 'utf-8').toString('base64');
      const body: any = { content: b64, message, branch: branch || 'master' };
      let r;
      if (sha) {
        // 更新
        body.sha = sha;
        r = await client.put(buildContentsUrl(owner, repo, path), body);
      } else {
        // 新建
        r = await client.post(buildContentsUrl(owner, repo, path), body);
      }
      return { ok: true, data: { sha: r.data?.content?.sha || '' } };
    } catch (e: any) {
      return { ok: false, error: e.response?.data?.message || e.message };
    }
  });

  ipcMain.handle(IPC.GT_CONTENTS_DELETE, async (_e, { owner, repo, path, message, sha, branch }: { owner: string; repo: string; path: string; message: string; sha: string; branch?: string }): Promise<Result<void>> => {
    const client = getClient();
    if (!client) return { ok: false, error: '未配置 Gitee Token' };
    try {
      await client.delete(buildContentsUrl(owner, repo, path), {
        data: { message, sha, branch: branch || 'master' },
      });
      return { ok: true, data: undefined };
    } catch (e: any) {
      return { ok: false, error: e.response?.data?.message || e.message };
    }
  });
}
