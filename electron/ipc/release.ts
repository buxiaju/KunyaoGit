import { ipcMain } from 'electron';
import { Octokit } from '@octokit/rest';
import axios from 'axios';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import FormData from 'form-data';
import { IPC } from '../../shared/ipc-channels';
import { getSettings } from '../services/settings';
import { GitService } from '../services/git';
import { generateChangelog } from '../services/changelog';
import { parseRemoteUrl, type ParsedRemote } from '../lib/parseRemote';
import type { ReleaseInfo, ReleaseAsset, ReleaseUpdateParams, Result } from '../../shared/types';

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
    timeout: 60000, // 上传/下载需要更长时间
    headers: { 'User-Agent': 'GitGUI/0.1' },
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });
}

// 仅当 platform 是 github / gitee 时返回；避免 release 上传走到 other
type SupportedPlatform = 'github' | 'gitee';
function isSupported(p: ParsedRemote | null): p is ParsedRemote & { platform: SupportedPlatform } {
  return !!p && (p.platform === 'github' || p.platform === 'gitee');
}

interface Parsed {
  owner: string;
  repo: string;
  platform: SupportedPlatform;
}

async function resolveRemote(repoPath: string, hintPlatform?: 'github' | 'gitee'): Promise<Result<Parsed>> {
  const git = new GitService(repoPath);
  const remotes = await git.remoteList();
  if (!remotes.ok || remotes.data.length === 0) return { ok: false, error: '无远程仓库' };
  for (const r of remotes.data) {
    const parsed = parseRemoteUrl(r.url);
    if (!parsed) continue;
    if (!hintPlatform || parsed.platform === hintPlatform) {
      if (isSupported(parsed)) return { ok: true, data: { owner: parsed.owner, repo: parsed.repo, platform: parsed.platform } };
    }
  }
  const fallback = parseRemoteUrl(remotes.data[0].url);
  if (isSupported(fallback)) return { ok: true, data: { owner: fallback.owner, repo: fallback.repo, platform: fallback.platform } };
  return { ok: false, error: '没有 GitHub / Gitee 远程仓库' };
}

async function getReleaseId(oct: Octokit, p: Parsed, tag: string): Promise<Result<number>> {
  try {
    const list = await oct.repos.listReleases({ owner: p.owner, repo: p.repo });
    const target = list.data.find((x) => x.tag_name === tag);
    if (!target) return { ok: false, error: '未找到对应 Release' };
    return { ok: true, data: target.id };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

async function getGiteeReleaseId(client: any, p: Parsed, tag: string): Promise<Result<number>> {
  try {
    const list = await client.get(`/repos/${p.owner}/${p.repo}/releases`);
    const target = (list.data as any[]).find((x: any) => x.tag_name === tag);
    if (!target) return { ok: false, error: '未找到对应 Release' };
    return { ok: true, data: target.id };
  } catch (e: any) {
    return { ok: false, error: e.response?.data?.message || e.message };
  }
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
    const r = await getReleaseId(oct, p, tag);
    if (!r.ok) return r;
    await oct.repos.deleteRelease({ owner: p.owner, repo: p.repo, release_id: r.data });
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
    const r = await getReleaseId(oct, p, tag);
    if (!r.ok) return r;
    await oct.repos.updateRelease({ owner: p.owner, repo: p.repo, release_id: r.data, draft: false });
    return { ok: true, data: undefined };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

async function ghUploadAsset(oct: Octokit, p: Parsed, tag: string, filePath: string, label?: string): Promise<Result<ReleaseAsset>> {
  try {
    const idR = await getReleaseId(oct, p, tag);
    if (!idR.ok) return idR;
    const buf = await fs.readFile(filePath);
    const name = label || path.basename(filePath);
    const r: any = await oct.repos.uploadReleaseAsset({
      owner: p.owner, repo: p.repo, release_id: idR.data,
      name, data: buf as any,
    });
    return {
      ok: true,
      data: {
        id: r.data.id,
        name: r.data.name,
        size: r.data.size,
        downloadCount: r.data.download_count ?? 0,
        downloadUrl: r.data.browser_download_url,
        state: r.data.state,
        contentType: r.data.content_type,
        uploadedAt: r.data.created_at,
        htmlUrl: r.data.html_url,
      },
    };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

async function ghDeleteAsset(oct: Octokit, p: Parsed, tag: string, assetId: number): Promise<Result<void>> {
  try {
    const idR = await getReleaseId(oct, p, tag);
    if (!idR.ok) return idR;
    await oct.repos.deleteReleaseAsset({ owner: p.owner, repo: p.repo, asset_id: assetId });
    return { ok: true, data: undefined };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

async function ghUpdate(oct: Octokit, p: Parsed, tag: string, params: ReleaseUpdateParams): Promise<Result<ReleaseInfo>> {
  try {
    const idR = await getReleaseId(oct, p, tag);
    if (!idR.ok) return idR;
    const r: any = await oct.repos.updateRelease({
      owner: p.owner, repo: p.repo, release_id: idR.data,
      ...(params.name !== undefined ? { name: params.name } : {}),
      ...(params.body !== undefined ? { body: params.body } : {}),
      ...(params.prerelease !== undefined ? { prerelease: params.prerelease } : {}),
      ...(params.draft !== undefined ? { draft: params.draft } : {}),
    });
    return { ok: true, data: toRelease(r.data) };
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
      id: a.id,
      name: a.name,
      size: a.size,
      downloadCount: a.download_count,
      downloadUrl: a.browser_download_url,
      state: a.state,
      contentType: a.content_type,
      uploadedAt: a.created_at,
      htmlUrl: a.html_url,
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
    const idR = await getGiteeReleaseId(client, p, tag);
    if (!idR.ok) return idR;
    await client.delete(`/repos/${p.owner}/${p.repo}/releases/${idR.data}`);
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
async function gtPublish(_client: any, _p: Parsed, _tag: string): Promise<Result<void>> {
  // Gitee 没有 draft 概念，创建即发布
  return { ok: true, data: undefined };
}

async function gtUploadAsset(client: any, p: Parsed, tag: string, filePath: string, label?: string): Promise<Result<ReleaseAsset>> {
  try {
    const idR = await getGiteeReleaseId(client, p, tag);
    if (!idR.ok) return idR;
    const buf = await fs.readFile(filePath);
    const form = new FormData();
    form.append('file', buf, { filename: label || path.basename(filePath) });
    const r: any = await client.post(
      `/repos/${p.owner}/${p.repo}/releases/${idR.data}/attach_files`,
      form,
      { headers: form.getHeaders(), maxBodyLength: Infinity, maxContentLength: Infinity }
    );
    const a = r.data;
    return {
      ok: true,
      data: {
        id: typeof a.id === 'string' ? parseInt(a.id, 10) : a.id,
        name: a.name,
        size: typeof a.size === 'string' ? parseInt(a.size, 10) : a.size,
        downloadCount: a.download_count ?? 0,
        downloadUrl: a.browser_download_url || a.url,
        contentType: a.content_type,
        uploadedAt: a.created_at,
      },
    };
  } catch (e: any) {
    return { ok: false, error: e.response?.data?.message || e.message };
  }
}

async function gtDeleteAsset(client: any, p: Parsed, tag: string, assetId: number): Promise<Result<void>> {
  try {
    const idR = await getGiteeReleaseId(client, p, tag);
    if (!idR.ok) return idR;
    await client.delete(`/repos/${p.owner}/${p.repo}/releases/${idR.data}/attach_files/${assetId}`);
    return { ok: true, data: undefined };
  } catch (e: any) {
    return { ok: false, error: e.response?.data?.message || e.message };
  }
}

async function gtUpdate(client: any, p: Parsed, tag: string, params: ReleaseUpdateParams): Promise<Result<ReleaseInfo>> {
  try {
    const idR = await getGiteeReleaseId(client, p, tag);
    if (!idR.ok) return idR;
    const body: Record<string, any> = {};
    if (params.name !== undefined) body.name = params.name;
    if (params.body !== undefined) body.body = params.body;
    if (params.prerelease !== undefined) body.prerelease_flag = params.prerelease;
    // Gitee 不支持 draft 切换
    const r: any = await client.patch(`/repos/${p.owner}/${p.repo}/releases/${idR.data}`, body);
    return { ok: true, data: toGtRelease(r.data) };
  } catch (e: any) {
    return { ok: false, error: e.response?.data?.message || e.message };
  }
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
      id: typeof a.id === 'string' ? parseInt(a.id, 10) : a.id,
      name: a.name,
      size: typeof a.size === 'string' ? parseInt(a.size, 10) : a.size,
      downloadCount: a.download_count,
      downloadUrl: a.browser_download_url,
      contentType: a.content_type,
      uploadedAt: a.created_at,
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

  // v0.6+ 附件上传（GitHub / Gitee）
  ipcMain.handle(IPC.RELEASE_UPLOAD_ASSET, async (_e, params: { repoPath: string; tag: string; filePath: string; label?: string; platform?: 'github' | 'gitee' }): Promise<Result<ReleaseAsset>> => {
    const parsed = await resolveRemote(params.repoPath, params.platform);
    if (!parsed.ok) return parsed;
    if (parsed.data.platform === 'github') {
      const oct = getOctokit();
      if (!oct) return { ok: false, error: '未配置 GitHub Token' };
      return ghUploadAsset(oct, parsed.data, params.tag, params.filePath, params.label);
    } else {
      const client = getGiteeClient();
      if (!client) return { ok: false, error: '未配置 Gitee Token' };
      return gtUploadAsset(client, parsed.data, params.tag, params.filePath, params.label);
    }
  });

  // v0.6+ 附件删除
  ipcMain.handle(IPC.RELEASE_DELETE_ASSET, async (_e, params: { repoPath: string; tag: string; assetId: number; platform?: 'github' | 'gitee' }): Promise<Result<void>> => {
    const parsed = await resolveRemote(params.repoPath, params.platform);
    if (!parsed.ok) return parsed;
    if (parsed.data.platform === 'github') {
      const oct = getOctokit();
      if (!oct) return { ok: false, error: '未配置 GitHub Token' };
      return ghDeleteAsset(oct, parsed.data, params.tag, params.assetId);
    } else {
      const client = getGiteeClient();
      if (!client) return { ok: false, error: '未配置 Gitee Token' };
      return gtDeleteAsset(client, parsed.data, params.tag, params.assetId);
    }
  });

  // v0.6+ 编辑 release
  ipcMain.handle(IPC.RELEASE_UPDATE, async (_e, params: { repoPath: string; tag: string; name?: string; body?: string; prerelease?: boolean; draft?: boolean; platform?: 'github' | 'gitee' }): Promise<Result<ReleaseInfo>> => {
    const parsed = await resolveRemote(params.repoPath, params.platform);
    if (!parsed.ok) return parsed;
    const updateParams: ReleaseUpdateParams = {
      name: params.name,
      body: params.body,
      prerelease: params.prerelease,
      draft: params.draft,
    };
    if (parsed.data.platform === 'github') {
      const oct = getOctokit();
      if (!oct) return { ok: false, error: '未配置 GitHub Token' };
      return ghUpdate(oct, parsed.data, params.tag, updateParams);
    } else {
      const client = getGiteeClient();
      if (!client) return { ok: false, error: '未配置 Gitee Token' };
      return gtUpdate(client, parsed.data, params.tag, updateParams);
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
