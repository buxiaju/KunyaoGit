// v0.6.3+ SSH 生成：空 keyPath + host 自动 fallback 单测
//
// v0.6.2 真实使用 bug：前端传 keyPath:'' 期望后端用 ~/.ssh/<genKeyName> 兜底，
// 但后端直接 throw 'keyPath 不能为空'。本测试覆盖 v0.6.3 fix 后的行为。
//
// 关键点：mock child_process.execFile 让 ssh-keygen 不真被调用；
// 用临时目录当 home 避免污染用户 ~/.ssh。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// mock child_process.execFile → 模拟 ssh-keygen 成功
const execFileMock = vi.fn();
vi.mock('node:child_process', () => ({
  default: { execFile: (...args: any[]) => execFileMock(...args) },
  execFile: (...args: any[]) => execFileMock(...args),
}));

let tmpHome: string;
let realHomedir: () => string;
let generateSshKey: typeof import('../../electron/services/settings').generateSshKey;

beforeEach(async () => {
  // 临时 home 目录，让 fallback 路径稳定
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'sshgen-home-'));
  realHomedir = os.homedir;
  os.homedir = () => tmpHome;
  execFileMock.mockReset();
  // 注意：vi.mock 替换 execFile 后，util.promisify(execFile) 走 **default** 路径
  // （custom 字段丢失），所以 await execFileAsync(...) 拿到的是 cb 的**第二个参数**本身，
  // 不是 {stdout, stderr}。sshConnection.test.ts 的被测函数解构的是 `stdout` / `stderr` 字段，
  // 本测试解构的是 `stdout: fpOut`，所以这里必须把 stdout 整个包成 { stdout, stderr }。
  // cb(err, val) → val = await 的结果；要兼容被测函数解构。
  // 这里把 stdout/stderr 都包成对象，让被测函数 const { stdout } = await ... 能解构成功。
  execFileMock.mockImplementation((...all: any[]) => {
    const cb = all[all.length - 1];
    if (typeof cb !== 'function') return;
    const callCount = execFileMock.mock.calls.length; // 1-based after this call
    const args = (all[1] || []) as string[];
    if (callCount === 1) {
      // ssh-keygen -t ed25519 -f <keyPath> -N '' -C <comment>
      const fIdx = args.indexOf('-f');
      if (fIdx >= 0) {
        const fp = args[fIdx + 1];
        fs.writeFileSync(fp, 'fake-private-key\n');
        fs.writeFileSync(`${fp}.pub`, 'ssh-ed25519 AAAA fake@local (comment)\n');
      }
      // 第一次被测函数解构 { stdout, stderr }：传对象
      cb(null, { stdout: 'ssh-keygen stdout', stderr: '' });
    } else {
      // ssh-keygen -lf <keyPath>：被测函数 const { stdout: fpOut } = ...
      cb(null, { stdout: '256 SHA256:abcd1234efgh user@host (ED25519)', stderr: '' });
    }
  });
  ({ generateSshKey } = await import('../../electron/services/settings'));
});

afterEach(() => {
  os.homedir = realHomedir;
  if (tmpHome && fs.existsSync(tmpHome)) {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

describe('generateSshKey（v0.6.3+ keyPath fallback）', () => {
  it('空 keyPath + host=github.com → 自动写到 ~/.ssh/id_ed25519_github', async () => {
    const r = await generateSshKey({
      keyPath: '',
      host: 'github.com',
      comment: 'kunyao@kunyaogit.local (github.com)',
      passphrase: '',
    });
    const expected = path.join(tmpHome, '.ssh', 'id_ed25519_github');
    expect(r.privatePath).toBe(expected);
    expect(fs.existsSync(expected)).toBe(true);
    expect(r.publicKey).toContain('ssh-ed25519');
    expect(r.fingerprint).toContain('SHA256:');
  });

  it('空 keyPath + host=gitee.com → 自动写到 ~/.ssh/id_ed25519_gitee', async () => {
    const r = await generateSshKey({
      keyPath: '',
      host: 'gitee.com',
      comment: 'kunyao@kunyaogit.local (gitee.com)',
    });
    const expected = path.join(tmpHome, '.ssh', 'id_ed25519_gitee');
    expect(r.privatePath).toBe(expected);
    expect(fs.existsSync(expected)).toBe(true);
  });

  it('undefined keyPath + host → 同样 fallback（v0.6.3 接口）', async () => {
    const r = await generateSshKey({
      host: 'github.com',
      comment: 'k@k (github.com)',
    });
    expect(r.privatePath).toBe(path.join(tmpHome, '.ssh', 'id_ed25519_github'));
  });

  it('空 keyPath + 无 host → throw 明确错误（指明要传 host）', async () => {
    await expect(
      generateSshKey({
        keyPath: '',
        comment: 'k@k',
      })
    ).rejects.toThrow(/keyPath 为空时必须传 host/);
  });

  it('comment 缺失 → throw', async () => {
    await expect(
      generateSshKey({
        keyPath: '/tmp/some-key',
        comment: '',
      })
    ).rejects.toThrow(/comment/);
  });

  it('空 keyPath + ~/.ssh 不存在 → 自动创建目录', async () => {
    // tmpHome 下还没有 .ssh 目录（mkdtempSync 创建的是空的）
    const sshDir = path.join(tmpHome, '.ssh');
    expect(fs.existsSync(sshDir)).toBe(false);
    await generateSshKey({
      keyPath: '',
      host: 'github.com',
      comment: 'k@k',
    });
    expect(fs.existsSync(sshDir)).toBe(true);
  });

  it('空 keyPath + 目标私钥文件已存在 → throw 私钥文件已存在', async () => {
    // 预先放一个假文件
    const target = path.join(tmpHome, '.ssh', 'id_ed25519_github');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'existing\n');
    await expect(
      generateSshKey({
        keyPath: '',
        host: 'github.com',
        comment: 'k@k',
      })
    ).rejects.toThrow(/私钥文件已存在/);
  });

  it('传显式 keyPath + host → 用显式路径（host 不影响）', async () => {
    const explicit = path.join(tmpHome, 'my-custom-key');
    const r = await generateSshKey({
      keyPath: explicit,
      host: 'gitee.com', // 传了但显式 keyPath 优先
      comment: 'k@k',
    });
    expect(r.privatePath).toBe(explicit);
  });

  it('空 keyPath + host → passphrase 透传给 ssh-keygen', async () => {
    await generateSshKey({
      keyPath: '',
      host: 'github.com',
      comment: 'k@k',
      passphrase: 'my-secret-pass',
    });
    // 检查 mock 收到的 args 包含 -N my-secret-pass
    const calls = execFileMock.mock.calls;
    const firstArgs = calls[0][1] as string[];
    const nIdx = firstArgs.indexOf('-N');
    expect(firstArgs[nIdx + 1]).toBe('my-secret-pass');
  });
});
