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
}));

// 内部工具
function pathJoin(...parts: string[]): string {
  return parts.join('/').replace(/\\/g, '/');
}
