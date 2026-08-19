import { create } from 'zustand';
import type { RepoInfo, CommitInfo, BranchInfo, FileStatus, FileTreeNode, FileDiff, RemoteInfo } from '../../shared/types';

interface RepoState {
  current: RepoInfo | null;
  recents: RepoInfo[];
  status: FileStatus[];
  log: CommitInfo[];
  branches: BranchInfo[];
  fileTree: FileTreeNode[];
  selectedFile: string | null;
  currentDiff: FileDiff | null;
  remotes: RemoteInfo[];

  // 编辑器状态
  fileContent: string | null;
  fileDirty: boolean;
  fileLoading: boolean;

  // 文件管理动作（新建 / 删除 / 重命名）
  createFile: (relPath: string, content?: string) => Promise<{ ok: boolean; error?: string }>;
  createFolder: (relPath: string) => Promise<{ ok: boolean; error?: string }>;
  deleteNode: (relPath: string) => Promise<{ ok: boolean; error?: string }>;
  renameNode: (oldRel: string, newRel: string) => Promise<{ ok: boolean; error?: string }>;

  // 加载动作
  loadRecents: () => Promise<void>;
  openRepo: (path: string) => Promise<{ ok: boolean; error?: string }>;
  openRepoDialog: () => Promise<void>;
  closeRepo: () => void;
  removeRecent: (path: string) => Promise<void>;
  refreshAll: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  refreshLog: (branch?: string) => Promise<void>;
  refreshBranches: () => Promise<void>;
  refreshFileTree: () => Promise<void>;
  refreshRemotes: () => Promise<void>;
  selectFile: (file: string) => Promise<void>;
  selectFileForEdit: (file: string) => void;
  loadFile: (path: string) => Promise<void>;
  setFileContent: (content: string) => void;
  saveFile: (path: string) => Promise<{ ok: boolean; error?: string }>;
  closeFile: () => void;
}

export const useRepoStore = create<RepoState>((set, get) => ({
  current: null,
  recents: [],
  status: [],
  log: [],
  branches: [],
  fileTree: [],
  selectedFile: null,
  currentDiff: null,
  remotes: [],
  fileContent: null,
  fileDirty: false,
  fileLoading: false,

  loadRecents: async () => {
    const r = await window.gitgui.repo.listRecent();
    if (r.ok) set({ recents: r.data });
  },

  openRepo: async (path) => {
    const r = await window.gitgui.repo.open(path);
    if (!r.ok) return { ok: false, error: r.error };
    set({ current: r.data, selectedFile: null, currentDiff: null });
    await get().loadRecents();
    await get().refreshAll();
    return { ok: true };
  },

  openRepoDialog: async () => {
    const p = await window.gitgui.repo.openDialog();
    if (p) await get().openRepo(p);
  },

  closeRepo: () => {
    set({
      current: null,
      status: [],
      log: [],
      branches: [],
      fileTree: [],
      selectedFile: null,
      currentDiff: null,
      remotes: [],
      fileContent: null,
      fileDirty: false,
      fileLoading: false,
    });
  },

  removeRecent: async (path) => {
    await window.gitgui.repo.removeRecent(path);
    set({ recents: get().recents.filter((r) => r.path !== path) });
  },

  refreshAll: async () => {
    await Promise.all([
      get().refreshStatus(),
      get().refreshLog(),
      get().refreshBranches(),
      get().refreshFileTree(),
      get().refreshRemotes(),
    ]);
  },

  refreshStatus: async () => {
    const c = get().current;
    if (!c) return;
    const r = await window.gitgui.git.status(c.path);
    if (r.ok) set({ status: r.data });
  },

  refreshLog: async (branch) => {
    const c = get().current;
    if (!c) return;
    const r = await window.gitgui.git.log(c.path, { maxCount: 200, branch });
    if (r.ok) set({ log: r.data });
  },

  refreshBranches: async () => {
    const c = get().current;
    if (!c) return;
    const r = await window.gitgui.git.branches(c.path);
    if (r.ok) set({ branches: r.data });
  },

  refreshFileTree: async () => {
    const c = get().current;
    if (!c) return;
    const r = await window.gitgui.fs.fileTree(c.path, 4);
    if (r.ok) set({ fileTree: r.data });
  },

  refreshRemotes: async () => {
    const c = get().current;
    if (!c) return;
    const r = await window.gitgui.git.remoteList(c.path);
    if (r.ok) set({ remotes: r.data });
  },

  selectFile: async (file) => {
    const c = get().current;
    if (!c) return;
    set({ selectedFile: file });
    const r = await window.gitgui.git.diffFile(c.path, file);
    if (r.ok) set({ currentDiff: r.data });
  },

  selectFileForEdit: (file: string) => {
    set({ selectedFile: file, fileContent: null, fileDirty: false, currentDiff: null });
  },

  loadFile: async (path) => {
    const c = get().current;
    if (!c) return;
    set({ fileLoading: true, fileContent: null, fileDirty: false });
    const r = await window.gitgui.fs.readFile(pathJoin(c.path, path));
    if (r.ok) {
      set({ fileContent: (r.data as any).content, fileLoading: false });
    } else {
      set({ fileLoading: false });
    }
  },

  setFileContent: (content) => {
    const { fileContent } = get();
    if (fileContent === content) return;
    set({ fileContent: content, fileDirty: true });
  },

  saveFile: async (path) => {
    const c = get().current;
    if (!c) return { ok: false, error: '没有打开的仓库' };
    const { fileContent } = get();
    if (fileContent == null) return { ok: false, error: '没有内容' };
    const r = await window.gitgui.fs.writeFile(pathJoin(c.path, path), fileContent);
    if (r.ok) set({ fileDirty: false });
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  },

  closeFile: () => {
    const { fileDirty } = get();
    if (fileDirty) {
      if (!confirm('有未保存的修改，确定关闭？')) return;
    }
    set({ selectedFile: null, fileContent: null, fileDirty: false, currentDiff: null });
  },

  createFile: async (relPath, content = '') => {
    const c = get().current;
    if (!c) return { ok: false, error: '没有打开的仓库' };
    const safe = assertSafeRelPath(relPath);
    if (!safe.ok) return safe;
    const full = pathJoin(c.path, relPath);
    const parent = full.substring(0, full.lastIndexOf('/'));
    const mk = await window.gitgui.fs.mkdirp(parent);
    if (!mk.ok) return { ok: false, error: mk.error };
    const w = await window.gitgui.fs.writeFile(full, content);
    if (!w.ok) return { ok: false, error: w.error };
    await Promise.all([get().refreshFileTree(), get().refreshStatus()]);
    // 新文件默认在编辑器中打开
    set({ selectedFile: relPath, fileContent: content, fileDirty: false, currentDiff: null });
    return { ok: true };
  },

  createFolder: async (relPath) => {
    const c = get().current;
    if (!c) return { ok: false, error: '没有打开的仓库' };
    const safe = assertSafeRelPath(relPath);
    if (!safe.ok) return safe;
    const mk = await window.gitgui.fs.mkdirp(pathJoin(c.path, relPath));
    if (!mk.ok) return { ok: false, error: mk.error };
    await Promise.all([get().refreshFileTree(), get().refreshStatus()]);
    return { ok: true };
  },

  deleteNode: async (relPath) => {
    const c = get().current;
    if (!c) return { ok: false, error: '没有打开的仓库' };
    const safe = assertSafeRelPath(relPath);
    if (!safe.ok) return safe;
    const d = await window.gitgui.fs.delete(pathJoin(c.path, relPath));
    if (!d.ok) return { ok: false, error: d.error };
    // 若删除的正是编辑器中打开的文件，关闭编辑器
    const st = get();
    if (st.selectedFile === relPath) {
      set({ selectedFile: null, fileContent: null, fileDirty: false, currentDiff: null });
    }
    await Promise.all([get().refreshFileTree(), get().refreshStatus()]);
    return { ok: true };
  },

  renameNode: async (oldRel, newRel) => {
    const c = get().current;
    if (!c) return { ok: false, error: '没有打开的仓库' };
    const safeOld = assertSafeRelPath(oldRel);
    if (!safeOld.ok) return safeOld;
    const safeNew = assertSafeRelPath(newRel);
    if (!safeNew.ok) return safeNew;
    const parent = newRel.substring(0, newRel.lastIndexOf('/'));
    const mk = await window.gitgui.fs.mkdirp(pathJoin(c.path, parent));
    if (!mk.ok) return { ok: false, error: mk.error };
    const r = await window.gitgui.fs.rename(pathJoin(c.path, oldRel), pathJoin(c.path, newRel));
    if (!r.ok) return { ok: false, error: r.error };
    // 正在编辑的重命名文件跟随新路径
    const st = get();
    if (st.selectedFile === oldRel) {
      set({ selectedFile: newRel, fileContent: st.fileContent, fileDirty: st.fileDirty, currentDiff: null });
    }
    await Promise.all([get().refreshFileTree(), get().refreshStatus()]);
    return { ok: true };
  },
}));

// 内部工具
function pathJoin(...parts: string[]): string {
  return parts.join('/').replace(/\\/g, '/');
}

// 校验用户输入的文件相对路径：拒绝绝对路径、路径穿越、非法字符
function assertSafeRelPath(relPath: string): { ok: true } | { ok: false; error: string } {
  const p = relPath.trim().replace(/\\/g, '/');
  if (!p || p === '/' ) return { ok: false, error: '路径不能为空' };
  if (p.startsWith('/') || /^[a-zA-Z]:/.test(p)) return { ok: false, error: '请使用仓库内的相对路径' };
  const parts = p.split('/');
  if (parts.some((s) => s === '..' || s === '.')) return { ok: false, error: '路径不能包含 .. 或 .' };
  if (parts.some((s) => !s || /[\0]/.test(s))) return { ok: false, error: '路径包含非法字符' };
  return { ok: true };
}
