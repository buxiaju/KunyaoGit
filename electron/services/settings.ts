import Store from 'electron-store';
import { app } from 'electron';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { AppSettings } from '../../shared/types';
// v0.6.3+ 静态 import（之前用 require('../lib/sshConfig') 在 dev 模式 ESM 下抛 "require is not defined"）
import { writeSshConfig } from '../lib/sshConfig';

const execFileAsync = promisify(execFile);

const STORE_NAME = 'gitgui-settings';

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  language: 'zh',
  defaultCloneDir: '',
  diffView: 'split',
  auth: {},
  // v0.6+ SSH 推送支持：默认空（用 ssh-agent / ~/.ssh 约定）
  sshKeyPath: '',
  preferredProtocol: 'auto',
};

/**
 * store 的最小接口。
 *
 * 为什么不直接用 `Store<AppSettings>`：配置文件损坏或磁盘不可写时需要退化成
 * 内存实现，两者必须可互换。参数用 `any` 是为了让 electron-store 的多重载
 * 签名能结构性兼容此接口（现有调用点本来也在用 `store.get('recentRepos' as any)`）。
 */
export interface SettingsStoreLike {
  store: AppSettings;
  get(key: any, defaultValue?: any): any;
  set(key: any, value?: any): void;
}

/** 纯内存兜底实现：配置无法持久化时至少保证应用能启动并正常使用本次会话。 */
function createMemoryStore(): SettingsStoreLike {
  let state: Record<string, any> = { ...DEFAULT_SETTINGS };
  return {
    get store() {
      return state as AppSettings;
    },
    set store(v: AppSettings) {
      state = { ...v };
    },
    get(key: any, defaultValue?: any) {
      return key in state ? state[key] : defaultValue;
    },
    set(key: any, value?: any) {
      state[key] = value;
    },
  };
}

/**
 * 启动前预检配置文件（健壮性加固）。
 *
 * 背景：conf@10（electron-store@8 的底层）默认 `clearInvalidConfig: false`，
 * 配置文件内容不是合法 JSON 时 `new Store()` 会直接抛 SyntaxError。
 * 该异常发生在主进程启动路径上 —— 结果是**应用永久无法启动**，
 * 普通用户只能手工去 %APPDATA% 删文件才能恢复。
 *
 * 断电、磁盘写满、手工编辑出错、多实例并发写都可能造成这种损坏。
 * 这里在构造 Store 之前主动探测：损坏就把原文件改名留档，让 Store 用默认值重建。
 *
 * @returns 若发生过备份，返回备份文件路径，供启动日志说明
 */
export function preflightConfigFile(): { backedUpTo: string } | null {
  let file: string;
  try {
    file = path.join(app.getPath('userData'), `${STORE_NAME}.json`);
  } catch {
    // app 不可用（例如单元测试环境），跳过预检
    return null;
  }

  try {
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, 'utf-8');
    // 空文件同样会让 conf 抛错，一并当作损坏处理
    if (raw.trim() === '') throw new SyntaxError('配置文件为空');
    JSON.parse(raw);
    return null; // 合法，无需处理
  } catch (e) {
    // 损坏：备份留档后移走，避免下一步 new Store() 抛异常
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backup = path.join(app.getPath('userData'), `${STORE_NAME}.corrupt-${stamp}.json`);
      fs.renameSync(file, backup);
      console.warn(`[settings] 配置文件损坏（${(e as Error).message}），已备份到 ${backup}，将使用默认设置重建`);
      return { backedUpTo: backup };
    } catch (renameErr) {
      // 连改名都失败（权限 / 文件被占用）：尽力删除，仍失败则交由下游 fallback
      try {
        fs.unlinkSync(file);
        console.warn('[settings] 配置文件损坏且无法备份，已删除并使用默认设置重建');
      } catch {
        console.error(`[settings] 配置文件损坏且无法清理：${(renameErr as Error).message}`);
      }
      return null;
    }
  }
}

function createStore(): SettingsStoreLike {
  preflightConfigFile();
  try {
    return new Store<AppSettings>({
      name: STORE_NAME,
      defaults: DEFAULT_SETTINGS,
      // 二次保险：即使预检漏掉某种损坏形态，也让 conf 自行清理而不是抛异常
      clearInvalidConfig: true,
    }) as unknown as SettingsStoreLike;
  } catch (e) {
    // 走到这里通常是目录不可写 / 磁盘满 / 权限异常。
    // 宁可丢失设置持久化，也不能让应用启动不起来。
    console.error(`[settings] 配置存储初始化失败，降级为内存模式：${(e as Error).message}`);
    return createMemoryStore();
  }
}

export const store: SettingsStoreLike = createStore();

/**
 * 写入串行化队列（健壮性加固 D）。
 *
 * electron-store 底层是「读改写整个文件」模式（conf@10 实现）。
 * 单实例锁挡住了多进程并发，但**单进程内**仍有竞态：
 *   - 渲染层同时触发多个 settings.set
 *   - 每次都走「读 store → 改内存 → 写整个文件」
 *   - 后启动的写可能基于更早的读，写完后前面的写就被覆盖（最后写的赢）
 *
 * 把所有写操作排到一个 Promise chain 上：每次写都 `queue = queue.then(write)`，
 * 保证所有读改写按调用顺序串行执行，永远不会出现「读到旧值 → 写入」穿插。
 */
let writeQueue: Promise<unknown> = Promise.resolve();

/** 测试用：把队列重置为空（不在生产代码调用）。 */
export function _resetWriteQueueForTest(): void {
  writeQueue = Promise.resolve();
}

/** 拿到当前队列尾部并接上一个新任务，返回新 promise。 */
function enqueueWrite<T>(task: () => T | Promise<T>): Promise<T> {
  const next = writeQueue.then(() => Promise.resolve().then(task));
  // 链上挂个 swallow，防止单个 task reject 让整个 chain 永久卡住
  writeQueue = next.catch(() => undefined);
  return next;
}

export function getSettings(): AppSettings {
  try {
    return store.store;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function setSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
  return enqueueWrite(() => {
    try {
      const current = store.store;
      store.store = { ...current, ...settings };
      return store.store;
    } catch (e) {
      console.error(`[settings] 写入设置失败：${(e as Error).message}`);
      return getSettings();
    }
  });
}

export function getRecentRepos(): string[] {
  try {
    const list = store.get('recentRepos') as string[] | undefined;
    // 防御损坏数据：字段类型可能被外部编辑成非数组
    if (!Array.isArray(list)) return [];
    return list.filter((p): p is string => typeof p === 'string' && p.trim() !== '');
  } catch {
    return [];
  }
}

export function addRecentRepo(repoPath: string): Promise<void> {
  return enqueueWrite(() => {
    try {
      const list = getRecentRepos().filter((p) => p !== repoPath);
      list.unshift(repoPath);
      store.set('recentRepos', list.slice(0, 20));
    } catch (e) {
      console.error(`[settings] 记录最近仓库失败：${(e as Error).message}`);
    }
  });
}

export function removeRecentRepo(repoPath: string): Promise<void> {
  return enqueueWrite(() => {
    try {
      const list = getRecentRepos().filter((p) => p !== repoPath);
      store.set('recentRepos', list);
    } catch (e) {
      console.error(`[settings] 移除最近仓库失败：${(e as Error).message}`);
    }
  });
}

export async function testGit(gitPath?: string): Promise<{ ok: boolean; version?: string; error?: string }> {
  try {
    const { stdout } = await execFileAsync(gitPath || 'git', ['--version']);
    const m = stdout.match(/git version (\S+)/);
    return { ok: true, version: m?.[1] || stdout.trim() };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * 去掉 ANSI 转义序列（颜色码 / 光标控制 / etc.）
 * v0.6.3+：ssh -T 输出可能含 `\x1b[36;01m...` 之类（OpenSSH 在交互式终端加颜色），
 * 直接显示会露馅。
 */
export function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');
}

/**
 * 把 ssh -T 输出解析成结构化结果（v0.6+ SSH 推送支持 / 纯函数）。
 * 抽出是为了便于单元测试 —— testSshConnection 在不同环境下行为差异大（mock execFile 难），
 * 解析层是稳定可测的。
 */
export function parseSshResult(
  stdout: string,
  stderr: string
): { ok: boolean; message: string; error?: string } {
  // v0.6.3+ 先剥 ANSI 颜色码（OpenSSH 在交互式终端会加色）
  stdout = stripAnsi(stdout);
  stderr = stripAnsi(stderr);
  // v0.6.3+ GitHub 把 `Hi <user>! You've successfully authenticated...` 写到 **stderr**
  // （不是 stdout），所以成功检测要同时看 stdout + stderr。
  // 顺序：先尝试从 stdout 提取用户名，失败再从 stderr 提取。
  const out = stdout + '\n' + stderr;
  if (/successfully authenticated/i.test(out) || /Hi\s+\S+/i.test(out)) {
    const mStdout = stdout.match(/Hi\s+(\S+?)!/);
    const mStderr = stderr.match(/Hi\s+(\S+?)!/);
    const user = mStdout?.[1] || mStderr?.[1];
    if (user) return { ok: true, message: `已认证为 ${user}` };
    // 找到认证成功但拿不到用户名（很罕见）→ 用 stdout（用户一般能看懂）
    return { ok: true, message: (stdout || stderr).trim() };
  }
  if (/Permission denied/i.test(stderr + stdout)) {
    return { ok: false, message: '', error: '认证失败：服务器拒绝了公钥（Permission denied）。请检查 key 是否已加到 GitHub 账户' };
  }
  if (/Could not resolve hostname/i.test(stderr)) {
    return { ok: false, message: '', error: '无法解析主机 github.com，请检查 DNS / 网络' };
  }
  if (/Connection timed out|Connection refused/i.test(stderr)) {
    return { ok: false, message: '', error: '连接被拒或超时，请检查网络是否能访问 22 端口（必要时使用代理）' };
  }
  if (/No such file or directory/i.test(stderr)) {
    return { ok: false, message: '', error: '系统找不到 ssh 命令（Windows 10 1809+ 自带 OpenSSH，请确认已安装）' };
  }
  return { ok: false, message: stdout.trim(), error: stderr.trim() || '未识别的主机响应' };
}

/**
 * 测试 SSH 连接 GitHub（v0.6+ SSH 推送支持）。
 *
 * 实现：用 `ssh -T -o BatchMode=yes -o ConnectTimeout=10 git@github.com` 探测。
 * - 成功：GitHub 返回 `Hi <user>! You've successfully authenticated, but GitHub does not provide shell access.`
 *   命令**非 0 退出**但 stdout 含 "successfully"，我们按 stdout 判定
 * - 失败：Permission denied (publickey) / Could not resolve hostname / Connection timed out
 *
 * 故意不传 `git@github.com` 之外的 host（用户可换 host 时再加参数）。
 * 超时 10s 防止等太久卡住 UI。
 */
export async function testSshConnection(
  sshKeyPath?: string
): Promise<{ ok: boolean; message: string; error?: string }> {
  // 校验 key 文件存在
  if (sshKeyPath && sshKeyPath.trim() !== '') {
    try {
      const stat = fs.statSync(sshKeyPath);
      if (!stat.isFile()) {
        return { ok: false, message: '', error: `SSH 私钥路径不是一个文件：${sshKeyPath}` };
      }
    } catch (e) {
      return { ok: false, message: '', error: `SSH 私钥文件不存在或无法访问：${sshKeyPath}（${(e as Error).message}）` };
    }
  }

  const args = [
    '-T', // 不分配 pseudo-terminal（GitHub 要求）
    '-o', 'BatchMode=yes', // 不要交互式密码输入
    '-o', 'ConnectTimeout=10',
    '-o', 'StrictHostKeyChecking=accept-new',
  ];
  if (sshKeyPath && sshKeyPath.trim() !== '') {
    args.push('-i', sshKeyPath);
    args.push('-o', 'IdentitiesOnly=yes');
  }
  // v0.6.2 起：按 host 区分，不再硬编码 github.com
  // 这里没 host 参数（IPC 旧签名），用 github.com 兜底；新签名 testSshConnectionForHost 走 sshKey
  args.push('git@github.com');

  try {
    const { stdout, stderr } = await execFileAsync('ssh', args);
    // ssh -T 即使认证成功也是退出码 1（GitHub 不开 shell），走 stdout 解析
    return parseSshResult(stdout || '', stderr || '');
  } catch (e: any) {
    // execFile reject 时，e.stdout / e.stderr 也可能有内容（GitHub ssh -T 认证成功就是 reject 1 + 消息写到 stderr）
    const stdout: string = stripAnsi(e?.stdout || '');
    const stderr: string = stripAnsi(e?.stderr || '');
    // v0.6.3+ 直接调 parseSshResult（它已合并 stdout+stderr 检测成功标记）
    if (stdout || stderr) {
      return parseSshResult(stdout, stderr);
    }
    return { ok: false, message: '', error: (e as Error)?.message || 'ssh 命令执行失败' };
  }
}

// v0.6.2+：按 host 测试 SSH 连接
// 已知 host：github.com / gitee.com；其他 host 一律拒绝（避免探测到任意 SSH 服务）
const KNOWN_SSH_HOSTS = new Set(['github.com', 'gitee.com']);

export interface TestSshForHostInput {
  host: 'github.com' | 'gitee.com';
  keyPath?: string;
}

export async function testSshConnectionForHost(
  input: TestSshForHostInput
): Promise<{ ok: boolean; message: string; error?: string }> {
  const { host, keyPath } = input;
  if (!KNOWN_SSH_HOSTS.has(host)) {
    return { ok: false, message: '', error: `不支持的 host: ${host}（仅 github.com / gitee.com）` };
  }
  if (keyPath && keyPath.trim() !== '') {
    try {
      const stat = fs.statSync(keyPath);
      if (!stat.isFile()) {
        return { ok: false, message: '', error: `SSH 私钥路径不是一个文件：${keyPath}` };
      }
    } catch (e) {
      return { ok: false, message: '', error: `SSH 私钥文件不存在或无法访问：${keyPath}（${(e as Error).message}）` };
    }
  }

  const args = [
    '-T', // 不分配 pseudo-terminal
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=10',
    '-o', 'StrictHostKeyChecking=accept-new',
  ];
  if (keyPath && keyPath.trim() !== '') {
    args.push('-i', keyPath);
    args.push('-o', 'IdentitiesOnly=yes');
  }
  args.push(`git@${host}`);

  try {
    const { stdout, stderr } = await execFileAsync('ssh', args);
    return parseSshResult(stdout || '', stderr || '');
  } catch (e: any) {
    const stdout: string = stripAnsi(e?.stdout || '');
    const stderr: string = stripAnsi(e?.stderr || '');
    // v0.6.3+ 直接调 parseSshResult（它已合并 stdout+stderr 检测成功标记）
    if (stdout || stderr) {
      return parseSshResult(stdout, stderr);
    }
    return { ok: false, message: '', error: (e as Error)?.message || 'ssh 命令执行失败' };
  }
}

// v0.6.2+：生成新的 ed25519 SSH 密钥
// 返回 { privatePath, publicKey, fingerprint, sshKeygenOutput }
export interface GenerateSshKeyInput {
  /** 私钥文件路径（如 C:\Users\kunyao\.ssh\id_ed25519_github）；留空 + host → fallback `~/.ssh/id_ed25519_<host>` */
  keyPath?: string;
  /** 注释（一般填 "kunyao@kunyaogit.local (GitHub key)"） */
  comment: string;
  /** 私钥 passphrase；空串 = 不设 passphrase（方便自动化） */
  passphrase?: string;
  /**
   * v0.6.3+：host 标签（仅当 keyPath 留空时生效）
   * 用于自动生成 `~/.ssh/id_ed25519_<host>` 路径
   */
  host?: 'github.com' | 'gitee.com';
}

export interface GenerateSshKeyResult {
  privatePath: string;
  publicKey: string;
  fingerprint: string;
  /** ssh-keygen 完整输出（含 randomart 等） */
  sshKeygenOutput: string;
}

export async function generateSshKey(
  input: GenerateSshKeyInput
): Promise<GenerateSshKeyResult> {
  let { keyPath, comment, passphrase = '', host } = input;
  if (!comment || typeof comment !== 'string') {
    throw new Error('comment 不能为空');
  }
  // v0.6.3 修复：keyPath 留空 + 有 host → fallback `~/.ssh/id_ed25519_<host>`
  // （之前是 throw，这是 v0.6.2 真实使用中暴露的 bug：前端传 '' 期望 fallback 但后端 throw）
  if (!keyPath || keyPath.trim() === '') {
    if (!host) {
      throw new Error('keyPath 为空时必须传 host 字段（用于自动生成 ~/.ssh/id_ed25519_<host>）');
    }
    const sshDir = path.join(os.homedir(), '.ssh');
    if (!fs.existsSync(sshDir)) {
      fs.mkdirSync(sshDir, { recursive: true });
    }
    keyPath = path.join(sshDir, `id_ed25519_${host === 'github.com' ? 'github' : 'gitee'}`);
  }
  // 校验 keyPath 父目录存在
  const parentDir = path.dirname(keyPath);
  if (!fs.existsSync(parentDir)) {
    try {
      fs.mkdirSync(parentDir, { recursive: true });
    } catch (e) {
      throw new Error(`创建私钥目录失败：${parentDir}（${(e as Error).message}）`);
    }
  }
  // 校验 keyPath 文件**不存在**（不覆盖已有 key）
  if (fs.existsSync(keyPath)) {
    throw new Error(`私钥文件已存在：${keyPath}（请先删除或换名字）`);
  }

  // 调 ssh-keygen
  const args = [
    '-t', 'ed25519',
    '-f', keyPath,
    '-N', passphrase,
    '-C', comment,
  ];

  const { stdout, stderr } = await execFileAsync('ssh-keygen', args);

  // 读 .pub
  const pubKey = fs.readFileSync(`${keyPath}.pub`, 'utf-8').trim();
  // 算 fingerprint
  const { stdout: fpOut } = await execFileAsync('ssh-keygen', ['-lf', keyPath]);
  // fpOut 形如 "256 SHA256:xxxxx user@host (ED25519)"
  const m = fpOut.match(/SHA256:\S+/);
  const fingerprint = m ? m[0] : fpOut.trim();

  return {
    privatePath: keyPath,
    publicKey: pubKey,
    fingerprint,
    sshKeygenOutput: (stdout + stderr).trim(),
  };
}

// v0.6.2+：读 .pub 文件
export function readPublicKey(keyPath: string): { publicKey: string; fingerprint: string } | null {
  if (!keyPath) return null;
  const pubPath = `${keyPath}.pub`;
  if (!fs.existsSync(pubPath)) return null;
  const publicKey = fs.readFileSync(pubPath, 'utf-8').trim();
  return { publicKey, fingerprint: '' };
}

// v0.6.2+：读 ~/.ssh/config 全文
export function readSshConfigFile(): string {
  const configPath = path.join(os.homedir(), '.ssh', 'config');
  if (!fs.existsSync(configPath)) return '';
  return fs.readFileSync(configPath, 'utf-8');
}

// v0.6.2+：写 ~/.ssh/config（用 electron/lib/sshConfig.writeSshConfig 重写 KunyaoGit 段）
export function writeSshConfigFile(
  blocks: { host: string; keyPath?: string }[]
): { ok: boolean; error?: string; path: string } {
  const sshDir = path.join(os.homedir(), '.ssh');
  const configPath = path.join(sshDir, 'config');
  try {
    if (!fs.existsSync(sshDir)) {
      fs.mkdirSync(sshDir, { recursive: true });
    }
    // 写文件前确保权限 0600（OpenSSH 要求）
    if (fs.existsSync(configPath)) {
      try { fs.chmodSync(configPath, 0o600); } catch { /* ignore */ }
    }
    const current = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf-8') : '';
    // v0.6.3+ 静态 import 在文件顶部（之前 require 在 dev ESM 下抛 "require is not defined"）
    const next = writeSshConfig(current, blocks);
    fs.writeFileSync(configPath, next, 'utf-8');
    try { fs.chmodSync(configPath, 0o600); } catch { /* ignore */ }
    return { ok: true, path: configPath };
  } catch (e) {
    return { ok: false, error: (e as Error).message, path: configPath };
  }
}

// v0.6.3+：列出 ~/.ssh 下所有 ed25519/rsa 私钥（带 .pub 的才算一对完整 key）
// 返回 { name, path, fingerprint, host? }[]
//   - name: 文件 basename（不含 .pub）
//   - path: 私钥绝对路径
//   - fingerprint: SHA256:...（取自 .pub 旁边的私钥）；失败时为 ''
//   - host: 根据后缀推断 'github' | 'gitee' | undefined
export interface SshKeyInfo {
  name: string;
  path: string;
  fingerprint: string;
  /** 根据文件名后缀推断的关联 host（仅识别 github/gitee，其他返回 undefined） */
  host?: 'github.com' | 'gitee.com';
}

const HOST_FROM_NAME_RE = /id_ed25519_(github|gitee)$/;

export async function listSshKeys(): Promise<SshKeyInfo[]> {
  const sshDir = path.join(os.homedir(), '.ssh');
  if (!fs.existsSync(sshDir)) return [];
  let entries: string[];
  try {
    entries = fs.readdirSync(sshDir);
  } catch {
    return [];
  }
  const result: SshKeyInfo[] = [];
  for (const name of entries) {
    // 私钥文件（无 .pub 后缀），且对应的 .pub 存在
    if (name.endsWith('.pub')) continue;
    if (!/^id_(ed25519|rsa|ecdsa|dsa)/.test(name)) continue;
    const keyPath = path.join(sshDir, name);
    const pubPath = `${keyPath}.pub`;
    if (!fs.existsSync(pubPath)) continue;
    let stat: fs.Stats;
    try {
      stat = fs.statSync(keyPath);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;
    // 算 fingerprint（swing & miss 也不致命，返回空串即可）
    let fingerprint = '';
    try {
      const { stdout } = await execFileAsync('ssh-keygen', ['-lf', keyPath]);
      const m = stdout.match(/SHA256:\S+/);
      if (m) fingerprint = m[0];
    } catch {
      /* ignore */
    }
    const m = name.match(HOST_FROM_NAME_RE);
    const host: SshKeyInfo['host'] = m
      ? (m[1] === 'github' ? 'github.com' : 'gitee.com')
      : undefined;
    result.push({ name, path: keyPath, fingerprint, host });
  }
  // 按 host（github > gitee > undefined）排序，再按 name
  result.sort((a, b) => {
    const order = (h?: string) => (h === 'github.com' ? 0 : h === 'gitee.com' ? 1 : 2);
    const oa = order(a.host);
    const ob = order(b.host);
    if (oa !== ob) return oa - ob;
    return a.name.localeCompare(b.name);
  });
  return result;
}

// v0.6.3+：删除一对 SSH key（私钥 + .pub）
// 安全：路径必须在 ~/.ssh/ 下，且文件名必须是 id_ 前缀的私钥
export async function deleteSshKey(
  keyPath: string
): Promise<{ ok: boolean; error?: string }> {
  if (!keyPath || typeof keyPath !== 'string') {
    return { ok: false, error: 'keyPath 不能为空' };
  }
  const sshDir = path.join(os.homedir(), '.ssh');
  const resolved = path.resolve(keyPath);
  if (!resolved.startsWith(sshDir + path.sep) && resolved !== sshDir) {
    return { ok: false, error: `只能删除 ~/.ssh/ 下的私钥：${resolved}` };
  }
  const name = path.basename(resolved);
  if (!/^id_(ed25519|rsa|ecdsa|dsa)/.test(name)) {
    return { ok: false, error: `只能删除 id_* 私钥：${name}` };
  }
  try {
    if (fs.existsSync(resolved)) fs.unlinkSync(resolved);
    const pubPath = `${resolved}.pub`;
    if (fs.existsSync(pubPath)) fs.unlinkSync(pubPath);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
