// v0.6+ 极简 Markdown 渲染（用于 Release 描述）
// 使用 marked 解析为 HTML，输出通过 dangerouslySetInnerHTML 渲染。
//
// 安全说明：release body 来源是仓库所有者自己编写的 Markdown（信任源），
// 暂不做 HTML sanitize。如果未来允许非 owner 编辑 release body，应加
// DOMPurify 之类的白名单过滤（marked v9 已移除同步 sanitize API）。

import { useMemo } from 'react';
import { marked } from 'marked';

marked.setOptions({ breaks: true, gfm: true });

interface Props {
  source: string;
  className?: string;
}

export default function MarkdownBody({ source, className }: Props) {
  const html = useMemo(() => {
    if (!source) return '';
    try {
      return marked.parse(source, { async: false }) as string;
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

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
