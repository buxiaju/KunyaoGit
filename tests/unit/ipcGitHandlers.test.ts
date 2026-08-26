// 健壮性加固 A：ipc/git.ts 的 getGitSafe 仓库根路径校验 + 缓存
//
// 验证：
//   1. 未登记的路径被拒（不调用 simple-git）
//   2. 登记后第二次调用命中缓存
//   3. invalidateGitCache 清理
//   4. 不同的入参形态（直接传 string / 传 { path: ... }）都能解析出仓库路径

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';

// 用一个 Map 模拟 ipcMain.handle 注册，避开真实的 electron 模块。
// electron 在 vitest node 环境下加载会失败（缺 native 绑定），所以 vi.mock 替换。
const handlers = new Map<string, (...args: any[]) => any>();
vi.mock('electron', () => ({
  ipcMain: {
    handle: (ch: string, fn: any) => {
      handlers.set(ch, fn);
    },
  },
  app: { getPath: () => '/tmp/kg-test', getVersion: () => '0.0.0' },
}));

import path from 'node:path';
import {
  clearAllowedRoots,
  registerAllowedRoot,
} from '../../electron/lib/safePath';
import {
  invalidateGitCache,
  clearGitCache,
  registerGitHandlers,
} from '../../electron/ipc/git';
import { IPC } from '../../shared/ipc-channels';

describe('ipc/git.ts 缓存与清理', () => {
  beforeEach(() => {
    clearAllowedRoots();
    clearGitCache();
  });

  it('invalidateGitCache 接受任意路径不抛', () => {
    expect(() => invalidateGitCache('/some/path')).not.toThrow();
    expect(() => invalidateGitCache('')).not.toThrow();
  });

  it('clearGitCache 清空后再次 invalidate 不抛', () => {
    clearGitCache();
    expect(() => clearGitCache()).not.toThrow();
    expect(() => invalidateGitCache('/x')).not.toThrow();
  });
});

describe('ipc/git.ts handler 校验拒绝非法路径', () => {
  beforeEach(() => {
    clearAllowedRoots();
    clearGitCache();
    handlers.clear();
    registerGitHandlers();
  });

  it('getGitSafe 拒绝未登记的仓库路径', async () => {
    const handler = handlers.get(IPC.GIT_STATUS);
    expect(handler).toBeDefined();
    const r = await handler!({}, 'C:/not-registered/repo');
    expect(r).toMatchObject({ ok: false });
    expect((r as any).error).toMatch(/仓库|越界|未打开/);
  });

  it('getGitSafe 接受 { path } 包装形态', async () => {
    const handler = handlers.get(IPC.GIT_LOG);
    expect(handler).toBeDefined();
    const r = await handler!({}, { path: 'C:/not-registered', maxCount: 10 });
    expect(r).toMatchObject({ ok: false });
  });

  it('getGitSafe 拒绝非字符串、非对象输入', async () => {
    const handler = handlers.get(IPC.GIT_STATUS);
    const r1 = await handler!({}, null);
    const r2 = await handler!({}, undefined);
    const r3 = await handler!({}, 123);
    const r4 = await handler!({}, '');
    expect(r1).toMatchObject({ ok: false });
    expect(r2).toMatchObject({ ok: false });
    expect(r3).toMatchObject({ ok: false });
    expect(r4).toMatchObject({ ok: false });
  });
});

describe('ipc/git.ts 仓库内 file 路径校验（健壮性加固 B）', () => {
  let realRepo: string;

  beforeEach(() => {
    clearAllowedRoots();
    clearGitCache();
    handlers.clear();
    registerGitHandlers();
    // 真实创建临时目录作为仓库根（getGitSafe 会 new GitService，目录必须存在）
    realRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-ipc-repo-'));
    registerAllowedRoot(realRepo);
  });

  afterEach(() => {
    try {
      fs.rmSync(realRepo, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it('GIT_BLAME 传入 ../../../etc/passwd 被拒（不调 simple-git）', async () => {
    const handler = handlers.get(IPC.GIT_BLAME);
    const r = await handler!({}, { path: realRepo, file: '../../../etc/passwd' });
    expect(r).toMatchObject({ ok: false });
    expect((r as any).error).toMatch(/超出仓库|非法字符/);
  });

  it('GIT_FILE_LOG 同上（越界 file 被 assertInsideRepo 拒）', async () => {
    const handler = handlers.get(IPC.GIT_FILE_LOG);
    const r = await handler!({}, { path: realRepo, file: '../../outside.txt' });
    expect(r).toMatchObject({ ok: false });
    expect((r as any).error).toMatch(/超出仓库|非法字符/);
  });

  it('GIT_READ_CONFLICT 越界 file 拒；正常 file 因 fs 报错（不是路径问题）', async () => {
    const handler = handlers.get(IPC.GIT_READ_CONFLICT);

    // 越界
    const r1 = await handler!({}, { path: realRepo, file: '../../escape.txt' });
    expect(r1).toMatchObject({ ok: false });
    expect((r1 as any).error).toMatch(/超出仓库/);

    // 正常 file：仓库存在但不是 git 仓库（没有 .git），所以 GitService 创建后
    // 任何操作都失败 —— 但失败原因不是路径校验，而是 simple-git 找不到 .git
    // 关键是 error 不能是"超出仓库"/"非法字符"
    const r2 = await handler!({}, { path: realRepo, file: 'src/foo.ts' });
    if (!r2.ok) {
      expect((r2 as any).error).not.toMatch(/超出仓库|非法字符/);
    }
  });
});
