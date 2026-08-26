// 文件树构建（从 electron/ipc/fs.ts 抽出）
//
// 抽成独立模块的原因：fs.ts 需要 import electron 的 ipcMain，无法在单元测试里加载。
// 本模块只依赖 node:fs / node:path，与 lib/safePath.ts、lib/safeUrl.ts 保持一致，
// 便于直接测试——尤其是符号链接成环这类只能靠真实文件系统验证的分支。

import fs from 'node:fs/promises';
import path from 'node:path';
import type { FileTreeNode } from '../../shared/types';

export const DEFAULT_IGNORE = new Set([
  '.git',
  'node_modules',
  '.DS_Store',
  'dist',
  'build',
  'release',
  'target',
  '.next',
  '.nuxt',
]);

export interface BuildTreeOptions {
  /** 最大递归深度。 */
  depth?: number;
  /** 需要跳过的目录 / 文件名。 */
  ignore?: Set<string>;
}

/**
 * 递归构建文件树。
 *
 * 健壮性加固 P1 —— 符号链接成环保护：
 * 符号链接可以指向自己的祖先目录形成环。原实现只靠 depth<=5 兜底，
 * 虽不会真的无限递归，但环内每层都被重复展开，目录数随深度指数放大，
 * 大仓库上会明显拖慢文件树。这里按 realpath 去重，已访问过的真实目录不再深入。
 */
export async function buildFileTree(
  root: string,
  base: string = root,
  options: BuildTreeOptions = {}
): Promise<FileTreeNode[]> {
  const depth = options.depth ?? 5;
  const ignore = options.ignore ?? DEFAULT_IGNORE;
  return walk(root, base, depth, 0, ignore, new Set<string>());
}

async function walk(
  root: string,
  base: string,
  depth: number,
  current: number,
  ignore: Set<string>,
  visited: Set<string>
): Promise<FileTreeNode[]> {
  if (current >= depth) return [];

  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    // 权限不足 / 目录已被删除：当作空目录，不要让整棵树构建失败
    return [];
  }

  const nodes: FileTreeNode[] = [];

  for (const e of entries) {
    if (ignore.has(e.name)) continue;
    const full = path.join(root, e.name);
    const rel = path.relative(base, full);

    // 符号链接要单独处理：isDirectory() 对 symlink 返回 false，
    // 必须跟随链接 stat 才知道它指向目录还是文件。
    if (e.isSymbolicLink()) {
      let realTarget: string;
      let targetIsDir: boolean;
      try {
        realTarget = await fs.realpath(full);
        targetIsDir = (await fs.stat(full)).isDirectory();
      } catch {
        // 断链（目标已删除）：列为普通文件节点，不再深入
        nodes.push({ name: e.name, path: rel, type: 'file' });
        continue;
      }

      if (!targetIsDir) {
        nodes.push({ name: e.name, path: rel, type: 'file' });
        continue;
      }

      // 这个真实目录已经走过 → 成环，列出节点但不递归
      if (visited.has(realTarget)) {
        nodes.push({ name: e.name, path: rel, type: 'folder', children: [] });
        continue;
      }

      visited.add(realTarget);
      nodes.push({
        name: e.name,
        path: rel,
        type: 'folder',
        children: await walk(full, base, depth, current + 1, ignore, visited),
      });
      continue;
    }

    if (e.isDirectory()) {
      // 普通目录登记 realpath（这样后续「symlink 指向已遍历过的真实目录」能被识别），
      // 但**不**检查 visited —— 真实目录始终完整展开。
      //
      // 这是有意的取舍：readdir 的返回顺序不确定，如果某个符号链接先于真实目录
      // 被处理并占用了 visited 名额，再对普通目录做去重就会让真实目录显示为空，
      // 用户看到的是「文件夹里的东西不见了」，比多列一次糟糕得多。
      // 防环目标由符号链接侧的去重保证，展开次数有界（同一目录最多 2 次）。
      try {
        visited.add(await fs.realpath(full));
      } catch {
        /* 取不到 realpath 不影响主流程 */
      }
      nodes.push({
        name: e.name,
        path: rel,
        type: 'folder',
        children: await walk(full, base, depth, current + 1, ignore, visited),
      });
    } else if (e.isFile()) {
      nodes.push({ name: e.name, path: rel, type: 'file' });
    }
  }

  // 文件夹在前，同类按名称排序
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return nodes;
}
