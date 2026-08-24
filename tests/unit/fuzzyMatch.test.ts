// v0.5+ fuzzyMatch 工具测试
// 覆盖：单字符串匹配 / 搜索排序 / 大小写不敏感 / 不匹配返回 null

import { describe, it, expect } from 'vitest';
import { fuzzyMatch, fuzzySearch } from '../../src/lib/fuzzyMatch';

describe('fuzzyMatch', () => {
  it('空 query 返回 score=0 不空 matchedIndices', () => {
    const r = fuzzyMatch('', 'src/index.ts');
    expect(r).not.toBeNull();
    expect(r!.score).toBe(0);
    expect(r!.matchedIndices).toEqual([]);
  });

  it('空 query + 空 target 不抛错', () => {
    const r = fuzzyMatch('', '');
    expect(r).not.toBeNull();
    expect(r!.score).toBe(0);
  });

  it('完整子序列匹配返回 matchedIndices', () => {
    const r = fuzzyMatch('si', 'src/index.ts');
    expect(r).not.toBeNull();
    expect(r!.matchedIndices).toEqual([0, 4]); // s @ 0, i @ 4
  });

  it('大小写不敏感', () => {
    const r1 = fuzzyMatch('SI', 'src/index.ts');
    const r2 = fuzzyMatch('si', 'src/index.ts');
    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();
    expect(r1!.matchedIndices).toEqual(r2!.matchedIndices);
  });

  it('路径分隔符后首字母加分（文件名开头 > 目录名）', () => {
    const r1 = fuzzyMatch('a', 'aaa/b.ts');
    const r2 = fuzzyMatch('a', 'a.ts');
    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();
    // r2 首字母是 a，r1 首字母是 a 但位于位置 0 / r1 在 b.ts 中的 a 是位置 4
    // r2 分数应 >= r1（短路径 + 首字母加分）
    expect(r2!.score).toBeGreaterThan(r1!.score);
  });

  it('连续字符加分 > 不连续', () => {
    const r1 = fuzzyMatch('abc', 'abc.ts');
    const r2 = fuzzyMatch('abc', 'axbxc.ts');
    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();
    expect(r1!.score).toBeGreaterThan(r2!.score);
  });

  it('字符不匹配返回 null', () => {
    const r = fuzzyMatch('xyz', 'src/index.ts');
    expect(r).toBeNull();
  });

  it('query 顺序必须与 target 顺序一致（不乱序）', () => {
    // "ba" 在 "ab" 里按字符 b 应在 a 之后，不能匹配
    const r = fuzzyMatch('ba', 'ab');
    expect(r).toBeNull();
  });
});

describe('fuzzySearch', () => {
  const items = [
    'src/components/Button.tsx',
    'src/components/Input.tsx',
    'src/utils/helper.ts',
    'package.json',
    'README.md',
    'src/index.ts',
  ];

  it('空 query 返回前 N 个原顺序', () => {
    const r = fuzzySearch('', items, (x) => x, 3);
    expect(r.map((x) => x.item)).toEqual(items.slice(0, 3));
  });

  it('按分数降序返回 topN', () => {
    const r = fuzzySearch('btn', items, (x) => x, 10);
    // Button.tsx 包含 'btn'（b@20 t@21 n@22），应排第一
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].item).toBe('src/components/Button.tsx');
  });

  it('topN 限制', () => {
    const r = fuzzySearch('s', items, (x) => x, 2);
    expect(r.length).toBe(2);
  });

  it('不匹配时返回空数组', () => {
    const r = fuzzySearch('xyz123', items, (x) => x, 10);
    expect(r).toEqual([]);
  });

  it('getKey 可自定义（用 basename 而不是全路径）', () => {
    const r = fuzzySearch('btn', items, (x) => x.split('/').pop()!, 10);
    expect(r[0].item).toBe('src/components/Button.tsx');
  });

  it('返回 matchedIndices 给 UI 用于高亮', () => {
    const r = fuzzySearch('btn', items, (x) => x, 10);
    expect(r[0].result.matchedIndices.length).toBe(3); // b, t, n
  });
});
