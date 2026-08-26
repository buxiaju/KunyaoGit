// 健壮性加固：主进程文件系统路径边界校验
//
// 这些用例的核心目的：证明「被 XSS 的渲染进程绕过 store 直接调 fs API」
// 这条攻击路径已经被主进程侧堵住。

import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import {
  assertSafePath,
  assertInsideRepo,
  redactPath,
  registerAllowedRoot,
  unregisterAllowedRoot,
  clearAllowedRoots,
  listAllowedRoots,
  isInside,
} from '../../electron/lib/safePath';

const isWin = process.platform === 'win32';
// 用平台原生的绝对路径，避免断言在 POSIX / Windows 下语义漂移
const REPO = isWin ? 'C:\\Users\\tester\\code\\myrepo' : '/home/tester/code/myrepo';
const SIBLING = isWin ? 'C:\\Users\\tester\\code\\myrepo-evil' : '/home/tester/code/myrepo-evil';

describe('safePath', () => {
  beforeEach(() => {
    clearAllowedRoots();
  });

  describe('白名单为空时', () => {
    it('任何路径都被拒绝（安全的默认值）', () => {
      const r = assertSafePath(path.join(REPO, 'README.md'));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain('尚未打开任何仓库');
    });
  });

  describe('登记仓库根之后', () => {
    beforeEach(() => {
      registerAllowedRoot(REPO);
    });

    it('放行仓库根自身', () => {
      expect(assertSafePath(REPO).ok).toBe(true);
    });

    it('放行仓库内的文件', () => {
      expect(assertSafePath(path.join(REPO, 'README.md')).ok).toBe(true);
    });

    it('放行仓库内的深层嵌套路径', () => {
      expect(assertSafePath(path.join(REPO, 'src', 'a', 'b', 'c.ts')).ok).toBe(true);
    });

    it('返回规范化后的绝对路径而不是原始入参', () => {
      const messy = path.join(REPO, 'src', '..', 'README.md');
      const r = assertSafePath(messy);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.data).toBe(path.join(REPO, 'README.md'));
    });

    // --- 这一组是加固的重点：路径穿越 ---
    it('拒绝 ../ 穿越到仓库外', () => {
      const r = assertSafePath(path.join(REPO, '..', '..', '..', 'secret.txt'));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain('超出已打开仓库范围');
    });

    it('拒绝多段 ../ 组合穿越', () => {
      expect(assertSafePath(path.join(REPO, 'src', '..', '..', 'outside.txt')).ok).toBe(false);
    });

    it('拒绝同前缀的兄弟目录（防 startsWith 前缀陷阱）', () => {
      // 'myrepo-evil'.startsWith('myrepo') 为真，用字符串比较会误放行
      expect(assertSafePath(path.join(SIBLING, 'payload.txt')).ok).toBe(false);
    });

    it('拒绝完全无关的绝对路径', () => {
      const outside = isWin ? 'D:\\other\\file.txt' : '/tmp/other/file.txt';
      expect(assertSafePath(outside).ok).toBe(false);
    });

    it('拒绝含 NUL 字节的路径', () => {
      const r = assertSafePath(path.join(REPO, 'a\0b.txt'));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain('非法字符');
    });

    it.each([null, undefined, 123, {}, [], '', '   '])('拒绝非法入参 %s', (bad) => {
      expect(assertSafePath(bad as unknown).ok).toBe(false);
    });
  });

  describe('系统关键目录黑名单（优先级高于白名单）', () => {
    const dangerous = isWin
      ? ['C:\\', 'C:/', 'C:\\Windows', 'C:\\Windows\\System32', 'C:\\Program Files', 'C:\\ProgramData']
      : ['/', '/etc', '/etc/passwd', '/usr/bin', '/bin'];

    it.each(dangerous)('拒绝 %s', (p) => {
      // 即使有人把它登记成仓库根，也不能放行
      registerAllowedRoot(p);
      const r = assertSafePath(p);
      expect(r.ok).toBe(false);
    });

    it('registerAllowedRoot 不会把系统目录写进白名单', () => {
      registerAllowedRoot(isWin ? 'C:\\Windows' : '/etc');
      expect(listAllowedRoots()).toHaveLength(0);
    });

    it('盘符根 / 根目录不会被当作合法仓库根', () => {
      registerAllowedRoot(isWin ? 'C:\\' : '/');
      expect(listAllowedRoots()).toHaveLength(0);
    });
  });

  describe('多仓库共存', () => {
    it('分别登记的两个仓库都放行，互不干扰', () => {
      const second = isWin ? 'D:\\work\\another' : '/home/tester/another';
      registerAllowedRoot(REPO);
      registerAllowedRoot(second);
      expect(assertSafePath(path.join(REPO, 'a.txt')).ok).toBe(true);
      expect(assertSafePath(path.join(second, 'b.txt')).ok).toBe(true);
    });

    it('unregister 之后该仓库不再放行', () => {
      registerAllowedRoot(REPO);
      expect(assertSafePath(path.join(REPO, 'a.txt')).ok).toBe(true);
      unregisterAllowedRoot(REPO);
      expect(assertSafePath(path.join(REPO, 'a.txt')).ok).toBe(false);
    });
  });

  describe('isInside', () => {
    it('root 自身视为内部', () => {
      expect(isInside(REPO, REPO)).toBe(true);
    });
    it('子路径视为内部', () => {
      expect(isInside(REPO, path.join(REPO, 'x', 'y'))).toBe(true);
    });
    it('父路径不是内部', () => {
      expect(isInside(REPO, path.join(REPO, '..'))).toBe(false);
    });
    it('同前缀兄弟目录不是内部', () => {
      expect(isInside(REPO, SIBLING)).toBe(false);
    });
  });

  if (isWin) {
    describe('Windows 大小写不敏感', () => {
      it('大小写不同的同一路径应放行', () => {
        registerAllowedRoot(REPO);
        expect(assertSafePath(REPO.toUpperCase() + '\\README.md').ok).toBe(true);
      });
    });
  }
});

describe('assertInsideRepo（健壮性加固 B：仓库内相对路径）', () => {
  const REPO = path.resolve('/tmp/inside-repo');
  const isWin = process.platform === 'win32';

  beforeEach(() => {
    clearAllowedRoots();
  });

  it('仓库内的相对路径 OK', () => {
    const r = assertInsideRepo(REPO, 'src/foo.ts');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.endsWith(path.join('src', 'foo.ts'))).toBe(true);
  });

  it('绝对路径但在仓库内 OK', () => {
    const abs = path.join(REPO, 'bar.txt');
    const r = assertInsideRepo(REPO, abs);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toBe(path.resolve(abs));
  });

  it('跳出仓库的相对路径被拒（../../../etc/passwd）', () => {
    const r = assertInsideRepo(REPO, '../../../etc/passwd');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/超出仓库|无效/);
  });

  it('绝对路径跳出仓库被拒（POSIX: /etc/passwd；Windows: C:\\Windows\\...）', () => {
    const evil = isWin ? 'C:\\Windows\\System32\\drivers\\etc\\hosts' : '/etc/passwd';
    const r = assertInsideRepo(REPO, evil);
    expect(r.ok).toBe(false);
  });

  it('NUL 字节被拒', () => {
    const r = assertInsideRepo(REPO, 'foo\0bar');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/非法字符|超出/);
  });

  it('空字符串被拒', () => {
    expect(assertInsideRepo(REPO, '').ok).toBe(false);
    expect(assertInsideRepo(REPO, '   ').ok).toBe(false);
    expect(assertInsideRepo('', 'foo').ok).toBe(false);
    expect(assertInsideRepo(null, 'foo').ok).toBe(false);
  });

  it('非字符串类型被拒', () => {
    expect(assertInsideRepo(REPO, 123).ok).toBe(false);
    expect(assertInsideRepo(REPO, {}).ok).toBe(false);
    expect(assertInsideRepo(REPO, []).ok).toBe(false);
  });
});

describe('redactPath（健壮性加固 C：错误消息路径脱敏）', () => {
  it('Windows 用户路径保留最后两段（文件名 + 所在目录）', () => {
    expect(redactPath(`ENOENT: no such file, open 'C:\\Users\\kunyao\\Documents\\xxx\\file.txt'`))
      .toBe(`ENOENT: no such file, open '~\\xxx\\file.txt'`);
    expect(redactPath(`Error: cannot read C:\\Users\\alice\\proj\\src\\index.ts`))
      .toBe(`Error: cannot read ~\\src\\index.ts`);
  });

  it('Windows 路径总段数 < 2 时只保留文件名', () => {
    expect(redactPath(`open C:\\file.txt`)).toBe(`open ~\\file.txt`);
  });

  it('POSIX 用户路径保留最后两段（/Users/bob/proj/foo.ts → ~/proj/foo.ts）', () => {
    expect(redactPath(`Error: /Users/bob/proj/foo.ts: ENOENT`))
      .toBe(`Error: ~/proj/foo.ts: ENOENT`);
  });

  it('POSIX 路径总段数 < 2 时只保留最后一段', () => {
    expect(redactPath(`/home/alice/data.json`)).toBe(`~/data.json`);
  });

  it('UNC 长路径前缀（\\\\?\\C:\\...）被替换为 <long-path>', () => {
    expect(redactPath(`open \\\\?\\C:\\Users\\kunyao\\file.txt`))
      .toContain('<long-path>');
  });

  it('WSL 路径（\\\\wsl$\\Ubuntu\\...）被替换为 <wsl>', () => {
    expect(redactPath(`error at \\\\wsl$\\Ubuntu\\home\\user\\x`))
      .toContain('<wsl>');
  });

  it('不含路径的消息原样返回', () => {
    expect(redactPath('Operation failed')).toBe('Operation failed');
    expect(redactPath('block timeout reached')).toBe('block timeout reached');
  });

  it('空字符串 / 短路径不误伤', () => {
    expect(redactPath('')).toBe('');
    // C:foo（无路径分隔符）不是绝对路径
    expect(redactPath('fatal: C:foo')).toBe('fatal: C:foo');
  });

  it('同一消息中多个路径都脱敏', () => {
    const msg = `from C:\\Users\\a\\x.txt to D:\\Users\\b\\y.md`;
    const out = redactPath(msg);
    expect(out).toBe(`from ~\\a\\x.txt to ~\\b\\y.md`);
  });
});
