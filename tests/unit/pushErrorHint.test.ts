// v0.6+ SSH 推送支持：push 失败网络检测 + 一键切换 SSH

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isNetworkError, buildSwitchToSshHint, switchOriginToSsh } from '../../src/lib/pushErrorHint';

const tMock = (key: string, params?: Record<string, any>) => {
  if (key === 'settings.pushFailedNetwork') return `推送失败：网络不可达（${params?.error || ''}）`;
  if (key === 'settings.pushFailedNetworkHint') return '是否切换到 SSH 协议推送？';
  return key;
};

describe('isNetworkError（v0.6+ SSH push hint）', () => {
  it('识别 443 connect timeout', () => {
    expect(
      isNetworkError("fatal: unable to access 'https://github.com/...': Failed to connect to github.com port 443 after 21060 ms: Could not connect to server")
    ).toBe(true);
  });

  it('识别 ssh 22 端口 timeout', () => {
    expect(isNetworkError('ssh: connect to host github.com port 22: Connection timed out')).toBe(true);
  });

  it('识别 DNS 失败', () => {
    expect(isNetworkError('Could not resolve hostname github.com')).toBe(true);
  });

  it('识别 Connection refused', () => {
    expect(isNetworkError('Connection refused')).toBe(true);
  });

  it('识别 "A connection attempt failed" (Windows)', () => {
    expect(isNetworkError('A connection attempt failed because the connected party did not properly respond')).toBe(true);
  });

  it('非网络问题不识别', () => {
    expect(isNetworkError("Permission denied (publickey)")).toBe(false);
    expect(isNetworkError("Repository not found")).toBe(false);
    expect(isNetworkError("nothing to commit, working tree clean")).toBe(false);
    expect(isNetworkError("")).toBe(false);
  });

  it('非字符串输入返回 false', () => {
    expect(isNetworkError(null as any)).toBe(false);
    expect(isNetworkError(undefined as any)).toBe(false);
    expect(isNetworkError(123 as any)).toBe(false);
  });
});

describe('buildSwitchToSshHint', () => {
  it('网络问题 → 返回切换提示', () => {
    const h = buildSwitchToSshHint(
      '/repo/path',
      'origin',
      'Failed to connect to github.com port 443 after 21060 ms',
      tMock
    );
    expect(h).not.toBeNull();
    expect(h?.action).toBe('switchToSsh');
    expect(h?.repoPath).toBe('/repo/path');
    expect(h?.remoteName).toBe('origin');
    expect(h?.title).toContain('推送失败');
  });

  it('非网络问题 → 返回 null', () => {
    const h = buildSwitchToSshHint('/r', 'origin', 'Permission denied', tMock);
    expect(h).toBeNull();
  });

  it('错误文本超过 200 字符时截短', () => {
    const longErr = 'Failed to connect to github.com port 443 after 21060 ms. ' + 'x'.repeat(300);
    const h = buildSwitchToSshHint('/r', 'origin', longErr, tMock);
    expect(h?.errorShort.length).toBeLessThanOrEqual(201);
  });
});

describe('switchOriginToSsh（v0.6+ SSH 推送支持）', () => {
  beforeEach(() => {
    // 重置 mock
    (globalThis as any).window = (globalThis as any).window || {};
  });

  it('HTTPS → SSH 成功', async () => {
    (globalThis as any).window.gitgui = {
      git: {
        remoteList: vi.fn().mockResolvedValue({
          ok: true,
          data: [{ name: 'origin', fetch: 'https://github.com/buxiaju/DouBi.git', push: 'https://github.com/buxiaju/DouBi.git' }],
        }),
        setRemoteUrl: vi.fn().mockResolvedValue({
          ok: true,
          data: { oldUrl: 'https://github.com/buxiaju/DouBi.git', newUrl: 'git@github.com:buxiaju/DouBi.git' },
        }),
      },
    };
    const r = await switchOriginToSsh('/repo', 'origin');
    expect(r.ok).toBe(true);
    expect(r.newUrl).toBe('git@github.com:buxiaju/DouBi.git');
    expect((globalThis as any).window.gitgui.git.setRemoteUrl).toHaveBeenCalledWith(
      '/repo',
      'origin',
      'git@github.com:buxiaju/DouBi.git'
    );
  });

  it('已是 SSH 协议时返回失败', async () => {
    (globalThis as any).window.gitgui = {
      git: {
        remoteList: vi.fn().mockResolvedValue({
          ok: true,
          data: [{ name: 'origin', fetch: 'git@github.com:buxiaju/DouBi.git', push: 'git@github.com:buxiaju/DouBi.git' }],
        }),
        setRemoteUrl: vi.fn(),
      },
    };
    const r = await switchOriginToSsh('/repo', 'origin');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/已是 SSH/);
    expect((globalThis as any).window.gitgui.git.setRemoteUrl).not.toHaveBeenCalled();
  });

  it('remote 不存在时返回失败', async () => {
    (globalThis as any).window.gitgui = {
      git: {
        remoteList: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        setRemoteUrl: vi.fn(),
      },
    };
    const r = await switchOriginToSsh('/repo', 'origin');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/不存在/);
  });

  it('remoteList 失败时透传错误', async () => {
    (globalThis as any).window.gitgui = {
      git: {
        remoteList: vi.fn().mockResolvedValue({ ok: false, error: 'boom' }),
        setRemoteUrl: vi.fn(),
      },
    };
    const r = await switchOriginToSsh('/repo', 'origin');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('boom');
  });

  it('setRemoteUrl 失败时透传错误', async () => {
    (globalThis as any).window.gitgui = {
      git: {
        remoteList: vi.fn().mockResolvedValue({
          ok: true,
          data: [{ name: 'origin', fetch: 'https://github.com/buxiaju/DouBi.git', push: '' }],
        }),
        setRemoteUrl: vi.fn().mockResolvedValue({ ok: false, error: 'permission denied' }),
      },
    };
    const r = await switchOriginToSsh('/repo', 'origin');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('permission denied');
  });
});
