import Store from 'electron-store';
import { app } from 'electron';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import type { AppSettings } from '../../shared/types';

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
 * 把 ssh -T 输出解析成结构化结果（v0.6+ SSH 推送支持 / 纯函数）。
 * 抽出是为了便于单元测试 —— testSshConnection 在不同环境下行为差异大（mock execFile 难），
 * 解析层是稳定可测的。
 */
export function parseSshResult(
  stdout: string,
  stderr: string
): { ok: boolean; message: string; error?: string } {
  if (/successfully authenticated/i.test(stdout) || /Hi\s+\S+/i.test(stdout)) {
    const m = stdout.match(/Hi\s+(\S+?)!/);
    return { ok: true, message: m ? `已认证为 ${m[1]}` : stdout.trim() };
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
  args.push('git@github.com');

  try {
    const { stdout, stderr } = await execFileAsync('ssh', args);
    // ssh -T 即使认证成功也是退出码 1（GitHub 不开 shell），走 stdout 解析
    return parseSshResult(stdout || '', stderr || '');
  } catch (e: any) {
    // execFile reject 时，e.stdout / e.stderr 也可能有内容（GitHub ssh -T 认证成功就是 reject 1 + 有 stdout）
    const stdout: string = e?.stdout || '';
    const stderr: string = e?.stderr || '';
    // 先尝试当成"成功"：GitHub ssh -T 总是 reject 1 + 有 Hi 消息
    if (/successfully authenticated/i.test(stdout) || /Hi\s+\S+/i.test(stdout)) {
      const m = stdout.match(/Hi\s+(\S+?)!/);
      return { ok: true, message: m ? `已认证为 ${m[1]}` : stdout.trim() };
    }
    // 否则走正常解析
    if (stdout || stderr) {
      return parseSshResult(stdout, stderr);
    }
    return { ok: false, message: '', error: (e as Error)?.message || 'ssh 命令执行失败' };
  }
}
