// @vitest-environment jsdom
//
// v0.6+ MarkdownBody 组件测试
// 覆盖：空 source / 纯文本 / GFM 标题 / 列表 / 链接 / 净化行为
//
// ⚠️ 使用 jsdom 而非项目默认的 happy-dom：DOMPurify 3.4.14 在 happy-dom 下
// 会静默失效，组件会走纯文本降级路径，无法验证真实渲染与过滤结果。
// 生产环境是 Electron/Chromium，行为与 jsdom 一致。

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MarkdownBody from '../../src/components/repo/MarkdownBody';

describe('MarkdownBody', () => {
  it('空 source 渲染为空容器', () => {
    const { container } = render(<MarkdownBody source="" />);
    expect(container.querySelector('.markdown-body')?.innerHTML).toBe('');
  });

  it('纯文本：保留换行（breaks: true）', () => {
    const { container } = render(<MarkdownBody source={'line 1\nline 2'} />);
    const html = container.querySelector('.markdown-body')?.innerHTML || '';
    expect(html).toContain('line 1');
    expect(html).toContain('line 2');
    // breaks: true 把 \n 转成 <br>
    expect(html).toMatch(/<br/);
  });

  it('GFM 标题：渲染为 <h1>/<h2>', () => {
    const { container } = render(<MarkdownBody source={'# H1\n\n## H2'} />);
    const html = container.querySelector('.markdown-body')?.innerHTML || '';
    expect(html).toMatch(/<h1[^>]*>H1<\/h1>/);
    expect(html).toMatch(/<h2[^>]*>H2<\/h2>/);
  });

  it('无序列表：渲染为 <ul><li>', () => {
    const { container } = render(<MarkdownBody source={'- a\n- b\n- c'} />);
    const html = container.querySelector('.markdown-body')?.innerHTML || '';
    expect(html).toMatch(/<ul>/);
    expect(html).toMatch(/<li[^>]*>a<\/li>/);
    expect(html).toMatch(/<li[^>]*>b<\/li>/);
  });

  it('代码块：渲染为 <pre><code>', () => {
    const { container } = render(<MarkdownBody source={'```\nconst x = 1\n```'} />);
    const html = container.querySelector('.markdown-body')?.innerHTML || '';
    expect(html).toMatch(/<pre>/);
    expect(html).toMatch(/<code>/);
  });

  // --- v0.6 健壮性加固：接入 DOMPurify 之后的安全行为 ---
  // 原先这里断言的是「未 sanitize（XSS 由发布者负责）」。
  // 该假设不成立：RemotePage 可以浏览任意公开仓库的 Release，
  // body 属于不可信远程输入，因此断言意图整体反转。

  it('安全加固：<script> 被移除', () => {
    const { container } = render(<MarkdownBody source={'<script>alert(1)</script>'} />);
    const html = container.querySelector('.markdown-body')?.innerHTML || '';
    expect(html).not.toContain('<script');
    expect(html).not.toContain('alert(1)');
  });

  it('安全加固：img onerror 事件属性被移除', () => {
    const { container } = render(
      <MarkdownBody source={'<img src=x onerror="window.gitgui.fs.delete(\'C:/\')">'} />
    );
    const html = container.querySelector('.markdown-body')?.innerHTML || '';
    expect(html.toLowerCase()).not.toContain('onerror');
    expect(html).not.toContain('fs.delete');
  });

  it('安全加固：javascript: 链接被移除', () => {
    const { container } = render(<MarkdownBody source={'[click](javascript:alert(1))'} />);
    const html = container.querySelector('.markdown-body')?.innerHTML || '';
    expect(html.toLowerCase()).not.toContain('javascript:');
  });

  it('安全加固：iframe 被移除', () => {
    const { container } = render(<MarkdownBody source={'<iframe src="https://evil.invalid"></iframe>'} />);
    const html = container.querySelector('.markdown-body')?.innerHTML || '';
    expect(html).not.toContain('<iframe');
  });

  it('安全加固：外链被改写为 target=_blank + rel=noopener', () => {
    // 否则点击会让整个 Electron 应用导航到外部站点，白屏且无法返回
    const { container } = render(<MarkdownBody source={'[gh](https://github.com/x/y)'} />);
    const a = container.querySelector('.markdown-body a');
    expect(a?.getAttribute('target')).toBe('_blank');
    expect(a?.getAttribute('rel')).toContain('noopener');
  });

  it('正常内容不受净化影响：加粗 / 斜体 / 表格保留', () => {
    const { container } = render(
      <MarkdownBody source={'**b** _i_\n\n| h |\n| - |\n| d |'} />
    );
    const html = container.querySelector('.markdown-body')?.innerHTML || '';
    expect(html).toContain('<strong>b</strong>');
    expect(html).toContain('<em>i</em>');
    expect(html).toContain('<table>');
  });
});
