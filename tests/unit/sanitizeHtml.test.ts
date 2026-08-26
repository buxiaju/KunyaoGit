// @vitest-environment jsdom
//
// 健壮性加固：Markdown / HTML 净化
//
// 攻击场景还原：Release body 来自任意公开仓库（不可信）。
// 加固前 `<img src=x onerror="...">` 能直接执行，配合当时零校验的 fs API
// 可造成任意文件读写。这些用例锁定过滤行为。
//
// ⚠️ 本文件刻意使用 jsdom 而非项目默认的 happy-dom：
// 实测 DOMPurify 3.4.14 在 happy-dom 下会静默失效（合法标签被剥离、
// <script> 反而被保留），无法用于验证过滤能力。生产环境是 Electron/Chromium，
// 行为与 jsdom 一致。happy-dom 下的降级路径由 sanitizeHtmlFallback.test.ts 覆盖。

import { describe, it, expect } from 'vitest';
import { sanitizeHtml, escapeHtml, isSanitizerHealthy } from '../../src/lib/sanitizeHtml';

describe('sanitizeHtml (jsdom)', () => {
  it('前置条件：当前环境下净化器自检通过', () => {
    // 若这条失败，后面所有断言都会走降级路径而失去意义
    expect(isSanitizerHealthy()).toBe(true);
  });

  describe('剥离脚本执行途径', () => {
    it('移除 <script> 标签', () => {
      const out = sanitizeHtml('<p>hi</p><script>alert(1)</script>');
      expect(out).not.toContain('<script');
      expect(out).not.toContain('alert(1)');
      expect(out).toContain('hi');
    });

    it('移除 onerror 事件属性（经典 img XSS）', () => {
      const out = sanitizeHtml('<img src=x onerror="window.gitgui.fs.delete(\'C:/\')">');
      expect(out.toLowerCase()).not.toContain('onerror');
      expect(out).not.toContain('fs.delete');
    });

    it('移除 onclick / onload / onmouseover 等事件属性', () => {
      const out = sanitizeHtml(
        '<div onclick="a()" onload="b()" onmouseover="c()">x</div>'
      );
      expect(out.toLowerCase()).not.toContain('onclick');
      expect(out.toLowerCase()).not.toContain('onload');
      expect(out.toLowerCase()).not.toContain('onmouseover');
    });

    it('移除 javascript: 链接', () => {
      const out = sanitizeHtml('<a href="javascript:alert(1)">click</a>');
      expect(out.toLowerCase()).not.toContain('javascript:');
    });

    it('移除 <iframe>', () => {
      const out = sanitizeHtml('<iframe src="https://evil.invalid"></iframe>');
      expect(out).not.toContain('<iframe');
    });

    it('移除 <object> / <embed>', () => {
      const out = sanitizeHtml('<object data="x"></object><embed src="y">');
      expect(out).not.toContain('<object');
      expect(out).not.toContain('<embed');
    });

    it('移除 <form> 与 formaction', () => {
      const out = sanitizeHtml('<form action="https://evil.invalid"><input formaction="https://evil.invalid"></form>');
      expect(out).not.toContain('<form');
      expect(out.toLowerCase()).not.toContain('formaction');
    });

    it('移除 <style> 与内联 style（防样式注入 / 点击劫持）', () => {
      const out = sanitizeHtml('<style>body{display:none}</style><p style="position:fixed;inset:0">x</p>');
      expect(out).not.toContain('<style');
      expect(out.toLowerCase()).not.toContain('position:fixed');
    });

    it('移除 <base>（防相对链接劫持）', () => {
      const out = sanitizeHtml('<base href="https://evil.invalid/">');
      expect(out).not.toContain('<base');
    });

    it('移除 svg 内嵌脚本', () => {
      const out = sanitizeHtml('<svg><script>alert(1)</script></svg>');
      expect(out).not.toContain('alert(1)');
    });
  });

  describe('保留正常的 Markdown 产物', () => {
    it('保留段落与行内格式', () => {
      const out = sanitizeHtml('<p>hello <strong>bold</strong> <em>italic</em> <del>del</del></p>');
      expect(out).toContain('<strong>bold</strong>');
      expect(out).toContain('<em>italic</em>');
      expect(out).toContain('<del>del</del>');
    });

    it('保留标题', () => {
      expect(sanitizeHtml('<h1>t</h1><h3>s</h3>')).toContain('<h1>t</h1>');
    });

    it('保留代码块', () => {
      const out = sanitizeHtml('<pre><code>npm run build</code></pre>');
      expect(out).toContain('<pre>');
      expect(out).toContain('npm run build');
    });

    it('保留列表', () => {
      const out = sanitizeHtml('<ul><li>a</li><li>b</li></ul>');
      expect(out).toContain('<li>a</li>');
    });

    it('保留表格', () => {
      const out = sanitizeHtml('<table><thead><tr><th>h</th></tr></thead><tbody><tr><td>d</td></tr></tbody></table>');
      expect(out).toContain('<table>');
      expect(out).toContain('<th>h</th>');
    });

    it('保留 https 图片', () => {
      const out = sanitizeHtml('<img src="https://example.com/a.png" alt="a">');
      expect(out).toContain('https://example.com/a.png');
      expect(out).toContain('alt="a"');
    });

    it('保留 details/summary（Release 里常用于折叠更新日志）', () => {
      const out = sanitizeHtml('<details><summary>more</summary><p>x</p></details>');
      expect(out).toContain('<details>');
      expect(out).toContain('<summary>more</summary>');
    });
  });

  describe('外链改写（防应用自身被导航劫持）', () => {
    it('为 <a> 补上 target=_blank', () => {
      const out = sanitizeHtml('<a href="https://example.com">x</a>');
      expect(out).toContain('target="_blank"');
    });

    it('为 <a> 补上 rel=noopener noreferrer', () => {
      const out = sanitizeHtml('<a href="https://example.com">x</a>');
      expect(out).toContain('noopener');
      expect(out).toContain('noreferrer');
    });

    it('覆盖原本的 target=_self', () => {
      const out = sanitizeHtml('<a href="https://example.com" target="_self">x</a>');
      expect(out).toContain('target="_blank"');
      expect(out).not.toContain('_self');
    });
  });

  describe('任务列表复选框', () => {
    it('保留 checkbox 但强制 disabled', () => {
      const out = sanitizeHtml('<li><input type="checkbox" checked>done</li>');
      expect(out).toContain('type="checkbox"');
      expect(out).toContain('disabled');
    });

    it('移除非 checkbox 的 input（防伪造输入框钓鱼）', () => {
      const out = sanitizeHtml('<input type="password" name="p">');
      expect(out).not.toContain('type="password"');
    });
  });

  describe('边界输入', () => {
    it('空字符串返回空', () => {
      expect(sanitizeHtml('')).toBe('');
    });

    it('纯文本原样保留', () => {
      expect(sanitizeHtml('just text')).toContain('just text');
    });

    it('畸形 HTML 不抛异常', () => {
      expect(() => sanitizeHtml('<p><div><span>unclosed')).not.toThrow();
    });
  });
});

describe('escapeHtml', () => {
  it('转义 HTML 元字符', () => {
    expect(escapeHtml('<script>&"\'')).toBe('&lt;script&gt;&amp;&quot;&#39;');
  });

  it('转义后的内容不含可执行标签', () => {
    expect(escapeHtml('<img onerror=x>')).not.toContain('<img');
  });
});
