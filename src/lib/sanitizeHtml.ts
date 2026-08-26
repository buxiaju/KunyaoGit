// Markdown / HTML 净化（健壮性加固 · 安全）
//
// 背景：`MarkdownBody.tsx` 原本把 marked 的输出直接交给 dangerouslySetInnerHTML，
// 完全没有过滤，注释里的理由是「release body 来源是仓库所有者自己编写（信任源）」。
//
// 这个假设不成立：RemotePage 可以搜索并浏览**任意公开仓库**的 Release，
// 因此 release body 是不可信的远程输入。配合原先 `electron/ipc/fs.ts` 零路径校验，
// 一段 `<img src=x onerror="window.gitgui.fs.delete('C:/')">` 就能构成
// 「浏览别人的仓库 → 任意文件删除」的完整攻击链。
//
// ---------------------------------------------------------------------------
// 为什么不无条件信任 DOMPurify
// ---------------------------------------------------------------------------
// 实测发现：DOMPurify 3.4.14 在 happy-dom（本项目的测试环境）下会**静默失效**，
// 且失效方式是最危险的组合 —— 合法标签被剥离、而 <script> 被原样保留：
//
//     happy-dom: '<p>hi</p><script>alert(1)</script>' → 'hi<script>alert(1)</script>'
//     jsdom    : '<p>hi</p><script>alert(1)</script>' → '<p>hi</p>'
//
// 此时 DOMPurify.isSupported 仍然是 true，所以无法靠它自报状态判断。
// 生产环境是 Electron/Chromium，DOMPurify 正常工作；但「安全依赖第三方库在
// 特定 DOM 实现下的正确性」本身就是脆弱假设。因此这里加一道启动自检：
// 用探针验证 DOMPurify 是否真的在过滤，失效则整体降级为纯文本转义。
// 宁可显示得难看，也不放过 XSS。

import DOMPurify from 'dompurify';

/** Markdown 渲染产物中允许出现的标签。 */
const ALLOWED_TAGS = [
  'p', 'br', 'hr', 'span', 'div',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'b', 'em', 'i', 'del', 's', 'u', 'sup', 'sub', 'small',
  'code', 'pre', 'kbd', 'samp',
  'blockquote', 'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'a', 'img',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
  'details', 'summary',
  // GFM 任务列表会生成 <input type="checkbox" disabled>
  'input',
];

const ALLOWED_ATTR = [
  'href', 'src', 'alt', 'title', 'class', 'id', 'align',
  'colspan', 'rowspan', 'start', 'reversed',
  'type', 'checked', 'disabled',
  'target', 'rel', 'width', 'height',
];

const PURIFY_CONFIG = {
  ALLOWED_TAGS,
  ALLOWED_ATTR,
  ALLOW_DATA_ATTR: false,
  // 明确禁止这些高危标签，即使将来有人往白名单里加错东西
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'link', 'meta', 'base'],
  FORBID_ATTR: ['srcset', 'formaction', 'action', 'style'],
};

/**
 * 输出侧强特征自检。
 *
 * 只检测「危险标签」这类**不会误报**的特征：DOMPurify 正常工作时，
 * 合法文本内容中的 `<` 一定已被转义成 `&lt;`，所以真正的 `<script` 只可能
 * 来自过滤失效。
 *
 * 刻意**不**检测 `on\w+=` 或 `javascript:` —— Release 说明里讨论 HTML 事件属性
 * 的代码块（`` `onclick=x` ``）会原样出现这些字样，检测它们会造成大量误报。
 * 这两类真实攻击载荷必须依附于标签或属性位置，已被白名单机制覆盖。
 */
const DANGEROUS_TAG_RE = /<\s*\/?\s*(script|iframe|object|embed|form|link|meta|base|svg|math)\b/i;

let healthy: boolean | null = null;
let hooksInstalled = false;

/**
 * 探测 DOMPurify 在当前运行环境下是否真的具备过滤能力。
 * 结果缓存，只探测一次。
 */
export function isSanitizerHealthy(): boolean {
  if (healthy !== null) return healthy;
  try {
    if (typeof DOMPurify.sanitize !== 'function') {
      healthy = false;
      return healthy;
    }
    const probe = DOMPurify.sanitize('<p>probe</p><script>danger()</script>', {
      ALLOWED_TAGS: ['p'],
      ALLOWED_ATTR: [],
    });
    // 必须同时满足：危险标签被移除，且合法标签被保留
    healthy = !DANGEROUS_TAG_RE.test(probe) && probe.includes('<p>probe</p>');
    if (!healthy) {
      console.warn(
        '[sanitizeHtml] DOMPurify 在当前环境下未能正常过滤，已降级为纯文本渲染。' +
          ` 探针输出：${probe}`
      );
    }
  } catch (e) {
    healthy = false;
    console.warn(`[sanitizeHtml] DOMPurify 探测异常，已降级为纯文本渲染：${(e as Error).message}`);
  }
  return healthy;
}

/** 测试用：重置探测缓存与 hook 状态。 */
export function resetSanitizerState(): void {
  healthy = null;
}

function installHooks() {
  if (hooksInstalled) return;
  if (typeof DOMPurify.addHook !== 'function') return;
  hooksInstalled = true;

  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.nodeName === 'A') {
      const el = node as unknown as HTMLAnchorElement;
      // 强制外链在系统浏览器打开。
      // 否则在 Electron 里点击 <a> 会让**整个应用**导航到外部站点
      // （应用直接变成浏览器且无法返回）。加了 target=_blank 之后会走
      // main.ts 的 setWindowOpenHandler，最终由 openExternalSafely 转交系统浏览器。
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener noreferrer');
    }
    if (node.nodeName === 'INPUT') {
      const el = node as unknown as HTMLInputElement;
      // 只容许任务列表的复选框，其余 input 一律移除（防伪造输入框钓鱼）
      if (el.getAttribute('type') !== 'checkbox') {
        el.remove();
        return;
      }
      el.setAttribute('disabled', 'disabled');
    }
  });
}

/** 最小 HTML 转义，作为净化不可用时的降级方案。 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 净化 HTML 字符串。
 *
 * 三层保障：
 *   1. 启动自检（isSanitizerHealthy）——环境不可靠时直接走纯文本；
 *   2. DOMPurify 白名单过滤 + 外链改写 hook；
 *   3. 输出侧强特征复查——万一仍有危险标签漏出，退回纯文本。
 */
export function sanitizeHtml(html: string): string {
  if (!html) return '';

  if (!isSanitizerHealthy()) {
    return `<pre>${escapeHtml(html)}</pre>`;
  }

  installHooks();

  let clean: string;
  try {
    clean = DOMPurify.sanitize(html, PURIFY_CONFIG);
  } catch (e) {
    console.warn(`[sanitizeHtml] 净化过程异常，降级为纯文本：${(e as Error).message}`);
    return `<pre>${escapeHtml(html)}</pre>`;
  }

  if (DANGEROUS_TAG_RE.test(clean)) {
    console.warn('[sanitizeHtml] 净化后仍检出危险标签，降级为纯文本渲染。');
    return `<pre>${escapeHtml(html)}</pre>`;
  }

  return clean;
}
