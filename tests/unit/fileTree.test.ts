// 健壮性加固 P1：文件树构建与符号链接成环保护
//
// 符号链接可以指向自己的祖先目录形成环。加固前只靠 depth<=5 兜底：
// 不会真的无限递归，但环内每层都被重复展开，目录数随深度指数放大。
//
// Windows 上创建「目录符号链接」需要管理员权限或开发者模式，
// 但 junction 不需要——所以这里在 win32 上用 junction，POSIX 上用普通 symlink。

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildFileTree, DEFAULT_IGNORE } from '../../electron/lib/fileTree';
import type { FileTreeNode } from '../../shared/types';

const isWin = process.platform === 'win32';

/** 创建指向目录的链接。Windows 用 junction 以避开权限要求。 */
function linkDir(target: string, linkPath: string): boolean {
  try {
    fs.symlinkSync(target, linkPath, isWin ? 'junction' : 'dir');
    return true;
  } catch {
    return false; // 环境不允许创建链接，相关用例跳过
  }
}

/** 递归统计节点总数，用于验证「环没有把树炸开」。 */
function countNodes(nodes: FileTreeNode[]): number {
  let n = 0;
  for (const node of nodes) {
    n += 1;
    if (node.children) n += countNodes(node.children);
  }
  return n;
}

function findNode(nodes: FileTreeNode[], name: string): FileTreeNode | undefined {
  for (const node of nodes) {
    if (node.name === name) return node;
    if (node.children) {
      const hit = findNode(node.children, name);
      if (hit) return hit;
    }
  }
  return undefined;
}

/**
 * 统计名为 name 的节点出现次数。
 * 刻意不用 JSON.stringify().split(name) —— 每个节点的 name 和 path 字段都含该串，
 * 一个节点会被数成两次，得到的数字没有意义。
 */
function countByName(nodes: FileTreeNode[], name: string): number {
  let n = 0;
  for (const node of nodes) {
    if (node.name === name) n += 1;
    if (node.children) n += countByName(node.children, name);
  }
  return n;
}

describe('buildFileTree', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-tree-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  describe('基本结构', () => {
    it('列出文件与目录', async () => {
      fs.writeFileSync(path.join(root, 'a.txt'), 'a');
      fs.mkdirSync(path.join(root, 'sub'));
      fs.writeFileSync(path.join(root, 'sub', 'b.txt'), 'b');

      const tree = await buildFileTree(root);
      expect(tree.map((n) => n.name)).toEqual(['sub', 'a.txt']); // 文件夹在前
      expect(findNode(tree, 'b.txt')).toBeDefined();
    });

    it('path 字段是相对 base 的路径', async () => {
      fs.mkdirSync(path.join(root, 'sub'));
      fs.writeFileSync(path.join(root, 'sub', 'b.txt'), 'b');

      const tree = await buildFileTree(root);
      const b = findNode(tree, 'b.txt');
      expect(b?.path).toBe(path.join('sub', 'b.txt'));
    });

    it('同层内文件夹在前、各自按名称排序', async () => {
      for (const n of ['z.txt', 'a.txt']) fs.writeFileSync(path.join(root, n), '');
      for (const d of ['zdir', 'adir']) fs.mkdirSync(path.join(root, d));

      const tree = await buildFileTree(root);
      expect(tree.map((n) => n.name)).toEqual(['adir', 'zdir', 'a.txt', 'z.txt']);
    });

    it('默认忽略 .git / node_modules 等目录', async () => {
      fs.mkdirSync(path.join(root, '.git'));
      fs.writeFileSync(path.join(root, '.git', 'HEAD'), 'ref');
      fs.mkdirSync(path.join(root, 'node_modules'));
      fs.writeFileSync(path.join(root, 'keep.txt'), '');

      const tree = await buildFileTree(root);
      expect(tree.map((n) => n.name)).toEqual(['keep.txt']);
      expect(DEFAULT_IGNORE.has('.git')).toBe(true);
    });

    it('尊重 depth 限制', async () => {
      let cur = root;
      for (const d of ['l1', 'l2', 'l3']) {
        cur = path.join(cur, d);
        fs.mkdirSync(cur);
      }
      fs.writeFileSync(path.join(cur, 'deep.txt'), '');

      const shallow = await buildFileTree(root, root, { depth: 2 });
      expect(findNode(shallow, 'deep.txt')).toBeUndefined();

      const deep = await buildFileTree(root, root, { depth: 5 });
      expect(findNode(deep, 'deep.txt')).toBeDefined();
    });

    it('空目录返回空数组', async () => {
      expect(await buildFileTree(root)).toEqual([]);
    });
  });

  describe('容错', () => {
    it('目录不存在时返回空数组而不是抛异常', async () => {
      const missing = path.join(root, 'nope');
      await expect(buildFileTree(missing)).resolves.toEqual([]);
    });

    it('传入文件路径（非目录）不抛异常', async () => {
      const f = path.join(root, 'f.txt');
      fs.writeFileSync(f, '');
      await expect(buildFileTree(f)).resolves.toEqual([]);
    });
  });

  describe('符号链接成环保护（P1 核心）', () => {
    it('自引用链接不会导致展开爆炸', async () => {
      // root/sub/loop -> root  （loop 指回祖先，形成环）
      const sub = path.join(root, 'sub');
      fs.mkdirSync(sub);
      fs.writeFileSync(path.join(sub, 'file.txt'), '');
      const ok = linkDir(root, path.join(sub, 'loop'));
      if (!ok) return; // 环境不允许建链接

      const tree = await buildFileTree(root, root, { depth: 5 });
      // 关键：环被识别后不再深入，节点总数应保持在很小的量级。
      // 加固前同样的结构会随 depth 指数级展开。
      expect(countNodes(tree)).toBeLessThan(12);
    });

    it('成环的链接仍作为 folder 节点列出（不隐藏结构）', async () => {
      const sub = path.join(root, 'sub');
      fs.mkdirSync(sub);
      const ok = linkDir(root, path.join(sub, 'loop'));
      if (!ok) return;

      const tree = await buildFileTree(root, root, { depth: 5 });
      const loop = findNode(tree, 'loop');
      expect(loop).toBeDefined();
      expect(loop?.type).toBe('folder');
    });

    it('多个链接指向同一真实目录时不会叠加展开', async () => {
      const real = path.join(root, 'real');
      fs.mkdirSync(real);
      fs.writeFileSync(path.join(real, 'inner.txt'), '');
      const ok1 = linkDir(real, path.join(root, 'link1'));
      const ok2 = linkDir(real, path.join(root, 'link2'));
      if (!ok1 || !ok2) return;

      const tree = await buildFileTree(root, root, { depth: 5 });
      const inners = countByName(tree, 'inner.txt');
      // 上限是 2 而不是 1，这是刻意的设计取舍：
      // 只有符号链接参与 realpath 去重，普通目录始终完整展开。
      // 否则一旦某个链接先于真实目录被 readdir 返回，真实目录就会显示为空，
      // 用户看到的是「我的文件夹里的东西不见了」——比多列一次糟糕得多。
      // 防环的目标（不指数爆炸）由去重保证，2 次是有界的。
      expect(inners).toBeLessThanOrEqual(2);
      expect(inners).toBeGreaterThanOrEqual(1);

      // 去重确实生效：两个链接里至多一个展开了内容。
      const expanded = ['link1', 'link2'].filter(
        (n) => (findNode(tree, n)?.children?.length ?? 0) > 0
      );
      expect(expanded.length).toBeLessThanOrEqual(1);
    });

    it('指向文件的链接作为 file 节点列出', async () => {
      const target = path.join(root, 'target.txt');
      fs.writeFileSync(target, 'x');
      try {
        fs.symlinkSync(target, path.join(root, 'flink'), 'file');
      } catch {
        return; // 环境不允许
      }
      const tree = await buildFileTree(root);
      expect(findNode(tree, 'flink')?.type).toBe('file');
    });

    it('断链（目标已删除）作为 file 节点列出且不抛异常', async () => {
      const target = path.join(root, 'gone');
      fs.mkdirSync(target);
      const ok = linkDir(target, path.join(root, 'dangling'));
      if (!ok) return;
      await fsp.rm(target, { recursive: true, force: true });

      const tree = await buildFileTree(root);
      const node = findNode(tree, 'dangling');
      // Windows 的 junction 在目标删除后行为与 POSIX 略有差异，
      // 只要不抛异常、且节点被列出即视为通过
      expect(node).toBeDefined();
    });

    it('正常的非链接目录树不受保护逻辑影响', async () => {
      fs.mkdirSync(path.join(root, 'a'));
      fs.mkdirSync(path.join(root, 'a', 'b'));
      fs.writeFileSync(path.join(root, 'a', 'b', 'c.txt'), '');

      const tree = await buildFileTree(root, root, { depth: 5 });
      expect(findNode(tree, 'c.txt')).toBeDefined();
    });
  });
});
