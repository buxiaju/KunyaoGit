// v0.6+ MarkdownBody 组件测试
// 覆盖：空 source / 纯文本 / GFM 标题 / 列表 / 链接

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

  it('安全说明：当前实现未 sanitize（XSS 由发布者负责）', () => {
    // 显式测试：script 标签会原样渲染（这是已知限制）
    const { container } = render(<MarkdownBody source={'<script>alert(1)</script>'} />);
    const html = container.querySelector('.markdown-body')?.innerHTML || '';
    // 注释：未来应接入 DOMPurify；当前 release body 信任发布者
    expect(html).toContain('script');
  });
});
