// 健壮性加固：shell.openExternal 协议白名单
//
// docs/features.md §11.5 声称所有 openExternal 调用都会校验协议，
// 实际只有 update.ts 做了。这些用例锁定统一收口后的行为。

import { describe, it, expect } from 'vitest';
import { assertSafeExternalUrl, isSafeExternalUrl } from '../../electron/lib/safeUrl';

describe('safeUrl', () => {
  describe('放行正常的 http/https', () => {
    const good = [
      'https://github.com/buxiaju/KunyaoGit',
      'http://example.com',
      'https://gitee.com/buxiaju/KunyaoGit/releases/tag/v0.6.0',
      'https://example.com:8443/path?a=1&b=2#frag',
    ];
    it.each(good)('%s', (url) => {
      expect(isSafeExternalUrl(url)).toBe(true);
    });

    it('返回标准化后的 URL', () => {
      const r = assertSafeExternalUrl('https://example.com');
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.data).toBe('https://example.com/');
    });

    it('容忍首尾空白', () => {
      expect(isSafeExternalUrl('  https://example.com  ')).toBe(true);
    });
  });

  describe('拒绝危险协议', () => {
    // file: 在 Windows 上可以被 shell.openExternal 用来拉起本地程序
    const bad = [
      'file:///C:/Windows/System32/cmd.exe',
      'file:///etc/passwd',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'ms-msdt:/id',
      'search-ms:query=x',
      'shell:startup',
      'about:blank',
      'chrome://settings',
      'ftp://example.com/x',
      'mailto:someone@example.com',
    ];
    it.each(bad)('%s', (url) => {
      expect(isSafeExternalUrl(url)).toBe(false);
    });

    it('给出包含协议名的错误信息', () => {
      const r = assertSafeExternalUrl('file:///C:/Windows/System32/cmd.exe');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain('file:');
    });
  });

  describe('拒绝绕过技巧', () => {
    it('大小写混写的 javascript: 仍被拒绝', () => {
      expect(isSafeExternalUrl('JaVaScRiPt:alert(1)')).toBe(false);
    });

    it('含换行的 java\\nscript: 被拒绝', () => {
      expect(isSafeExternalUrl('java\nscript:alert(1)')).toBe(false);
    });

    it('含制表符的协议被拒绝', () => {
      expect(isSafeExternalUrl('java\tscript:alert(1)')).toBe(false);
    });

    it('含 NUL 字节被拒绝', () => {
      expect(isSafeExternalUrl('https://example.com\0.evil.com')).toBe(false);
    });

    it('只有协议没有主机的 http:// 被拒绝', () => {
      // 注意：'http:///etc/passwd' 会被 WHATWG URL 规范化成 'http://etc/passwd'
      //（host=etc），那是一个结构合法的 http URL，不属于本校验要拦的对象。
      // 真正无主机的形态是裸 'http://'，URL 构造器会直接抛错。
      expect(isSafeExternalUrl('http://')).toBe(false);
      expect(isSafeExternalUrl('https://')).toBe(false);
    });
  });

  describe('拒绝非法输入', () => {
    it.each([null, undefined, 123, {}, [], '', '   ', 'not-a-url', '//example.com'])(
      '%s',
      (bad) => {
        expect(isSafeExternalUrl(bad as unknown)).toBe(false);
      }
    );
  });
});
