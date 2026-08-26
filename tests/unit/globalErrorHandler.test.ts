// 健壮性加固：渲染进程全局错误兜底
//
// ErrorBoundary 抓不到异步错误。项目里大量 `await window.gitgui.xxx()` 没有
// try/catch，IPC 一旦 reject 就是静默失败（界面卡 loading 且无提示）。
// 这些用例锁定「静默失败变成可见提示」的行为。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  describeReason,
  installGlobalErrorHandlers,
  resetErrorThrottle,
} from '../../src/lib/globalErrorHandler';

// toast 走 zustand store，这里 mock 掉只验证调用
vi.mock('../../src/components/common/Toast', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

const { toast } = await import('../../src/components/common/Toast');

describe('globalErrorHandler', () => {
  describe('describeReason', () => {
    it('Error 取 message', () => {
      expect(describeReason(new Error('boom'))).toBe('boom');
    });

    it('字符串原样返回', () => {
      expect(describeReason('plain')).toBe('plain');
    });

    it('识别 IPC 的 Result 失败形态 { ok:false, error }', () => {
      expect(describeReason({ ok: false, error: '该目录不是 Git 仓库' })).toBe('该目录不是 Git 仓库');
    });

    it('识别带 message 字段的对象', () => {
      expect(describeReason({ message: 'from message' })).toBe('from message');
    });

    it('其他对象序列化为 JSON', () => {
      expect(describeReason({ code: 7 })).toBe('{"code":7}');
    });

    it('循环引用不抛异常', () => {
      const a: Record<string, unknown> = {};
      a.self = a;
      expect(() => describeReason(a)).not.toThrow();
    });

    it.each([null, undefined, 0, false])('原始值 %s 不抛异常', (v) => {
      expect(() => describeReason(v)).not.toThrow();
    });
  });

  describe('installGlobalErrorHandlers', () => {
    let uninstall: () => void;
    let consoleSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      vi.clearAllMocks();
      resetErrorThrottle();
      consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      uninstall = installGlobalErrorHandlers();
    });

    afterEach(() => {
      uninstall();
      consoleSpy.mockRestore();
    });

    it('未处理的 rejection 会触发 toast 提示', () => {
      const event = new Event('unhandledrejection') as Event & { reason: unknown };
      event.reason = new Error('IPC 调用失败');
      window.dispatchEvent(event);
      expect(toast.error).toHaveBeenCalled();
      expect(vi.mocked(toast.error).mock.calls[0][0]).toContain('IPC 调用失败');
    });

    it('未处理的 rejection 会记录 console.error（转发进主进程日志）', () => {
      const event = new Event('unhandledrejection') as Event & { reason: unknown };
      event.reason = new Error('logged failure');
      window.dispatchEvent(event);
      expect(consoleSpy).toHaveBeenCalled();
      expect(consoleSpy.mock.calls.flat().join(' ')).toContain('unhandledrejection');
    });

    it('同一错误在节流窗口内只提示一次', () => {
      for (let i = 0; i < 5; i++) {
        const event = new Event('unhandledrejection') as Event & { reason: unknown };
        event.reason = new Error('repeated');
        window.dispatchEvent(event);
      }
      expect(toast.error).toHaveBeenCalledTimes(1);
    });

    it('不同错误分别提示', () => {
      const e1 = new Event('unhandledrejection') as Event & { reason: unknown };
      e1.reason = new Error('first');
      const e2 = new Event('unhandledrejection') as Event & { reason: unknown };
      e2.reason = new Error('second');
      window.dispatchEvent(e1);
      window.dispatchEvent(e2);
      expect(toast.error).toHaveBeenCalledTimes(2);
    });

    it('卸载后不再提示', () => {
      uninstall();
      const event = new Event('unhandledrejection') as Event & { reason: unknown };
      event.reason = new Error('after uninstall');
      window.dispatchEvent(event);
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('超长错误消息被截断，避免 toast 撑爆界面', () => {
      const event = new Event('unhandledrejection') as Event & { reason: unknown };
      event.reason = new Error('x'.repeat(1000));
      window.dispatchEvent(event);
      const msg = vi.mocked(toast.error).mock.calls[0][0];
      expect(msg.length).toBeLessThan(300);
    });
  });
});
