// v0.4+ i18n 测试
// 1. 中英字典结构必须完全对齐（防止加了 zh 忘了 en）
// 2. t() 的插值 / 缺失 key 行为

import { describe, it, expect } from 'vitest';
import { zh } from '../../src/i18n/zh';
import { en } from '../../src/i18n/en';

/** 把嵌套对象拍平成 'a.b.c' 形式的 key 列表 */
function flattenKeys(obj: any, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...flattenKeys(v, full));
    } else {
      keys.push(full);
    }
  }
  return keys.sort();
}

/** 复刻 src/i18n/index.tsx 里的 getValue，用于纯函数测试 */
function getValue(obj: any, path: string): string {
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return path;
    cur = cur[p];
  }
  return typeof cur === 'string' ? cur : path;
}

/** 复刻 t() 的插值逻辑 */
function translate(dict: any, key: string, params?: Record<string, string | number>): string {
  let s = getValue(dict, key);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return s;
}

describe('i18n 字典完整性', () => {
  const zhKeys = flattenKeys(zh);
  const enKeys = flattenKeys(en);

  it('中英字典的 key 数量一致', () => {
    expect(enKeys.length).toBe(zhKeys.length);
  });

  it('en 不缺 zh 里有的 key', () => {
    const missing = zhKeys.filter((k) => !enKeys.includes(k));
    expect(missing, `en.ts 缺少这些 key: ${missing.join(', ')}`).toEqual([]);
  });

  it('zh 不缺 en 里有的 key', () => {
    const missing = enKeys.filter((k) => !zhKeys.includes(k));
    expect(missing, `zh.ts 缺少这些 key: ${missing.join(', ')}`).toEqual([]);
  });

  it('所有值都是非空字符串', () => {
    for (const k of zhKeys) {
      const v = getValue(zh, k);
      expect(typeof v, `zh.${k} 不是字符串`).toBe('string');
      expect(v.length, `zh.${k} 是空字符串`).toBeGreaterThan(0);
    }
    for (const k of enKeys) {
      const v = getValue(en, k);
      expect(typeof v, `en.${k} 不是字符串`).toBe('string');
      expect(v.length, `en.${k} 是空字符串`).toBeGreaterThan(0);
    }
  });

  it('中英同一 key 的插值占位符一致', () => {
    // 提取 {xxx} 形式的占位符
    const extractPlaceholders = (s: string) =>
      (s.match(/\{(\w+)\}/g) || []).sort().join(',');

    for (const k of zhKeys) {
      const zhVal = getValue(zh, k);
      const enVal = getValue(en, k);
      const zhPh = extractPlaceholders(zhVal);
      const enPh = extractPlaceholders(enVal);
      expect(
        enPh,
        `key "${k}" 的占位符不一致：zh="${zhVal}" (${zhPh}) vs en="${enVal}" (${enPh})`
      ).toBe(zhPh);
    }
  });
});

describe('i18n v0.4 新增段完整性', () => {
  const v04Sections = [
    'statusBar',
    'command',
    'cheatsheet',
    'stash',
    'commitActions',
    'createPR',
  ];

  for (const section of v04Sections) {
    it(`zh 包含 ${section} 段`, () => {
      expect((zh as any)[section], `zh.ts 缺少 ${section} 段`).toBeDefined();
      expect(typeof (zh as any)[section]).toBe('object');
    });

    it(`en 包含 ${section} 段`, () => {
      expect((en as any)[section], `en.ts 缺少 ${section} 段`).toBeDefined();
      expect(typeof (en as any)[section]).toBe('object');
    });
  }

  it('layout 段包含 v0.4 新增的快捷键入口 key', () => {
    expect((zh as any).layout.shortcuts).toBeDefined();
    expect((zh as any).layout.commands).toBeDefined();
    expect((en as any).layout.shortcuts).toBeDefined();
    expect((en as any).layout.commands).toBeDefined();
  });
});

describe('t() 插值行为', () => {
  it('单个占位符替换', () => {
    const r = translate(zh, 'statusBar.staged', { count: 3 });
    expect(r).toBe('已暂存 3');
    expect(r).not.toContain('{count}');
  });

  it('英文单个占位符替换', () => {
    const r = translate(en, 'statusBar.staged', { count: 5 });
    expect(r).toBe('Staged 5');
  });

  it('多个不同占位符替换', () => {
    const r = translate(zh, 'commitActions.cherryPickFailed', {
      hash: 'abc1234',
      error: '冲突',
    });
    expect(r).toContain('abc1234');
    expect(r).toContain('冲突');
    expect(r).not.toContain('{hash}');
    expect(r).not.toContain('{error}');
  });

  it('同一占位符出现多次时全部替换', () => {
    // 构造一个测试字典
    const dict = { test: { multi: '{x} 和 {x} 都要替换' } };
    const r = translate(dict, 'test.multi', { x: 'A' });
    expect(r).toBe('A 和 A 都要替换');
  });

  it('数字参数被转成字符串', () => {
    const r = translate(zh, 'statusBar.aheadTip', { count: 42 });
    expect(r).toContain('42');
  });

  it('未提供 params 时占位符保留原样', () => {
    const r = translate(zh, 'statusBar.staged');
    expect(r).toBe('已暂存 {count}');
  });

  it('缺失的 key 返回 key 本身（防止 undefined 显示）', () => {
    const r = translate(zh, 'nonexistent.key.path');
    expect(r).toBe('nonexistent.key.path');
  });

  it('指向对象而非字符串的 key 返回 key 本身', () => {
    const r = translate(zh, 'statusBar');
    expect(r).toBe('statusBar');
  });

  it('多余的 params 不影响结果', () => {
    const r = translate(zh, 'statusBar.staged', { count: 1, unused: 'x' });
    expect(r).toBe('已暂存 1');
  });
});
