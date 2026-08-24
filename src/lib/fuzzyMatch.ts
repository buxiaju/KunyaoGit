// v0.5+ 简易 fuzzy 匹配（用于 Ctrl+P 文件搜索）
// 算法：顺序子序列匹配 + 字符权重
// 返回 { score, matchedIndices } 或 null（不匹配）

export interface FuzzyResult {
  score: number;
  /** 匹配的字符位置（用于 UI 高亮） */
  matchedIndices: number[];
}

/**
 * 对单个目标字符串做模糊匹配
 * @param query 用户输入（小写）
 * @param target 待匹配字符串（保留原大小写，匹配时 lowercase 比较）
 * @param outIndices 可选外部数组用于收集 matchedIndices
 */
export function fuzzyMatch(query: string, target: string): FuzzyResult | null {
  if (!query) return { score: 0, matchedIndices: [] };
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (!q.trim()) return { score: 0, matchedIndices: [] };

  let qi = 0;
  let score = 0;
  let consecutive = 0;
  let lastMatchedIdx = -2; // 不能等于 -1
  const matched: number[] = [];

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      matched.push(ti);
      // 连续字符加分
      if (ti === lastMatchedIdx + 1) {
        consecutive++;
        score += 5 + consecutive * 3;
      } else {
        consecutive = 0;
        score += 1;
      }
      // 路径分隔符后第一个字符加分（文件名开头 > 目录名）
      if (ti === 0 || target[ti - 1] === '/' || target[ti - 1] === '\\' || target[ti - 1] === '.') {
        score += 8;
      }
      // 完全匹配（小写相等）再加
      if (target[ti] === query[qi]) score += 1;
      lastMatchedIdx = ti;
      qi++;
    }
  }

  if (qi < q.length) return null; // 没匹配完
  // 越短的 target 越好（同等分数）
  score += Math.max(0, 30 - target.length) * 0.1;
  return { score, matchedIndices: matched };
}

/**
 * 对一组目标排序，返回 top N
 * @param query 用户输入
 * @param items 待匹配数组
 * @param getKey 提取匹配字符串
 * @param topN 返回前 N 个
 */
export function fuzzySearch<T>(
  query: string,
  items: T[],
  getKey: (item: T) => string,
  topN = 50,
): { item: T; result: FuzzyResult }[] {
  if (!query.trim()) return items.slice(0, topN).map((item) => ({ item, result: { score: 0, matchedIndices: [] } }));
  const results: { item: T; result: FuzzyResult }[] = [];
  for (const item of items) {
    const r = fuzzyMatch(query, getKey(item));
    if (r) results.push({ item, result: r });
  }
  results.sort((a, b) => b.result.score - a.result.score);
  return results.slice(0, topN);
}
