import { ipcMain } from 'electron';
import fs from 'node:fs/promises';
import { IPC } from '../../shared/ipc-channels';
import { assertSafePath } from '../lib/safePath';
import { buildFileTree } from '../lib/fileTree';

/**
 * FS_WRITE_BINARY 的入参上限（健壮性加固 P1）。
 *
 * 二进制内容以 `number[]` 走 IPC 结构化克隆，这是相当昂贵的传输形式：
 * JS 数组里每个元素按 double 计算，一个 10MB 的文件在传输期间两侧
 * 各自要占约 80MB 内存。原本完全没有上限，拖一个大文件进窗口
 * 就能把主进程内存顶爆。
 *
 * 10MB 覆盖拖拽上传的实际场景（图片、小附件），超出的引导用户走文件管理器。
 */
const MAX_BINARY_BYTES = 10 * 1024 * 1024;

export function registerFsHandlers() {
  // 所有 handler 统一先过 assertSafePath（健壮性加固）。
  //
  // 原本这些 handler 直接使用渲染层传入的路径，没有任何边界校验。
  // 渲染层 src/stores/repo.ts 里的 assertSafeRelPath 只约束「善意调用方」——
  // 被 XSS 的渲染进程可以绕过 store 直接调 window.gitgui.fs.delete('C:/')。
  // 校验必须在主进程侧完成，且是白名单式：只放行已打开仓库根内的路径。

  ipcMain.handle(IPC.FS_READ_DIR, async (_e, dirPath: string) => {
    const safe = assertSafePath(dirPath);
    if (!safe.ok) return { ok: false, error: safe.error };
    try {
      const entries = await fs.readdir(safe.data, { withFileTypes: true });
      return { ok: true, data: entries.map((e) => ({ name: e.name, isDir: e.isDirectory() })) };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC.FS_READ_FILE, async (_e, filePath: string) => {
    const safe = assertSafePath(filePath);
    if (!safe.ok) return { ok: false, error: safe.error };
    try {
      const stat = await fs.stat(safe.data);
      if (stat.size > 5 * 1024 * 1024) {
        return { ok: false, error: '文件过大（>5MB），请在外部编辑器打开' };
      }
      const content = await fs.readFile(safe.data, 'utf-8');
      return { ok: true, data: { content, size: stat.size } };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC.FS_WRITE_FILE, async (_e, { path: filePath, content }: { path: string; content: string }) => {
    const safe = assertSafePath(filePath);
    if (!safe.ok) return { ok: false, error: safe.error };
    if (typeof content !== 'string') return { ok: false, error: '写入内容无效' };
    try {
      await fs.writeFile(safe.data, content, 'utf-8');
      return { ok: true, data: undefined };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC.FS_FILE_TREE, async (_e, { path: root, depth = 5 }: { path: string; depth?: number }) => {
    const safe = assertSafePath(root);
    if (!safe.ok) return { ok: false, error: safe.error };
    try {
      const tree = await buildFileTree(safe.data, safe.data, { depth });
      return { ok: true, data: tree };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC.FS_DELETE, async (_e, target: string) => {
    const safe = assertSafePath(target);
    if (!safe.ok) return { ok: false, error: safe.error };
    try {
      const stat = await fs.stat(safe.data);
      if (stat.isDirectory()) await fs.rm(safe.data, { recursive: true, force: true });
      else await fs.unlink(safe.data);
      return { ok: true, data: undefined };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC.FS_RENAME, async (_e, { oldPath, newPath }: { oldPath: string; newPath: string }) => {
    // 两端都必须落在允许范围内，防止把仓库内文件搬运到仓库外
    const safeOld = assertSafePath(oldPath);
    if (!safeOld.ok) return { ok: false, error: safeOld.error };
    const safeNew = assertSafePath(newPath);
    if (!safeNew.ok) return { ok: false, error: safeNew.error };
    try {
      await fs.rename(safeOld.data, safeNew.data);
      return { ok: true, data: undefined };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC.FS_WRITE_BINARY, async (_e, { path: filePath, content }: { path: string; content: number[] }) => {
    const safe = assertSafePath(filePath);
    if (!safe.ok) return { ok: false, error: safe.error };
    if (!Array.isArray(content)) return { ok: false, error: '写入内容无效' };
    if (content.length > MAX_BINARY_BYTES) {
      const mb = (content.length / 1024 / 1024).toFixed(1);
      return {
        ok: false,
        error: `文件过大（${mb}MB，上限 10MB），请直接复制到仓库目录`,
      };
    }
    try {
      await fs.writeFile(safe.data, Buffer.from(content));
      return { ok: true, data: undefined };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC.FS_MKDIR_P, async (_e, dirPath: string) => {
    const safe = assertSafePath(dirPath);
    if (!safe.ok) return { ok: false, error: safe.error };
    try {
      await fs.mkdir(safe.data, { recursive: true });
      return { ok: true, data: undefined };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });
}
