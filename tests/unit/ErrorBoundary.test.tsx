// 健壮性加固：React 错误边界
//
// 加固前项目没有任何 ErrorBoundary，组件渲染抛错 = 整个应用白屏。
// 这些用例锁定「出错后仍有可见 UI 与恢复入口」这一核心保证。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ErrorBoundary from '../../src/components/common/ErrorBoundary';

/** 受控的抛错组件 */
function Boom({ message = 'kaboom' }: { message?: string }) {
  throw new Error(message);
}

function Fine() {
  return <div>正常内容</div>;
}

describe('ErrorBoundary', () => {
  // React 捕获错误时会往 console.error 打日志，测试期间静音以免污染输出
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    spy.mockRestore();
  });

  describe('无错误时', () => {
    it('透明渲染子组件', () => {
      render(
        <ErrorBoundary>
          <Fine />
        </ErrorBoundary>
      );
      expect(screen.getByText('正常内容')).toBeTruthy();
    });
  });

  describe('子组件抛错时', () => {
    it('不再渲染崩溃的子树', () => {
      render(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>
      );
      expect(screen.queryByText('正常内容')).toBeNull();
    });

    it('渲染兜底 UI 而不是白屏', () => {
      const { container } = render(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>
      );
      // 关键断言：容器非空。白屏 bug 的本质就是这里为空。
      expect(container.textContent?.trim()).not.toBe('');
      expect(screen.getByRole('alert')).toBeTruthy();
    });

    it('显示错误消息，便于用户反馈', () => {
      render(
        <ErrorBoundary>
          <Boom message="仓库解析失败" />
        </ErrorBoundary>
      );
      // 消息同时出现在摘要区和折叠的堆栈区，故用 getAllByText
      expect(screen.getAllByText(/仓库解析失败/).length).toBeGreaterThan(0);
    });

    it('提供恢复入口：重试 / 重新加载 / 复制诊断信息', () => {
      render(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>
      );
      expect(screen.getByText('重试')).toBeTruthy();
      expect(screen.getByText('重新加载界面')).toBeTruthy();
      expect(screen.getByText('复制诊断信息')).toBeTruthy();
    });

    it('调用 onError 回调并带上错误对象', () => {
      const onError = vi.fn();
      render(
        <ErrorBoundary onError={onError}>
          <Boom message="cb-test" />
        </ErrorBoundary>
      );
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
      expect((onError.mock.calls[0][0] as Error).message).toBe('cb-test');
    });

    it('把错误记录到 console.error（会被主进程日志转发收集）', () => {
      render(
        <ErrorBoundary>
          <Boom message="logged" />
        </ErrorBoundary>
      );
      expect(spy).toHaveBeenCalled();
      const flat = spy.mock.calls.flat().join(' ');
      expect(flat).toContain('ErrorBoundary');
    });
  });

  describe('语言切换（不依赖 i18n Context）', () => {
    it('默认中文文案', () => {
      render(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>
      );
      expect(screen.getByText('界面出现异常')).toBeTruthy();
    });

    it('lang=en 时输出英文文案', () => {
      render(
        <ErrorBoundary lang="en">
          <Boom />
        </ErrorBoundary>
      );
      expect(screen.getByText('Something went wrong')).toBeTruthy();
      expect(screen.getByText('Retry')).toBeTruthy();
    });

    it('缺少 I18nProvider 时依然能渲染（兜底不能依赖可能已崩溃的上层）', () => {
      // 这里刻意不包任何 Provider —— useI18n() 在无 Provider 时会 throw，
      // 若兜底 UI 依赖它就会二次崩溃。
      expect(() =>
        render(
          <ErrorBoundary>
            <Boom />
          </ErrorBoundary>
        )
      ).not.toThrow();
      expect(screen.getByRole('alert')).toBeTruthy();
    });
  });

  describe('技术细节折叠区', () => {
    it('包含堆栈信息供排障', () => {
      const { container } = render(
        <ErrorBoundary>
          <Boom message="with-stack" />
        </ErrorBoundary>
      );
      expect(container.querySelector('details')).toBeTruthy();
      expect(container.querySelector('pre')?.textContent).toContain('with-stack');
    });
  });
});
