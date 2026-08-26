// v0.6+ 极简 Markdown 渲染（用于 Release 描述）
// 使用 marked 解析为 HTML，经 DOMPurify 白名单净化后再交给 dangerouslySetInnerHTML。
//
// 安全说明（v0.6 加固）：
// release body 是**不可信的远程输入** —— RemotePage 可以浏览任意公开仓库的 Release，
// 内容并非只来自当前用户。因此这里必须做 HTML sanitize，不能依赖「信任发布者」。
// 净化规则与外链改写逻辑见 src/lib/sanitizeHtml.ts。

import { useMemo } from 'react';
import { marked } from 'marked';
import { sanitizeHtml, escapeHtml } from '../../lib/sanitizeHtml';

marked.setOptions({ breaks: true, gfm: true });

interface Props {
  source: string;
  className?: string;
}

export default function MarkdownBody({ source, className }: Props) {
  const html = useMemo(() => {
    if (!source) return '';
    try {
      const raw = marked.parse(source, { async: false }) as string;
      return sanitizeHtml(raw);
    } catch {
      return `<pre>${escapeHtml(source)}</pre>`;
    }
  }, [source]);
  return (
    <div
      className={`markdown-body text-sm leading-relaxed ${className || ''}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
