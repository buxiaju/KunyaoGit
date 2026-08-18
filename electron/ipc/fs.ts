import { ipcMain } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { IPC } from '../../shared/ipc-channels';
import type { FileTreeNode } from '../../shared/types';

const IGNORE = new Set(['.git', 'node_modules', '.DS_Store', 'dist', 'build', 'release', 'target', '.next', '.nuxt']);

async function buildTree(root: string, base: string, depth: number, current = 0): Promise<FileTreeNode[]> {
  if (current >= depth) return [];
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const nodes: FileTreeNode[] = [];
  for (const e of entries) {
    if (IGNORE.has(e.name)) continue;
    const full = path.join(root, e.name);
    const rel = path.relative(base, full);
    if (e.isDirectory()) {
      const children = await buildTree(full, base, depth, current + 1);
      nodes.push({ name: e.name, path: rel, type: 'folder', children });
    } else if (e.isFile()) {
      nodes.push({ name: e.name, path: rel, type: 'file' });
    }
  }
  // 文件夹在前
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return nodes;
}

export function registerFsHandlers() {
  ipcMain.handle(IPC.FS_READ_DIR, async (_e, dirPath: string) => {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      return { ok: true, data: entries.map((e) => ({ name: e.name, isDir: e.isDirectory() })) };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC.FS_READ_FILE, async (_e, filePath: string) => {
    try {
      const stat = await fs.stat(filePath);
      if (stat.size > 5 * 1024 * 1024) {
        return { ok: false, error: '文件过大（>5MB），请在外部编辑器打开' };
      }
      const content = await fs.readFile(filePath, 'utf-8');
      return { ok: true, data: { content, size: stat.size } };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC.FS_WRITE_FILE, async (_e, { path: filePath, content }: { path: string; content: string }) => {
    try {
      await fs.writeFile(filePath, content, 'utf-8');
      return { ok: true, data: undefined };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC.FS_FILE_TREE, async (_e, { path: root, depth = 5 }: { path: string; depth?: number }) => {
    try {
      const tree = await buildTree(root, root, depth);
      return { ok: true, data: tree };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC.FS_DELETE, async (_e, target: string) => {
    try {
      const stat = await fs.stat(target);
      if (stat.isDirectory()) await fs.rm(target, { recursive: true, force: true });
      else await fs.unlink(target);
      return { ok: true, data: undefined };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC.FS_RENAME, async (_e, { oldPath, newPath }: { oldPath: string; newPath: string }) => {
    try {
      await fs.rename(oldPath, newPath);
      return { ok: true, data: undefined };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC.FS_WRITE_BINARY, async (_e, { path, content }: { path: string; content: number[] }) => {
    try {
      await fs.writeFile(path, Buffer.from(content));
      return { ok: true, data: undefined };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC.FS_MKDIR_P, async (_e, dirPath: string) => {
    try {
      await fs.mkdir(dirPath, { recursive: true });
      return { ok: true, data: undefined };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });
}
