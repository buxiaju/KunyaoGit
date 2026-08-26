// v0.4+ Vitest 全局 setup
// 主要职责：给渲染层组件测试提供 window.gitgui mock

import { vi, beforeEach } from 'vitest';

/** 生成一个成功的 Result */
export const ok = <T>(data: T) => ({ ok: true as const, data });
/** 生成一个失败的 Result */
export const err = (error: string) => ({ ok: false as const, error });

/**
 * 创建 window.gitgui 的完整 mock
 * 所有方法默认返回 ok(空值)，测试里可用 mockResolvedValue 覆盖
 */
export function createGitguiMock() {
  return {
    app: {
      getVersion: vi.fn().mockResolvedValue('0.4.0'),
      openExternal: vi.fn().mockResolvedValue(undefined),
      shellOpen: vi.fn().mockResolvedValue(undefined),
      openPath: vi.fn().mockResolvedValue(undefined),
      relaunch: vi.fn(),
      quit: vi.fn(),
    },
    dialog: {
      showOpen: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] }),
      openDirectory: vi.fn().mockResolvedValue(null),
      openFile: vi.fn().mockResolvedValue(null),
    },
    // 注意：SETTINGS_GET / SETTINGS_SET 的 handler 直接返回裸 AppSettings，
    // 不是 Result 包装（见 electron/ipc/settings.ts）。早期这里错误地用了 ok(...)，
    // 导致测试中拿到的是 { ok:true, data:{} } 而不是设置对象。
    settings: {
      get: vi.fn().mockResolvedValue({
        theme: 'dark',
        language: 'zh',
        defaultCloneDir: '',
        diffView: 'split',
        auth: {},
      }),
      set: vi.fn().mockImplementation(async (partial: unknown) => ({
        theme: 'dark',
        language: 'zh',
        defaultCloneDir: '',
        diffView: 'split',
        auth: {},
        ...(partial as object),
      })),
      testGit: vi.fn().mockResolvedValue({ ok: true, version: '2.47.0' }),
      testAuth: vi.fn().mockResolvedValue(ok({ user: 'tester' })),
    },
    git: {
      status: vi.fn().mockResolvedValue(ok([])),
      log: vi.fn().mockResolvedValue(ok([])),
      branches: vi.fn().mockResolvedValue(ok([])),
      stage: vi.fn().mockResolvedValue(ok(undefined)),
      unstage: vi.fn().mockResolvedValue(ok(undefined)),
      discard: vi.fn().mockResolvedValue(ok(undefined)),
      commit: vi.fn().mockResolvedValue(ok({ hash: 'abc1234' })),
      push: vi.fn().mockResolvedValue(ok('')),
      pull: vi.fn().mockResolvedValue(ok('')),
      fetch: vi.fn().mockResolvedValue(ok(undefined)),
      checkout: vi.fn().mockResolvedValue(ok(undefined)),
      createBranch: vi.fn().mockResolvedValue(ok(undefined)),
      deleteBranch: vi.fn().mockResolvedValue(ok(undefined)),
      merge: vi.fn().mockResolvedValue(ok('')),
      diff: vi.fn().mockResolvedValue(ok([])),
      diffFile: vi.fn().mockResolvedValue(ok(null)),
      stash: vi.fn().mockResolvedValue(ok(undefined)),
      stashPop: vi.fn().mockResolvedValue(ok(undefined)),
      // v0.4+
      stashList: vi.fn().mockResolvedValue(ok([])),
      stashShow: vi.fn().mockResolvedValue(ok([])),
      stashApply: vi.fn().mockResolvedValue(ok(undefined)),
      stashDrop: vi.fn().mockResolvedValue(ok(undefined)),
      cherryPick: vi.fn().mockResolvedValue(ok({ hash: 'def5678' })),
      revert: vi.fn().mockResolvedValue(ok({ hash: 'ghi9012' })),
      reset: vi.fn().mockResolvedValue(ok(undefined)),
      resolveConflict: vi.fn().mockResolvedValue(ok(undefined)),
      readConflict: vi.fn().mockResolvedValue(ok({ ours: '', base: '', theirs: '' })),
      remoteList: vi.fn().mockResolvedValue(ok([])),
      remoteAdd: vi.fn().mockResolvedValue(ok(undefined)),
      remoteRemove: vi.fn().mockResolvedValue(ok(undefined)),
      currentBranch: vi.fn().mockResolvedValue(ok('main')),
      // v0.5+ 列出仓库文件（用于 Ctrl+P 跳转）
      listFiles: vi.fn().mockResolvedValue(ok([])),
      // v0.5+ Blame / 文件历史 / 文件 diff
      blame: vi.fn().mockResolvedValue(ok([])),
      fileLog: vi.fn().mockResolvedValue(ok([])),
      fileDiff: vi.fn().mockResolvedValue(ok(null)),
    },
    repo: {
      open: vi.fn().mockResolvedValue(ok(null)),
      clone: vi.fn().mockResolvedValue(ok(null)),
      init: vi.fn().mockResolvedValue(ok(null)),
      recent: vi.fn().mockResolvedValue(ok([])),
    },
    // 注意：键名必须与 electron/preload.ts 暴露的 `fs` 一致。
    // 早期这里错写为 `fsLocal`，导致所有调用 window.gitgui.fs.* 的渲染层代码
    // 在测试中根本没有被 mock 住（访问到 undefined 才报错）。
    fs: {
      readDir: vi.fn().mockResolvedValue(ok([])),
      readFile: vi.fn().mockResolvedValue(ok({ content: '', size: 0 })),
      writeFile: vi.fn().mockResolvedValue(ok(undefined)),
      writeBinary: vi.fn().mockResolvedValue(ok(undefined)),
      mkdirp: vi.fn().mockResolvedValue(ok(undefined)),
      fileTree: vi.fn().mockResolvedValue(ok([])),
      delete: vi.fn().mockResolvedValue(ok(undefined)),
      rename: vi.fn().mockResolvedValue(ok(undefined)),
    },
    github: {
      listRepos: vi.fn().mockResolvedValue(ok([])),
      searchRepos: vi.fn().mockResolvedValue(ok([])),
      createRepo: vi.fn().mockResolvedValue(ok(null)),
      deleteRepo: vi.fn().mockResolvedValue(ok(undefined)),
      listPRs: vi.fn().mockResolvedValue(ok([])),
      listIssues: vi.fn().mockResolvedValue(ok([])),
      contentsList: vi.fn().mockResolvedValue(ok([])),
      contentsRead: vi.fn().mockResolvedValue(ok({ content: '', sha: '' })),
      contentsWrite: vi.fn().mockResolvedValue(ok(undefined)),
      contentsDelete: vi.fn().mockResolvedValue(ok(undefined)),
      // v0.4+
      createPR: vi.fn().mockResolvedValue(
        ok({ number: 1, url: 'https://api.github.com/pulls/1', htmlUrl: 'https://github.com/o/r/pull/1' })
      ),
      getDefaultBranch: vi.fn().mockResolvedValue(ok('main')),
    },
    gitee: {
      listRepos: vi.fn().mockResolvedValue(ok([])),
      searchRepos: vi.fn().mockResolvedValue(ok([])),
      createRepo: vi.fn().mockResolvedValue(ok(null)),
      deleteRepo: vi.fn().mockResolvedValue(ok(undefined)),
      listPRs: vi.fn().mockResolvedValue(ok([])),
      listIssues: vi.fn().mockResolvedValue(ok([])),
      contentsList: vi.fn().mockResolvedValue(ok([])),
      contentsRead: vi.fn().mockResolvedValue(ok({ content: '', sha: '' })),
      contentsWrite: vi.fn().mockResolvedValue(ok(undefined)),
      contentsDelete: vi.fn().mockResolvedValue(ok(undefined)),
      // v0.4+
      createPR: vi.fn().mockResolvedValue(
        ok({ number: 1, url: 'https://gitee.com/api/v5/pulls/1', htmlUrl: 'https://gitee.com/o/r/pulls/1' })
      ),
      getDefaultBranch: vi.fn().mockResolvedValue(ok('master')),
    },
    release: {
      listTags: vi.fn().mockResolvedValue(ok([])),
      createTag: vi.fn().mockResolvedValue(ok(undefined)),
      deleteTag: vi.fn().mockResolvedValue(ok(undefined)),
      pushTag: vi.fn().mockResolvedValue(ok(undefined)),
      generateChangelog: vi.fn().mockResolvedValue(ok('')),
      listReleases: vi.fn().mockResolvedValue(ok([])),
      createRelease: vi.fn().mockResolvedValue(ok(null)),
      deleteRelease: vi.fn().mockResolvedValue(ok(undefined)),
      // v0.6+
      uploadAsset: vi.fn().mockResolvedValue(ok({ id: 1, name: 'f.zip', size: 100, downloadCount: 0, downloadUrl: 'https://x' })),
      deleteAsset: vi.fn().mockResolvedValue(ok(undefined)),
      update: vi.fn().mockResolvedValue(ok(null)),
      publish: vi.fn().mockResolvedValue(ok(undefined)),
    },
    update: {
      check: vi.fn().mockResolvedValue(ok(null)),
      download: vi.fn().mockResolvedValue(ok('')),
      install: vi.fn().mockResolvedValue(ok(undefined)),
      onProgress: vi.fn().mockReturnValue(() => {}),
      cancel: vi.fn().mockResolvedValue(ok(undefined)),
    },
  };
}

// 每个测试前重置 window.gitgui
beforeEach(() => {
  (globalThis as any).window = (globalThis as any).window || {};
  (globalThis as any).window.gitgui = createGitguiMock();
});
