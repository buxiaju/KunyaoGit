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
  theme: 'dark' | 'light';
  gitPath?: string;
  defaultCloneDir: string;
  authorName?: string;
  authorEmail?: string;
  diffView: 'unified' | 'split';
  auth: AuthConfig;
}

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
  name: string;
  size: number;
  downloadCount: number;
  downloadUrl: string;
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

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
