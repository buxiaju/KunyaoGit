import { ipcMain } from 'electron';
import { Octokit } from '@octokit/rest';
import axios from 'axios';
import { IPC } from '../../shared/ipc-channels';
import { getSettings } from '../services/settings';
import { GitService } from '../services/git';
import { generateChangelog } from '../services/changelog';
import type { ReleaseInfo, ReleaseAsset, Result } from '../../shared/types';

function getOctokit(): Octokit | null {
  const token = getSettings().auth?.github?.token;
  if (!token) return null;
  return new Octokit({ auth: token, userAgent: 'GitGUI/0.1' });
}

function getGiteeClient() {
  const token = getSettings().auth?.gitee?.token;
  if (!token) return null;
  return axios.create({
    baseURL: 'https://gitee.com/api/v5',
    params: { access_token: token },
    timeout: 20000,
    headers: { 'User-Agent': 'GitGUI/0.1' },
  });
}

function parseRemoteUrl(url?: string): { owner: string; repo: string; platform: 'github' | 'gitee' } | null {
  if (!url) return null;
  const m = url.match(/[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (!m) return null;
  const platform: 'github' | 'gitee' = url.includes('github.com') ? 'github' : 'gitee';
  return { owner: m[1], repo: m[2], platform };
}

interface Parsed {
  owner: string;
  repo: string;
  platform: 'github' | 'gitee';
}

async function resolveRemote(repoPath: string, hintPlatform?: 'github' | 'gitee'): Promise<Result<Parsed>> {
  const git = new GitService(repoPath);
  const remotes = await git.remoteList();
  if (!remotes.ok || remotes.data.length === 0) return { ok: false, error: '无远程仓库' };
  for (const r of remotes.data) {
    const parsed = parseRemoteUrl(r.url);
    if (!parsed) continue;
    if (!hintPlatform || parsed.platform === hintPlatform) return { ok: true, data: parsed };
  }
  const fallback = parseRemoteUrl(remotes.data[0].url);
  if (fallback) return { ok: true, data: fallback };
  return { ok: false, error: '无法解析远程地址' };
}

// ===== GitHub =====
async function ghList(oct: Octokit, p: Parsed): Promise<Result<ReleaseInfo[]>> {
  try {
    const r = await oct.repos.listReleases({ owner: p.owner, repo: p.repo, per_page: 50 });
    return { ok: true, data: r.data.map(toRelease) };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}
async function ghCreate(oct: Octokit, p: Parsed, params: { tag: string; name: string; body: string; draft?: boolean; prerelease?: boolean }): Promise<Result<ReleaseInfo>> {
  try {
    const r = await oct.repos.createRelease({
      owner: p.owner, repo: p.repo,
      tag_name: params.tag, name: params.name, body: params.body,
      draft: params.draft, prerelease: params.prerelease,
    });
    return { ok: true, data: toRelease(r.data) };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}
async function ghDelete(oct: Octokit, p: Parsed, tag: string): Promise<Result<void>> {
  try {
    const list = await oct.repos.listReleases({ owner: p.owner, repo: p.repo });
    const target = list.data.find((x) => x.tag_name === tag);
    if (!target) return { ok: false, error: '未找到对应 Release' };
    await oct.repos.deleteRelease({ owner: p.owner, repo: p.repo, release_id: target.id });
    return { ok: true, data: undefined };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}
async function ghGet(oct: Octokit, p: Parsed, tag: string): Promise<Result<ReleaseInfo>> {
  try {
    const r = await oct.repos.getReleaseByTag({ owner: p.owner, repo: p.repo, tag });
    return { ok: true, data: toRelease(r.data) };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}
async function ghPublish(oct: Octokit, p: Parsed, tag: string): Promise<Result<void>> {
  try {
    const list = await oct.repos.listReleases({ owner: p.owner, repo: p.repo });
    const target = list.data.find((x) => x.tag_name === tag);
    if (!target) return { ok: false, error: '未找到对应 Release' };
    await oct.repos.updateRelease({ owner: p.owner, repo: p.repo, release_id: target.id, draft: false });
    return { ok: true, data: undefined };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}
function toRelease(r: any): ReleaseInfo {
  return {
    tag: r.tag_name,
    name: r.name || r.tag_name,
    body: r.body || '',
    draft: r.draft,
    prerelease: r.prerelease,
    createdAt: r.created_at,
    publishedAt: r.published_at || undefined,
    assets: (r.assets || []).map((a: any): ReleaseAsset => ({
      name: a.name,
      size: a.size,
      downloadCount: a.download_count,
      downloadUrl: a.browser_download_url,
    })),
    platform: 'github',
  };
}

// ===== Gitee =====
async function gtList(client: any, p: Parsed): Promise<Result<ReleaseInfo[]>> {
  try {
    const r = await client.get(`/repos/${p.owner}/${p.repo}/releases`, { params: { per_page: 50 } });
    return { ok: true, data: (r.data as any[]).map(toGtRelease) };
  } catch (e: any) {
    return { ok: false, error: e.response?.data?.message || e.message };
  }
}
async function gtCreate(client: any, p: Parsed, params: { tag: string; name: string; body: string; draft?: boolean; prerelease?: boolean }): Promise<Result<ReleaseInfo>> {
  try {
    const r = await client.post(`/repos/${p.owner}/${p.repo}/releases`, {
      tag_name: params.tag,
      name: params.name,
      body: params.body,
      prerelease_flag: params.prerelease || false,
      target_commitish: 'master',
    });
    return { ok: true, data: toGtRelease(r.data) };
  } catch (e: any) {
    return { ok: false, error: e.response?.data?.message || e.message };
  }
}
async function gtDelete(client: any, p: Parsed, tag: string): Promise<Result<void>> {
  try {
    const list = await client.get(`/repos/${p.owner}/${p.repo}/releases`);
    const target = (list.data as any[]).find((x: any) => x.tag_name === tag);
    if (!target) return { ok: false, error: '未找到对应 Release' };
    await client.delete(`/repos/${p.owner}/${p.repo}/releases/${target.id}`);
    return { ok: true, data: undefined };
  } catch (e: any) {
    return { ok: false, error: e.response?.data?.message || e.message };
  }
}
async function gtGet(client: any, p: Parsed, tag: string): Promise<Result<ReleaseInfo>> {
  try {
    const list = await client.get(`/repos/${p.owner}/${p.repo}/releases`);
    const target = (list.data as any[]).find((x: any) => x.tag_name === tag);
    if (!target) return { ok: false, error: '未找到对应 Release' };
    return { ok: true, data: toGtRelease(target) };
  } catch (e: any) {
    return { ok: false, error: e.response?.data?.message || e.message };
  }
}
async function gtPublish(client: any, p: Parsed, tag: string): Promise<Result<void>> {
  // Gitee 没有 draft 概念，创建即发布；要"发布"草稿需 PATCH（这里简化为 no-op）
  return { ok: true, data: undefined };
}
function toGtRelease(r: any): ReleaseInfo {
  return {
    tag: r.tag_name,
    name: r.name || r.tag_name,
    body: r.body || '',
    draft: false,
    prerelease: !!r.prerelease_flag,
    createdAt: r.created_at,
    publishedAt: r.published_at || r.created_at,
    assets: (r.assets || []).map((a: any): ReleaseAsset => ({
      name: a.name,
      size: a.size,
      downloadCount: a.download_count,
      downloadUrl: a.browser_download_url,
    })),
    platform: 'gitee',
  };
}

export function registerReleaseHandlers() {
  ipcMain.handle(IPC.RELEASE_LIST, async (_e, params: { repoPath: string; platform?: 'github' | 'gitee' }): Promise<Result<ReleaseInfo[]>> => {
    const parsed = await resolveRemote(params.repoPath, params.platform);
    if (!parsed.ok) return parsed;
    if (parsed.data.platform === 'github') {
      const oct = getOctokit();
      if (!oct) return { ok: false, error: '未配置 GitHub Token' };
      return ghList(oct, parsed.data);
    } else {
      const client = getGiteeClient();
      if (!client) return { ok: false, error: '未配置 Gitee Token' };
      return gtList(client, parsed.data);
    }
  });

  ipcMain.handle(IPC.RELEASE_CREATE, async (_e, params: { repoPath: string; tag: string; name: string; body: string; draft?: boolean; prerelease?: boolean; platform?: 'github' | 'gitee' }): Promise<Result<ReleaseInfo>> => {
    const parsed = await resolveRemote(params.repoPath, params.platform);
    if (!parsed.ok) return parsed;
    if (parsed.data.platform === 'github') {
      const oct = getOctokit();
      if (!oct) return { ok: false, error: '未配置 GitHub Token' };
      return ghCreate(oct, parsed.data, params);
    } else {
      const client = getGiteeClient();
      if (!client) return { ok: false, error: '未配置 Gitee Token' };
      return gtCreate(client, parsed.data, params);
    }
  });

  ipcMain.handle(IPC.RELEASE_DELETE, async (_e, params: { repoPath: string; tag: string; platform?: 'github' | 'gitee' }): Promise<Result<void>> => {
    const parsed = await resolveRemote(params.repoPath, params.platform);
    if (!parsed.ok) return parsed;
    if (parsed.data.platform === 'github') {
      const oct = getOctokit();
      if (!oct) return { ok: false, error: '未配置 GitHub Token' };
      return ghDelete(oct, parsed.data, params.tag);
    } else {
      const client = getGiteeClient();
      if (!client) return { ok: false, error: '未配置 Gitee Token' };
      return gtDelete(client, parsed.data, params.tag);
    }
  });

  ipcMain.handle(IPC.RELEASE_GET, async (_e, params: { repoPath: string; tag: string; platform?: 'github' | 'gitee' }): Promise<Result<ReleaseInfo>> => {
    const parsed = await resolveRemote(params.repoPath, params.platform);
    if (!parsed.ok) return parsed;
    if (parsed.data.platform === 'github') {
      const oct = getOctokit();
      if (!oct) return { ok: false, error: '未配置 GitHub Token' };
      return ghGet(oct, parsed.data, params.tag);
    } else {
      const client = getGiteeClient();
      if (!client) return { ok: false, error: '未配置 Gitee Token' };
      return gtGet(client, parsed.data, params.tag);
    }
  });

  ipcMain.handle(IPC.RELEASE_PUBLISH, async (_e, params: { repoPath: string; tag: string; platform?: 'github' | 'gitee' }): Promise<Result<void>> => {
    const parsed = await resolveRemote(params.repoPath, params.platform);
    if (!parsed.ok) return parsed;
    if (parsed.data.platform === 'github') {
      const oct = getOctokit();
      if (!oct) return { ok: false, error: '未配置 GitHub Token' };
      return ghPublish(oct, parsed.data, params.tag);
    } else {
      const client = getGiteeClient();
      if (!client) return { ok: false, error: '未配置 Gitee Token' };
      return gtPublish(client, parsed.data, params.tag);
    }
  });

  ipcMain.handle(IPC.CHANGELOG_GENERATE, async (_e, { repoPath, from, to }: { repoPath: string; from?: string; to?: string }): Promise<Result<string>> => {
    const git = new GitService(repoPath);
    const range = from && to ? `${from}..${to}` : undefined;
    const log = await git.log({ maxCount: 500, ...(range ? { from: range } : {}) });
    if (!log.ok) return log;
    return { ok: true, data: generateChangelog(log.data) };
  });
}
