// v0.4+ parseUnifiedDiff 单元测试
// 纯函数，直接测：unified diff 文本 → FileDiff[]

import { describe, it, expect } from 'vitest';
import { parseUnifiedDiff } from '../../electron/services/git';

describe('parseUnifiedDiff', () => {
  it('空输入返回空数组', () => {
    expect(parseUnifiedDiff('')).toEqual([]);
    expect(parseUnifiedDiff('   ')).toEqual([]);
  });

  it('解析单文件单 hunk 的简单修改', () => {
    const diff = `diff --git a/src/foo.ts b/src/foo.ts
index 1234567..89abcde 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,3 +1,4 @@
 const a = 1;
-const b = 2;
+const b = 3;
+const c = 4;
 export { a };
`;
    const r = parseUnifiedDiff(diff);
    expect(r).toHaveLength(1);
    expect(r[0].path).toBe('src/foo.ts');
    expect(r[0].isBinary).toBeFalsy();
    expect(r[0].hunks).toHaveLength(1);

    const lines = r[0].hunks[0].lines;
    // 1 context + 1 del + 2 add + 1 context
    expect(lines.filter((l) => l.type === 'add')).toHaveLength(2);
    expect(lines.filter((l) => l.type === 'del')).toHaveLength(1);
    expect(lines.filter((l) => l.type === 'context')).toHaveLength(2);
  });

  it('解析多文件 diff', () => {
    const diff = `diff --git a/a.ts b/a.ts
index 111..222 100644
--- a/a.ts
+++ b/a.ts
@@ -1 +1 @@
-old
+new
diff --git a/b.ts b/b.ts
index 333..444 100644
--- a/b.ts
+++ b/b.ts
@@ -1 +1 @@
-foo
+bar
`;
    const r = parseUnifiedDiff(diff);
    expect(r).toHaveLength(2);
    expect(r[0].path).toBe('a.ts');
    expect(r[1].path).toBe('b.ts');
  });

  it('解析多 hunk', () => {
    const diff = `diff --git a/foo.ts b/foo.ts
index 111..222 100644
--- a/foo.ts
+++ b/foo.ts
@@ -1,3 +1,3 @@
 line1
-line2
+line2-changed
@@ -20,3 +20,3 @@
 line20
-line21
+line21-changed
`;
    const r = parseUnifiedDiff(diff);
    expect(r).toHaveLength(1);
    expect(r[0].hunks).toHaveLength(2);
  });

  it('识别二进制文件', () => {
    const diff = `diff --git a/logo.png b/logo.png
index 111..222 100644
Binary files a/logo.png and b/logo.png differ
`;
    const r = parseUnifiedDiff(diff);
    expect(r).toHaveLength(1);
    expect(r[0].path).toBe('logo.png');
    expect(r[0].isBinary).toBe(true);
  });

  it('解析新增文件（/dev/null → 文件）', () => {
    const diff = `diff --git a/new.ts b/new.ts
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/new.ts
@@ -0,0 +1,2 @@
+line1
+line2
`;
    const r = parseUnifiedDiff(diff);
    expect(r).toHaveLength(1);
    expect(r[0].path).toBe('new.ts');
    expect(r[0].hunks[0].lines.filter((l) => l.type === 'add')).toHaveLength(2);
  });

  it('解析删除文件（文件 → /dev/null）', () => {
    const diff = `diff --git a/gone.ts b/gone.ts
deleted file mode 100644
index 1234567..0000000
--- a/gone.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-line1
-line2
`;
    const r = parseUnifiedDiff(diff);
    expect(r).toHaveLength(1);
    expect(r[0].hunks[0].lines.filter((l) => l.type === 'del')).toHaveLength(2);
  });

  it('路径含空格', () => {
    const diff = `diff --git a/my folder/file name.ts b/my folder/file name.ts
index 111..222 100644
--- a/my folder/file name.ts
+++ b/my folder/file name.ts
@@ -1 +1 @@
-a
+b
`;
    const r = parseUnifiedDiff(diff);
    expect(r).toHaveLength(1);
    // 至少要能解析出来，不能崩
    expect(r[0].path).toContain('file name.ts');
  });

  it('hunk header 的行号被正确解析', () => {
    const diff = `diff --git a/foo.ts b/foo.ts
index 111..222 100644
--- a/foo.ts
+++ b/foo.ts
@@ -10,5 +12,6 @@ function foo() {
 ctx
-del
+add1
+add2
 ctx2
`;
    const r = parseUnifiedDiff(diff);
    const h = r[0].hunks[0];
    expect(h.oldStart).toBe(10);
    expect(h.newStart).toBe(12);
  });

  it('无 hunk 的 diff（仅 mode 变化）不产生崩溃', () => {
    const diff = `diff --git a/script.sh b/script.sh
old mode 100644
new mode 100755
`;
    const r = parseUnifiedDiff(diff);
    // 可能返回 1 个无 hunk 的条目，或 0 个 —— 只要不抛异常
    expect(Array.isArray(r)).toBe(true);
  });

  it('CRLF 换行不影响解析', () => {
    const diff =
      'diff --git a/foo.ts b/foo.ts\r\n' +
      'index 111..222 100644\r\n' +
      '--- a/foo.ts\r\n' +
      '+++ b/foo.ts\r\n' +
      '@@ -1 +1 @@\r\n' +
      '-old\r\n' +
      '+new\r\n';
    const r = parseUnifiedDiff(diff);
    expect(r).toHaveLength(1);
    expect(r[0].path).toBe('foo.ts');
  });
});
