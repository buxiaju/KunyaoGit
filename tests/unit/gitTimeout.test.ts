// 健壮性加固 P1：GitService 超时配置与错误消息翻译
//
// 加固前 simple-git 没有任何 timeout，底层 git 进程卡住就永不返回，
// 渲染层的 await 永远不 resolve —— 界面卡在 loading 且无任何提示。
// 最典型场景：对需要认证的 remote 执行 fetch/pull，git 在等凭据输入，
// 而 GUI 里没有可交互的终端。

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRaw = vi.fn();
const mockFetch = vi.fn();
const simpleGitFactory = vi.fn();

vi.mock('simple-git', () => ({
  default: (opts: unknown) => {
    simpleGitFactory(opts);
    return { raw: mockRaw, fetch: mockFetch };
  },
}));

const { GitService } = await import('../../electron/services/git');

describe('GitService 超时加固', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('构造参数', () => {
    it('向 simple-git 传入 block 超时（否则卡死的调用永不返回）', () => {
      new GitService('C:/fake/repo');
      expect(simpleGitFactory).toHaveBeenCalledTimes(1);
      const opts = simpleGitFactory.mock.calls[0][0] as { timeout?: { block?: number } };
      expect(opts.timeout).toBeDefined();
      expect(opts.timeout?.block).toBeGreaterThan(0);
    });

    it('超时阈值为 60 秒', () => {
      new GitService('C:/fake/repo');
      const opts = simpleGitFactory.mock.calls[0][0] as { timeout?: { block?: number } };
      expect(opts.timeout?.block).toBe(60_000);
    });

    it('保留既有的 baseDir / binary / 并发配置', () => {
      new GitService('C:/fake/repo', 'D:/git/bin/git.exe');
      const opts = simpleGitFactory.mock.calls[0][0] as Record<string, unknown>;
      expect(opts.baseDir).toBe('C:/fake/repo');
      expect(opts.binary).toBe('D:/git/bin/git.exe');
      expect(opts.maxConcurrentProcesses).toBe(4);
    });

    it('未指定 git 路径时回退到 PATH 上的 git', () => {
      new GitService('C:/fake/repo');
      const opts = simpleGitFactory.mock.calls[0][0] as Record<string, unknown>;
      expect(opts.binary).toBe('git');
    });
  });

  describe('describeError：把英文超时消息翻译成可行动的中文提示', () => {
    it('识别 simple-git 的 block timeout', () => {
      const out = GitService.describeError(new Error('block timeout reached'));
      expect(out).toContain('超时');
      expect(out).toContain('60s');
    });

    it('提示里包含可排查的方向（网络 / 代理 / 认证）', () => {
      const out = GitService.describeError(new Error('block timeout reached'));
      expect(out).toMatch(/网络/);
      expect(out).toMatch(/代理/);
      expect(out).toMatch(/认证|凭据/);
    });

    it('大小写不敏感', () => {
      expect(GitService.describeError(new Error('BLOCK TIMEOUT REACHED'))).toContain('超时');
    });

    it('夹在更长错误文本中也能识别', () => {
      const out = GitService.describeError(
        new Error('Error: block timeout reached after 60000ms while running git fetch')
      );
      expect(out).toContain('超时');
    });

    it('非超时错误原样返回，不掩盖真实原因', () => {
      const msg = "fatal: not a git repository (or any of the parent directories): .git";
      expect(GitService.describeError(new Error(msg))).toBe(msg);
    });

    it('认证失败等常见错误保持原文', () => {
      const msg = 'remote: Invalid username or password';
      expect(GitService.describeError(new Error(msg))).toBe(msg);
    });

    it.each([null, undefined, 'plain string', 123, {}])('异常输入 %s 不抛错', (bad) => {
      expect(() => GitService.describeError(bad)).not.toThrow();
    });
  });

  describe('超时错误经由 Result 返回给渲染层', () => {
    it('git 调用超时时返回翻译后的中文错误', async () => {
      mockRaw.mockRejectedValue(new Error('block timeout reached'));
      const svc = new GitService('C:/fake/repo');
      const r = await svc.stashList();
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error).toContain('超时');
        // 不应把裸英文消息透给用户
        expect(r.error).not.toBe('block timeout reached');
      }
    });

    it('非超时失败仍然返回原始错误信息', async () => {
      mockRaw.mockRejectedValue(new Error('fatal: bad revision'));
      const svc = new GitService('C:/fake/repo');
      const r = await svc.stashList();
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe('fatal: bad revision');
    });
  });
});
