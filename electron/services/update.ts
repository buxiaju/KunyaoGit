// 自动更新检查服务
// 流程：分别请求 GitHub 和 Gitee 的 latest release，比对版本号，
// 取两个平台中较高的（防止一个平台更新了另一个没跟上）。

import { app } from 'electron';
import https from 'node:https';
import { URL } from 'node:url';
import { getSettings } from './settings';

export interface RemoteRelease {
  tag: string;            // 形如 "v0.1.0"
  version: string;        // 去掉 v 前缀后的纯版本号 "0.1.0"
  name: string;
  body: string;           // release notes
  htmlUrl: string;
  publishedAt?: string;
  platform: 'github' | 'gitee';
  assets: { name: string; size: number; downloadUrl: string }[];
}

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latest: RemoteRelease | null;
  sources: { platform: 'github' | 'gitee'; ok: boolean; error?: string; release?: RemoteRelease }[];
}

const GITHUB_REPO = 'buxiaju/KunyaoGit';
const GITEE_REPO  = 'buxiaju/KunyaoGit';

function getJson<T>(u: string, headers: Record<string, string> = {}): Promise<{ status: number; data?: T; text?: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(u);
    const req = https.get(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'GET',
        headers: {
          'User-Agent': 'KunyaoGit-updater',
          'Accept': 'application/json',
          ...headers,
        },
        timeout: 10000,
      },
      (res) => {
        const cs: Buffer[] = [];
        res.on('data', (c) => cs.push(c));
        res.on('end', () => {
          const text = Buffer.concat(cs).toString('utf-8');
          if (res.statusCode !== 200) {
            resolve({ status: res.statusCode || 0, text });
            return;
          }
          try {
            resolve({ status: 200, data: JSON.parse(text) as T });
          } catch (e) {
            resolve({ status: 200, text });
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
  });
}

function parseVersion(tag: string): number[] {
  // 去掉非数字前缀（v, release-, 等），按 . 拆
  const m = tag.replace(/^[^\d]*/, '').split('.');
  const out: number[] = [];
  for (const x of m) {
    const n = parseInt(x.replace(/[^\d].*$/, ''), 10);
    out.push(isNaN(n) ? 0 : n);
  }
  while (out.length < 3) out.push(0);
  return out.slice(0, 3);
}

export function compareVersion(a: string, b: string): number {
  // -1 a<b, 0 =, 1 a>b
  const va = parseVersion(a);
  const vb = parseVersion(b);
  for (let i = 0; i < Math.max(va.length, vb.length); i++) {
    const x = va[i] || 0;
    const y = vb[i] || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

async function fetchGithub(): Promise<{ ok: boolean; release?: RemoteRelease; error?: string }> {
  try {
    const r = await getJson<any>(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`);
    if (r.status !== 200 || !r.data) {
      return { ok: false, error: `GitHub HTTP ${r.status}` };
    }
    const d = r.data;
    const version = String(d.tag_name || '').replace(/^v/i, '');
    const assets = (d.assets || []).map((a: any) => ({
      name: String(a.name || ''),
      size: Number(a.size || 0),
      downloadUrl: String(a.browser_download_url || ''),
    }));
    return {
      ok: true,
      release: {
        tag: d.tag_name,
        version,
        name: d.name || d.tag_name,
        body: d.body || '',
        htmlUrl: d.html_url,
        publishedAt: d.published_at,
        platform: 'github',
        assets,
      },
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function fetchGitee(): Promise<{ ok: boolean; release?: RemoteRelease; error?: string }> {
  try {
    // Gitee API 对匿名请求很多会返回 404，使用用户在 设置 → Gitee 里配的 token（如有）
    const settings = getSettings();
    const giteeToken = settings.auth?.gitee?.token;
    const headers: Record<string, string> = {};
    if (giteeToken) {
      headers['Authorization'] = `token ${giteeToken}`;
    }
    const r = await getJson<any>(`https://gitee.com/api/v5/repos/${GITEE_REPO}/releases/latest`, headers);
    if (r.status !== 200 || !r.data) {
      return { ok: false, error: `Gitee HTTP ${r.status}` };
    }
    const d = r.data;
    const version = String(d.tag_name || '').replace(/^v/i, '');
    // Gitee API 不会在 release 对象里直接列 assets；下载链接走 release 主页
    const htmlUrl = d.html_url || `https://gitee.com/${GITEE_REPO}/releases/${d.tag_name}`;
    const assets = (d.assets || []).map((a: any) => ({
      name: String(a.name || ''),
      size: Number(a.size || 0),
      // Gitee 附件下载：browser_download_url 可能为空，回退到 assets/{id}
      downloadUrl: String(a.browser_download_url || (a.id ? `https://gitee.com/${GITEE_REPO}/releases/download/${d.tag_name}/${encodeURIComponent(a.name || '')}` : '')),
    }));
    return {
      ok: true,
      release: {
        tag: d.tag_name,
        version,
        name: d.name || d.tag_name,
        body: d.body || '',
        htmlUrl,
        publishedAt: d.created_at,
        platform: 'gitee',
        assets,
      },
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion();
  const [gh, gt] = await Promise.all([fetchGithub(), fetchGitee()]);

  const candidates: RemoteRelease[] = [];
  if (gh.ok && gh.release) candidates.push(gh.release);
  if (gt.ok && gt.release) candidates.push(gt.release);

  // 选版本最高的那条
  candidates.sort((a, b) => compareVersion(b.version, a.version));
  const latest = candidates[0] || null;

  const hasUpdate = !!latest && compareVersion(latest.version, currentVersion) > 0;

  return {
    hasUpdate,
    currentVersion,
    latest,
    sources: [
      { platform: 'github', ok: gh.ok, error: gh.error, release: gh.release },
      { platform: 'gitee',  ok: gt.ok, error: gt.error, release: gt.release },
    ],
  };
}
