// 外部 URL 协议白名单（健壮性加固）
//
// 背景：`docs/features.md §11.5` 声称「`shell.openExternal` 调用会校验 URL 协议
// （`/^https?:\/\//`）」，但实际只有 `electron/ipc/update.ts` 的 UPDATE_OPEN 做了校验，
// 另外三个入口全部裸传：
//   - electron/main.ts  setWindowOpenHandler
//   - electron/main.ts  app:open-external
//   - electron/ipc/repo.ts  APP_SHELL_OPEN
//
// 未校验的 shell.openExternal 在 Windows 上可以被喂入 `file:///C:/Windows/System32/cmd.exe`
// 之类的值，从而拉起本地程序。本模块统一收口协议白名单。
//
// 用 WHATWG URL 解析而不是正则：正则容易被 `java\nscript:`、前导空白、
// 大小写混写等变体绕过，URL 解析器会先做标准化再给出 protocol。
//
// 本模块刻意不 import electron，保持为纯函数，便于单元测试。

export type SafeUrlResult = { ok: true; data: string } | { ok: false; error: string };

/** 允许通过 shell.openExternal 打开的协议。 */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * 校验一个外部 URL 是否可以安全交给 shell.openExternal。
 * 成功时返回标准化后的 URL 字符串。
 */
export function assertSafeExternalUrl(input: unknown): SafeUrlResult {
  if (typeof input !== 'string' || input.trim() === '') {
    return { ok: false, error: 'URL 无效' };
  }

  const raw = input.trim();

  // 控制字符（含换行 / 制表 / NUL）可能被用于绕过校验，直接拒绝
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(raw)) {
    return { ok: false, error: 'URL 包含非法字符' };
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, error: 'URL 格式无法解析' };
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return { ok: false, error: `不允许的 URL 协议：${parsed.protocol}` };
  }

  // http(s) 必须有主机名，排除 `http:///etc/passwd` 这类畸形值
  if (!parsed.hostname) {
    return { ok: false, error: 'URL 缺少主机名' };
  }

  return { ok: true, data: parsed.toString() };
}

/** 布尔版本，方便在条件表达式里用。 */
export function isSafeExternalUrl(input: unknown): boolean {
  return assertSafeExternalUrl(input).ok;
}
