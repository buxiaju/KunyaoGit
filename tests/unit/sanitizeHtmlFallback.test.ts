// 健壮性加固：净化器失效时的降级路径
//
// 本文件使用项目默认的 happy-dom 环境。这不是疏漏，而是刻意为之：
// 实测 DOMPurify 3.4.14 在 happy-dom 下会静默失效——
//
//     happy-dom: '<p>hi</p><script>alert(1)</script>' → 'hi<script>alert(1)</script>'
//     jsdom    : '<p>hi</p><script>alert(1)</script>' → '<p>hi</p>'
//
// 而且此时 DOMPurify.isSupported 仍为 true，无法靠库自报状态识别。
// 因此 happy-dom 恰好是一个真实可用的「过滤器失效」环境，
// 用来验证 sanitizeHtml 的自检 + 降级逻辑是否真的兜住了 XSS。
//
// 正常过滤路径的断言在 sanitizeHtml.test.ts（jsdom 环境）。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sanitizeHtml, isSanitizerHealthy, resetSanitizerState } from '../../src/lib/sanitizeHtml';

describe('sanitizeHtml 降级路径 (happy-dom)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetSanitizerState();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('自检能识别出当前环境的净化器不可靠', () => {
    expect(isSanitizerHealthy()).toBe(false);
  });

  it('自检失败时输出告警，便于排障', () => {
    isSanitizerHealthy();
    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls.flat().join(' ')).toContain('降级为纯文本');
  });

  // --- 核心：降级后依然不能放过 XSS ---

  it('降级后 <script> 不再是可执行标签', () => {
    const out = sanitizeHtml('<p>hi</p><script>alert(1)</script>');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });

  it('降级后 img onerror 不再是可执行属性', () => {
    const out = sanitizeHtml('<img src=x onerror="window.gitgui.fs.delete(\'C:/\')">');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
  });

  it('降级后 iframe 被转义', () => {
    const out = sanitizeHtml('<iframe src="https://evil.invalid"></iframe>');
    expect(out).not.toContain('<iframe');
    expect(out).toContain('&lt;iframe');
  });

  it('降级输出包裹在 <pre> 中，内容以纯文本呈现', () => {
    const out = sanitizeHtml('<b>x</b>');
    expect(out.startsWith('<pre>')).toBe(true);
    expect(out).toContain('&lt;b&gt;');
  });

  it('空输入仍返回空，不产生多余 <pre>', () => {
    expect(sanitizeHtml('')).toBe('');
  });

  it('降级路径不抛异常', () => {
    expect(() => sanitizeHtml('<p><div><span>unclosed')).not.toThrow();
  });
});
