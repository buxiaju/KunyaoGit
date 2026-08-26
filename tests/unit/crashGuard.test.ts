// 健壮性加固：主进程崩溃兜底
// 只测纯逻辑部分（格式化、签名、节流、落盘），不触碰 electron。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  describeError,
  formatCrashEntry,
  crashSignature,
  shouldNotify,
  resetNotifyThrottle,
  appendCrashLog,
  handleCrash,
  installCrashGuards,
} from '../../electron/lib/crashGuard';

describe('crashGuard', () => {
  beforeEach(() => {
    resetNotifyThrottle();
  });

  describe('describeError', () => {
    it('Error 输出 name + message + stack', () => {
      const out = describeError(new Error('boom'));
      expect(out).toContain('Error: boom');
    });

    it('字符串原样返回', () => {
      expect(describeError('plain failure')).toBe('plain failure');
    });

    it('对象序列化为 JSON', () => {
      expect(describeError({ code: 42 })).toBe('{"code":42}');
    });

    it('循环引用不抛异常', () => {
      const a: Record<string, unknown> = {};
      a.self = a;
      expect(() => describeError(a)).not.toThrow();
    });

    it.each([null, undefined, 0, false])('原始值 %s 不抛异常', (v) => {
      expect(() => describeError(v)).not.toThrow();
    });
  });

  describe('formatCrashEntry', () => {
    it('包含时间戳、类型与错误内容', () => {
      const at = new Date('2026-08-26T00:00:00.000Z');
      const entry = formatCrashEntry('uncaughtException', new Error('boom'), at);
      expect(entry).toContain('2026-08-26T00:00:00.000Z');
      expect(entry).toContain('[uncaughtException]');
      expect(entry).toContain('boom');
    });

    it('以换行结尾，便于追加写', () => {
      expect(formatCrashEntry('loadFailed', 'x')).toMatch(/\n$/);
    });
  });

  describe('crashSignature', () => {
    it('同类型同首行消息 → 相同签名', () => {
      const a = crashSignature('uncaughtException', new Error('same'));
      const b = crashSignature('uncaughtException', new Error('same'));
      expect(a).toBe(b);
    });

    it('不同类型 → 不同签名', () => {
      const a = crashSignature('uncaughtException', new Error('x'));
      const b = crashSignature('unhandledRejection', new Error('x'));
      expect(a).not.toBe(b);
    });

    it('堆栈不同但消息相同 → 仍视为同一签名（用于节流）', () => {
      const e1 = new Error('dup');
      const e2 = new Error('dup');
      e2.stack = 'totally different stack';
      expect(crashSignature('uncaughtException', e1)).toBe(crashSignature('uncaughtException', e2));
    });
  });

  describe('shouldNotify 节流（防异常风暴弹窗刷屏）', () => {
    it('同一错误首次提示，紧随其后的重复不提示', () => {
      const err = new Error('storm');
      expect(shouldNotify('uncaughtException', err, 1000)).toBe(true);
      expect(shouldNotify('uncaughtException', err, 1001)).toBe(false);
      expect(shouldNotify('uncaughtException', err, 5000)).toBe(false);
    });

    it('超过节流窗口后重新提示', () => {
      const err = new Error('storm');
      expect(shouldNotify('uncaughtException', err, 1000)).toBe(true);
      expect(shouldNotify('uncaughtException', err, 1000 + 30_001)).toBe(true);
    });

    it('不同错误互不影响', () => {
      expect(shouldNotify('uncaughtException', new Error('a'), 1000)).toBe(true);
      expect(shouldNotify('uncaughtException', new Error('b'), 1000)).toBe(true);
    });
  });

  describe('appendCrashLog', () => {
    let dir: string;

    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-crash-'));
    });

    afterEach(() => {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    });

    it('写入 main-error.log', () => {
      appendCrashLog(dir, 'entry-1\n');
      const file = path.join(dir, 'main-error.log');
      expect(fs.existsSync(file)).toBe(true);
      expect(fs.readFileSync(file, 'utf-8')).toContain('entry-1');
    });

    it('多次调用为追加而非覆盖', () => {
      appendCrashLog(dir, 'first\n');
      appendCrashLog(dir, 'second\n');
      const content = fs.readFileSync(path.join(dir, 'main-error.log'), 'utf-8');
      expect(content).toContain('first');
      expect(content).toContain('second');
    });

    it('目录不存在时自动创建', () => {
      const nested = path.join(dir, 'a', 'b', 'logs');
      appendCrashLog(nested, 'x\n');
      expect(fs.existsSync(path.join(nested, 'main-error.log'))).toBe(true);
    });

    it('超过体积上限时轮转为 .1.log', () => {
      const file = path.join(dir, 'main-error.log');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, 'x'.repeat(1024 * 1024 + 10), 'utf-8');
      appendCrashLog(dir, 'after-rotate\n');
      expect(fs.existsSync(path.join(dir, 'main-error.1.log'))).toBe(true);
      expect(fs.readFileSync(file, 'utf-8')).toContain('after-rotate');
    });

    it('路径不可写时静默失败，不抛异常', () => {
      // 用一个文件当目录，mkdirSync 必然失败
      const asFile = path.join(dir, 'not-a-dir');
      fs.writeFileSync(asFile, 'x');
      expect(() => appendCrashLog(asFile, 'y\n')).not.toThrow();
    });
  });

  describe('handleCrash', () => {
    let dir: string;

    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-crash-h-'));
    });

    afterEach(() => {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    });

    it('落盘并调用 notify', () => {
      const notify = vi.fn();
      handleCrash({ logDir: dir, notify, log: () => {} }, 'uncaughtException', new Error('boom'));
      expect(notify).toHaveBeenCalledTimes(1);
      expect(fs.readFileSync(path.join(dir, 'main-error.log'), 'utf-8')).toContain('boom');
    });

    it('notify 为 null 时仍然落盘', () => {
      handleCrash({ logDir: dir, notify: null, log: () => {} }, 'loadFailed', 'nope');
      expect(fs.readFileSync(path.join(dir, 'main-error.log'), 'utf-8')).toContain('nope');
    });

    it('notify 自身抛异常不会向上冒泡', () => {
      const notify = vi.fn(() => {
        throw new Error('dialog failed');
      });
      expect(() =>
        handleCrash({ logDir: dir, notify, log: () => {} }, 'uncaughtException', new Error('x'))
      ).not.toThrow();
    });

    it('重复同一错误只提示一次', () => {
      const notify = vi.fn();
      const deps = { logDir: dir, notify, log: () => {} };
      const err = new Error('same');
      handleCrash(deps, 'uncaughtException', err);
      handleCrash(deps, 'uncaughtException', err);
      handleCrash(deps, 'uncaughtException', err);
      expect(notify).toHaveBeenCalledTimes(1);
    });
  });

  describe('installCrashGuards', () => {
    it('注册后 process 上存在监听器，卸载后移除', () => {
      const before = process.listenerCount('uncaughtException');
      const uninstall = installCrashGuards({ logDir: os.tmpdir(), notify: null, log: () => {} });
      expect(process.listenerCount('uncaughtException')).toBe(before + 1);
      expect(process.listenerCount('unhandledRejection')).toBeGreaterThan(0);
      uninstall();
      expect(process.listenerCount('uncaughtException')).toBe(before);
    });
  });
});
