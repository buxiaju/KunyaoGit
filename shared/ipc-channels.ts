// IPC 通道常量（渲染进程和主进程共用）

export const IPC = {
  // 仓库管理
  REPO_OPEN_DIALOG: 'repo:open-dialog',
  REPO_OPEN: 'repo:open',
  REPO_LIST_RECENT: 'repo:list-recent',
  REPO_REMOVE_RECENT: 'repo:remove-recent',
  REPO_CLONE: 'repo:clone',
  REPO_INIT: 'repo:init',
  REPO_GET_INFO: 'repo:get-info',

  // Git 基础
  GIT_STATUS: 'git:status',
  GIT_LOG: 'git:log',
  GIT_BRANCHES: 'git:branches',
  GIT_STAGE: 'git:stage',
  GIT_UNSTAGE: 'git:unstage',
  GIT_DISCARD: 'git:discard',
  GIT_COMMIT: 'git:commit',
  GIT_PUSH: 'git:push',
  GIT_PULL: 'git:pull',
  GIT_FETCH: 'git:fetch',
  GIT_CHECKOUT: 'git:checkout',
  GIT_CREATE_BRANCH: 'git:create-branch',
  GIT_DELETE_BRANCH: 'git:delete-branch',
  GIT_MERGE: 'git:merge',
  GIT_DIFF: 'git:diff',
  GIT_DIFF_FILE: 'git:diff-file',
  GIT_STASH: 'git:stash',
  GIT_STASH_POP: 'git:stash-pop',
  GIT_STASH_LIST: 'git:stash-list',
  GIT_STASH_SHOW: 'git:stash-show',
  GIT_STASH_APPLY: 'git:stash-apply',
  GIT_STASH_DROP: 'git:stash-drop',
  GIT_RESET: 'git:reset',
  GIT_RESOLVE_CONFLICT: 'git:resolve-conflict',
  GIT_READ_CONFLICT: 'git:read-conflict',
  // v0.5+ 文件列表（用于 Ctrl+P 跳转）
  GIT_LS_FILES: 'git:ls-files',
  GIT_BLAME: 'git:blame',
  GIT_FILE_LOG: 'git:file-log',
  GIT_FILE_DIFF: 'git:file-diff',
  // v0.4+ Cherry-pick / Revert
  GIT_CHERRY_PICK: 'git:cherry-pick',
  GIT_REVERT: 'git:revert',
  GIT_REMOTE_LIST: 'git:remote-list',
  GIT_REMOTE_ADD: 'git:remote-add',
  GIT_REMOTE_REMOVE: 'git:remote-remove',

  // 文件系统 / 编辑器
  FS_READ_DIR: 'fs:read-dir',
  FS_READ_FILE: 'fs:read-file',
  FS_WRITE_FILE: 'fs:write-file',
  FS_WRITE_BINARY: 'fs:write-binary',
  FS_MKDIR_P: 'fs:mkdir-p',
  FS_FILE_TREE: 'fs:file-tree',
  FS_DELETE: 'fs:delete',
  FS_RENAME: 'fs:rename',

  // Release
  RELEASE_LIST: 'release:list',
  RELEASE_CREATE: 'release:create',
  RELEASE_DELETE: 'release:delete',
  RELEASE_GET: 'release:get',
  RELEASE_PUBLISH: 'release:publish',
  // v0.6+ 附件 + 编辑
  RELEASE_UPLOAD_ASSET: 'release:upload-asset',
  RELEASE_DELETE_ASSET: 'release:delete-asset',
  RELEASE_UPDATE: 'release:update',
  CHANGELOG_GENERATE: 'changelog:generate',

  // GitHub
  GH_LIST_REPOS: 'gh:list-repos',
  GH_SEARCH_REPOS: 'gh:search-repos',
  GH_CREATE_REPO: 'gh:create-repo',
  GH_DELETE_REPO: 'gh:delete-repo',
  GH_LIST_PRS: 'gh:list-prs',
  GH_LIST_ISSUES: 'gh:list-issues',
  GH_CONTENTS_LIST: 'gh:contents-list',
  GH_CONTENTS_READ: 'gh:contents-read',
  GH_CONTENTS_WRITE: 'gh:contents-write',
  GH_CONTENTS_DELETE: 'gh:contents-delete',
  // v0.4+ PR 创建
  GH_CREATE_PR: 'gh:create-pr',
  GH_GET_DEFAULT_BRANCH: 'gh:get-default-branch',

  // Gitee
  GT_LIST_REPOS: 'gt:list-repos',
  GT_SEARCH_REPOS: 'gt:search-repos',
  GT_CREATE_REPO: 'gt:create-repo',
  GT_DELETE_REPO: 'gt:delete-repo',
  GT_LIST_PRS: 'gt:list-prs',
  GT_LIST_ISSUES: 'gt:list-issues',
  GT_CONTENTS_LIST: 'gt:contents-list',
  GT_CONTENTS_READ: 'gt:contents-read',
  GT_CONTENTS_WRITE: 'gt:contents-write',
  GT_CONTENTS_DELETE: 'gt:contents-delete',
  // v0.4+ PR 创建
  GT_CREATE_PR: 'gt:create-pr',
  GT_GET_DEFAULT_BRANCH: 'gt:get-default-branch',

  // 设置
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_TEST_GIT: 'settings:test-git',
  SETTINGS_TEST_AUTH: 'settings:test-auth',
  DIALOG_SHOW_OPEN: 'dialog:show-open',
  DIALOG_SHOW_SAVE: 'dialog:show-save',

  // 通用
  APP_OPEN_PATH: 'app:open-path',
  APP_SHELL_OPEN: 'app:shell-open',

  // 更新检查 / 应用内下载安装
  UPDATE_CHECK: 'update:check',
  UPDATE_CHECK_SILENT: 'update:check-silent',
  UPDATE_DISMISS: 'update:dismiss',
  UPDATE_OPEN: 'update:open',
  UPDATE_DOWNLOAD: 'update:download',          // 渲染→主：开始下载安装包
  UPDATE_DOWNLOAD_PROGRESS: 'update:download-progress',  // 主→渲染：进度事件
  UPDATE_INSTALL: 'update:install',            // 渲染→主：启动已下载的安装包并退出
  UPDATE_CANCEL_DOWNLOAD: 'update:cancel-download',      // 渲染→主：取消下载
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
