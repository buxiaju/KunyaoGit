import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc-channels';

// 渲染进程可见的 API，全部通过 IPC 走主进程
const api = {
  // 仓库
  repo: {
    openDialog: () => ipcRenderer.invoke(IPC.REPO_OPEN_DIALOG),
    open: (path: string) => ipcRenderer.invoke(IPC.REPO_OPEN, path),
    listRecent: () => ipcRenderer.invoke(IPC.REPO_LIST_RECENT),
    removeRecent: (path: string) => ipcRenderer.invoke(IPC.REPO_REMOVE_RECENT, path),
    clone: (url: string, dest: string) => ipcRenderer.invoke(IPC.REPO_CLONE, { url, dest }),
    init: (path: string) => ipcRenderer.invoke(IPC.REPO_INIT, path),
    getInfo: (path: string) => ipcRenderer.invoke(IPC.REPO_GET_INFO, path),
  },

  // Git
  git: {
    status: (repoPath: string) => ipcRenderer.invoke(IPC.GIT_STATUS, repoPath),
    log: (repoPath: string, opts?: { maxCount?: number; branch?: string }) =>
      ipcRenderer.invoke(IPC.GIT_LOG, { path: repoPath, ...opts }),
    branches: (repoPath: string) => ipcRenderer.invoke(IPC.GIT_BRANCHES, repoPath),
    stage: (repoPath: string, paths: string[]) => ipcRenderer.invoke(IPC.GIT_STAGE, { path: repoPath, paths }),
    unstage: (repoPath: string, paths: string[]) => ipcRenderer.invoke(IPC.GIT_UNSTAGE, { path: repoPath, paths }),
    discard: (repoPath: string, paths: string[]) => ipcRenderer.invoke(IPC.GIT_DISCARD, { path: repoPath, paths }),
    commit: (repoPath: string, message: string, opts?: { amend?: boolean; signOff?: boolean }) =>
      ipcRenderer.invoke(IPC.GIT_COMMIT, { path: repoPath, message, ...opts }),
    push: (repoPath: string, opts?: { remote?: string; branch?: string; setUpstream?: boolean; force?: boolean }) =>
      ipcRenderer.invoke(IPC.GIT_PUSH, { path: repoPath, ...opts }),
    pull: (repoPath: string, opts?: { remote?: string; branch?: string; rebase?: boolean }) =>
      ipcRenderer.invoke(IPC.GIT_PULL, { path: repoPath, ...opts }),
    fetch: (repoPath: string, opts?: { remote?: string; prune?: boolean }) =>
      ipcRenderer.invoke(IPC.GIT_FETCH, { path: repoPath, ...opts }),
    checkout: (repoPath: string, target: string, opts?: { create?: boolean }) =>
      ipcRenderer.invoke(IPC.GIT_CHECKOUT, { path: repoPath, target, ...opts }),
    createBranch: (repoPath: string, name: string, from?: string) =>
      ipcRenderer.invoke(IPC.GIT_CREATE_BRANCH, { path: repoPath, name, from }),
    deleteBranch: (repoPath: string, name: string, force?: boolean) =>
      ipcRenderer.invoke(IPC.GIT_DELETE_BRANCH, { path: repoPath, name, force }),
    merge: (repoPath: string, branch: string, opts?: { noFF?: boolean; squash?: boolean; message?: string }) =>
      ipcRenderer.invoke(IPC.GIT_MERGE, { path: repoPath, branch, ...opts }),
    diff: (repoPath: string, opts?: { staged?: boolean; from?: string; to?: string }) =>
      ipcRenderer.invoke(IPC.GIT_DIFF, { path: repoPath, ...opts }),
    diffFile: (repoPath: string, file: string, opts?: { staged?: boolean }) =>
      ipcRenderer.invoke(IPC.GIT_DIFF_FILE, { path: repoPath, file, ...opts }),
    stash: (repoPath: string, message?: string) => ipcRenderer.invoke(IPC.GIT_STASH, { path: repoPath, message }),
    stashPop: (repoPath: string) => ipcRenderer.invoke(IPC.GIT_STASH_POP, repoPath),
    reset: (repoPath: string, target: string, mode?: 'soft' | 'mixed' | 'hard') =>
      ipcRenderer.invoke(IPC.GIT_RESET, { path: repoPath, target, mode }),
    resolveConflict: (repoPath: string, file: string, side: 'ours' | 'theirs') =>
      ipcRenderer.invoke(IPC.GIT_RESOLVE_CONFLICT, { path: repoPath, file, side }),
    readConflict: (repoPath: string, file: string) =>
      ipcRenderer.invoke(IPC.GIT_READ_CONFLICT, { path: repoPath, file }),
    remoteList: (repoPath: string) => ipcRenderer.invoke(IPC.GIT_REMOTE_LIST, repoPath),
    remoteAdd: (repoPath: string, name: string, url: string) =>
      ipcRenderer.invoke(IPC.GIT_REMOTE_ADD, { path: repoPath, name, url }),
    remoteRemove: (repoPath: string, name: string) => ipcRenderer.invoke(IPC.GIT_REMOTE_REMOVE, { path: repoPath, name }),
  },

  // 文件系统
  fs: {
    readDir: (path: string) => ipcRenderer.invoke(IPC.FS_READ_DIR, path),
    readFile: (path: string) => ipcRenderer.invoke(IPC.FS_READ_FILE, path),
    writeFile: (path: string, content: string) => ipcRenderer.invoke(IPC.FS_WRITE_FILE, { path, content }),
    writeBinary: (path: string, content: number[]) => ipcRenderer.invoke(IPC.FS_WRITE_BINARY, { path, content }),
    mkdirp: (path: string) => ipcRenderer.invoke(IPC.FS_MKDIR_P, path),
    fileTree: (path: string, depth?: number) => ipcRenderer.invoke(IPC.FS_FILE_TREE, { path, depth }),
    delete: (path: string) => ipcRenderer.invoke(IPC.FS_DELETE, path),
    rename: (oldPath: string, newPath: string) => ipcRenderer.invoke(IPC.FS_RENAME, { oldPath, newPath }),
  },

  // Release
  release: {
    list: (repoPath: string, platform?: 'github' | 'gitee') => ipcRenderer.invoke(IPC.RELEASE_LIST, { repoPath, platform }),
    create: (params: { repoPath: string; tag: string; name: string; body: string; draft?: boolean; prerelease?: boolean; platform?: 'github' | 'gitee' }) =>
      ipcRenderer.invoke(IPC.RELEASE_CREATE, params),
    delete: (repoPath: string, tag: string, platform?: 'github' | 'gitee') => ipcRenderer.invoke(IPC.RELEASE_DELETE, { repoPath, tag, platform }),
    get: (repoPath: string, tag: string, platform?: 'github' | 'gitee') => ipcRenderer.invoke(IPC.RELEASE_GET, { repoPath, tag, platform }),
    publish: (repoPath: string, tag: string, platform?: 'github' | 'gitee') => ipcRenderer.invoke(IPC.RELEASE_PUBLISH, { repoPath, tag, platform }),
    changelog: (params: { repoPath: string; from?: string; to?: string }) =>
      ipcRenderer.invoke(IPC.CHANGELOG_GENERATE, params),
  },

  // GitHub
  github: {
    listRepos: (params?: { visibility?: 'all' | 'public' | 'private'; sort?: 'updated' | 'pushed' | 'created' }) =>
      ipcRenderer.invoke(IPC.GH_LIST_REPOS, params),
    createRepo: (params: { name: string; description?: string; private?: boolean; autoInit?: boolean; gitignoreTemplate?: string; licenseTemplate?: string }) =>
      ipcRenderer.invoke(IPC.GH_CREATE_REPO, params),
    deleteRepo: (owner: string, repo: string) =>
      ipcRenderer.invoke(IPC.GH_DELETE_REPO, { owner, repo }),
    listPRs: (owner: string, repo: string, state?: 'open' | 'closed' | 'all') =>
      ipcRenderer.invoke(IPC.GH_LIST_PRS, { owner, repo, state }),
    listIssues: (owner: string, repo: string, state?: 'open' | 'closed' | 'all') =>
      ipcRenderer.invoke(IPC.GH_LIST_ISSUES, { owner, repo, state }),
    contentsList: (owner: string, repo: string, path?: string, ref?: string) =>
      ipcRenderer.invoke(IPC.GH_CONTENTS_LIST, { owner, repo, path, ref }),
    contentsRead: (owner: string, repo: string, path: string, ref?: string) =>
      ipcRenderer.invoke(IPC.GH_CONTENTS_READ, { owner, repo, path, ref }),
    contentsWrite: (params: { owner: string; repo: string; path: string; content: string; message: string; sha?: string; branch?: string }) =>
      ipcRenderer.invoke(IPC.GH_CONTENTS_WRITE, params),
    contentsDelete: (params: { owner: string; repo: string; path: string; message: string; sha: string; branch?: string }) =>
      ipcRenderer.invoke(IPC.GH_CONTENTS_DELETE, params),
  },

  // Gitee
  gitee: {
    listRepos: (params?: { visibility?: 'all' | 'public' | 'private'; sort?: 'updated' | 'pushed' | 'created' }) =>
      ipcRenderer.invoke(IPC.GT_LIST_REPOS, params),
    createRepo: (params: { name: string; description?: string; private?: boolean; autoInit?: boolean; gitignoreTemplate?: string; licenseTemplate?: string; homepage?: string }) =>
      ipcRenderer.invoke(IPC.GT_CREATE_REPO, params),
    deleteRepo: (owner: string, repo: string) =>
      ipcRenderer.invoke(IPC.GT_DELETE_REPO, { owner, repo }),
    listPRs: (owner: string, repo: string, state?: 'open' | 'closed' | 'all') =>
      ipcRenderer.invoke(IPC.GT_LIST_PRS, { owner, repo, state }),
    listIssues: (owner: string, repo: string, state?: 'open' | 'closed' | 'all') =>
      ipcRenderer.invoke(IPC.GT_LIST_ISSUES, { owner, repo, state }),
    contentsList: (owner: string, repo: string, path?: string, ref?: string) =>
      ipcRenderer.invoke(IPC.GT_CONTENTS_LIST, { owner, repo, path, ref }),
    contentsRead: (owner: string, repo: string, path: string, ref?: string) =>
      ipcRenderer.invoke(IPC.GT_CONTENTS_READ, { owner, repo, path, ref }),
    contentsWrite: (params: { owner: string; repo: string; path: string; content: string; message: string; sha?: string; branch?: string }) =>
      ipcRenderer.invoke(IPC.GT_CONTENTS_WRITE, params),
    contentsDelete: (params: { owner: string; repo: string; path: string; message: string; sha: string; branch?: string }) =>
      ipcRenderer.invoke(IPC.GT_CONTENTS_DELETE, params),
  },

  // 设置
  settings: {
    get: () => ipcRenderer.invoke(IPC.SETTINGS_GET),
    set: (settings: unknown) => ipcRenderer.invoke(IPC.SETTINGS_SET, settings),
    testGit: (gitPath?: string) => ipcRenderer.invoke(IPC.SETTINGS_TEST_GIT, gitPath),
    testAuth: (platform: 'github' | 'gitee', token: string) =>
      ipcRenderer.invoke(IPC.SETTINGS_TEST_AUTH, { platform, token }),
  },

  // 通用
  app: {
    openPath: (path: string) => ipcRenderer.invoke(IPC.APP_OPEN_PATH, path),
    shellOpen: (url: string) => ipcRenderer.invoke(IPC.APP_SHELL_OPEN, url),
    getPlatform: () => ipcRenderer.invoke('app:get-platform'),
    getVersion: () => ipcRenderer.invoke('app:get-version'),
    openExternal: (url: string) => ipcRenderer.invoke('app:open-external', url),
  },

  // 更新检查
  update: {
    check: () => ipcRenderer.invoke(IPC.UPDATE_CHECK),
    checkSilent: () => ipcRenderer.invoke(IPC.UPDATE_CHECK_SILENT),
    dismiss: (version: string) => ipcRenderer.invoke(IPC.UPDATE_DISMISS, version),
    open: (url: string) => ipcRenderer.invoke(IPC.UPDATE_OPEN, url),
  },
};

contextBridge.exposeInMainWorld('gitgui', api);

export type GitGuiApi = typeof api;
