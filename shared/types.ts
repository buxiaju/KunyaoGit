// 渲染进程和主进程共享的类型定义

export interface RepoInfo {
  path: string;
  name: string;
  remoteUrl?: string;
  currentBranch?: string;
  isGitRepo: boolean;
  lastOpenedAt: number;
}

export interface CommitInfo {
  hash: string;
  shortHash: string;
  author: string;
  email: string;
  date: string; // ISO
  message: string;
  refs?: string[];
  parents?: string[];
}

export interface BranchInfo {
  name: string;
  current: boolean;
  remote: boolean;
  upstream?: string;
  ahead?: number;
  behind?: number;
  lastCommit?: string;
}

export interface FileStatus {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked' | 'conflicted';
  oldPath?: string;
  staged: boolean;
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileTreeNode[];
  status?: FileStatus['status'];
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface DiffLine {
  type: 'add' | 'del' | 'context';
  content: string;
  oldLine?: number;
  newLine?: number;
}

export interface FileDiff {
  path: string;
  oldPath?: string;
  isBinary: boolean;
  hunks: DiffHunk[];
}

export interface RemoteInfo {
  name: string;
  url: string;
  type: 'github' | 'gitee' | 'other';
}

export interface AuthConfig {
  github?: { token: string; user?: string };
  gitee?: { token: string; user?: string };
}

export interface AppSettings {
  theme: Theme;
  language: 'zh' | 'en';
  gitPath?: string;
  defaultCloneDir: string;
  authorName?: string;
  authorEmail?: string;
  diffView: 'unified' | 'split';
  auth: AuthConfig;
  /**
   * SSH 私钥绝对路径（v0.6.1 SSH 推送支持，v0.6.2 起被 sshKeysByHost 替代但保留兼容）。
   *
   * - 留空：git 用 `~/.ssh/id_ed25519` / `~/.ssh/id_rsa` 等默认约定
   * - 配了：用 `GIT_SSH_COMMAND="ssh -i <path> -o IdentitiesOnly=yes"` 强制走该 key
   *
   * **v0.6.2 起**：新加的 `sshKeysByHost` 字段支持 github / gitee 分别配置。
   * 本字段保留为**兜底**——未在 sshKeysByHost 配置的 host 自动用本字段的 key。
   * 设置页只显示 sshKeysByHost，迁移时会自动把本字段的值复制到 sshKeysByHost.github。
   *
   * 触发场景：HTTPS 推送被网络拦截（如国内访问 github.com:443 受限）时，
   * 用户可在此配 SSH key + 切 remote URL 到 SSH 协议走 22 端口。
   */
  sshKeyPath?: string;
  /**
   * 按 host 分配 SSH 私钥（v0.6.2+）。
   *
   * - 优先按 remote URL 的 host 选 key（github.com → githubKey，gitee.com → giteeKey）
   * - 未配置的 host 自动 fallback 到顶层 `sshKeyPath`
   * - 都不配置：git 用 OpenSSH 默认约定（`~/.ssh/id_ed25519` / `~/.ssh/id_rsa`）
   *
   * 配合 [`writeSshConfig`](#) 自动写入 `~/.ssh/config` 的 Host 块，
   * 让 OpenSSH 客户端按 host 自动选 IdentityFile，无需在 GitService 注入 env。
   */
  sshKeysByHost?: {
    /** github.com 用的私钥绝对路径（fallback 到顶层 sshKeyPath） */
    github?: string;
    /** gitee.com 用的私钥绝对路径（fallback 到顶层 sshKeyPath） */
    gitee?: string;
  };
  /**
   * 推送协议偏好（v0.6+ SSH 推送支持）。
   * - `auto`：用仓库现配的 remote URL（默认；不自动改）
   * - `https`：强制把 remote URL 转 HTTPS 后推送
   * - `ssh`：强制把 remote URL 转 SSH 后推送
   *
   * 注意：`https` / `ssh` 模式**会临时改仓库的 remote URL**（一次推送），
   * 用完再恢复。仓库里的真实配置不会被改坏。
   */
  preferredProtocol?: 'auto' | 'https' | 'ssh';
}

export type Theme = 'dark' | 'ocean' | 'light';

export interface ReleaseInfo {
  tag: string;
  name: string;
  body: string;
  draft: boolean;
  prerelease: boolean;
  createdAt: string;
  publishedAt?: string;
  assets: ReleaseAsset[];
  platform: 'github' | 'gitee';
}

export interface ReleaseAsset {
  id: number;                 // 平台侧 asset id（删除 / 后续操作依赖）
  name: string;
  size: number;
  downloadCount: number;
  downloadUrl: string;
  state?: string;             // GitHub: 'uploaded' | 'open' | 'new'；Gitee 暂不返回
  contentType?: string;       // MIME
  uploadedAt?: string;        // ISO
  htmlUrl?: string;           // GitHub 页面地址
}

// v0.6+ Release 编辑参数（name / body / prerelease / draft）
// GitHub 全支持；Gitee 支持 name / body / prerelease_flag，draft 由创建时决定
export interface ReleaseUpdateParams {
  name?: string;
  body?: string;
  prerelease?: boolean;
  draft?: boolean;
}

export interface PullRequestInfo {
  number: number;
  title: string;
  state: 'open' | 'closed' | 'merged';
  author: string;
  createdAt: string;
  updatedAt: string;
  url: string;
  base: string;
  head: string;
  platform: 'github' | 'gitee';
}

export interface IssueInfo {
  number: number;
  title: string;
  state: 'open' | 'closed';
  author: string;
  createdAt: string;
  url: string;
  labels: string[];
  platform: 'github' | 'gitee';
}

export interface RemoteFile {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size: number;
  sha: string;
  url: string;
  htmlUrl?: string;
}

export interface RemoteFileContent {
  path: string;
  sha: string;
  content: string;        // 解码后的文本
  encoding: 'utf-8' | 'base64';
  size: number;
  isBinary: boolean;
}

export interface ChangelogGroup {
  type: 'feat' | 'fix' | 'docs' | 'refactor' | 'perf' | 'chore' | 'other';
  commits: CommitInfo[];
}

// v0.4+ Stash 列表条目
export interface StashEntry {
  index: number;          // 0-based（stash@{0}）
  ref: string;            // 'stash@{0}'
  message: string;        // 提交说明（去掉 "WIP on branch: hash" 前缀）
  branch: string;         // 创建时的分支
  hash: string;           // 完整 SHA
  date: string;           // ISO
}

// v0.5+ 工作区文件条目（用于 Ctrl+P 跳转）
export interface GitFile {
  path: string;           // 相对仓库根的路径（含 untracked）
  status?: FileStatus['status']; // 暂存状态（truncated 为空字符串时为 tracked-but-clean）
}

// v0.5+ Blame 单行记录（用于编辑器左侧 gutter hover）
export interface BlameLine {
  line: number;           // 1-based
  hash: string;           // 完整 SHA
  author: string;         // 作者名
  email: string;
  date: string;           // ISO
  message: string;        // commit message 第一行
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export interface AppUpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latest: {
    tag: string;
    version: string;
    name: string;
    body: string;
    htmlUrl: string;
    publishedAt?: string;
    platform: 'github' | 'gitee';
    assets: { name: string; size: number; downloadUrl: string }[];
  } | null;
  sources: {
    platform: 'github' | 'gitee';
    ok: boolean;
    error?: string;
    release?: AppUpdateInfo['latest'];
  }[];
  dismissed?: boolean;
}

// 应用内下载安装包的进度事件载荷
export type DownloadPhase = 'preparing' | 'downloading' | 'done' | 'error' | 'cancelled';
export interface DownloadProgress {
  phase: DownloadPhase;
  percent: number;        // 0-100，totalBytes 未知时为 -1
  bytesReceived: number;
  totalBytes: number;      // 0 表示未知
  source?: 'gitee' | 'github';  // 当前正在下载的源
  message?: string;       // error/done 阶段的说明
  filePath?: string;      // done 阶段返回的本地安装包路径
  speedBps?: number;      // 瞬时下载速率（字节/秒，downloading 阶段填）
}
