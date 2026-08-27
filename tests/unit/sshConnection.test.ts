// v0.6+ SSH 推送支持：testSshConnection / parseSshResult 单元测试

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// mock child_process.execFile 让 ssh 调用可控
// 接受两种形态：
//   - 直接调用: execFile(cmd, args, cb)
//   - promisify 调: execFile(cmd, args, options, cb) —— Node 内置 custom promisify 用此形态
const execFileMock = vi.fn();
vi.mock('node:child_process', () => ({
  default: { execFile: (...args: any[]) => execFileMock(...args) },
  execFile: (...args: any[]) => execFileMock(...args),
}));

const { testSshConnection, parseSshResult } = await import('../../electron/services/settings');

describe('parseSshResult（v0.6+ SSH push，纯函数）', () => {
  it('stdout 含 successfully authenticated → 成功', () => {
    const r = parseSshResult("Hi test-user! You've successfully authenticated, but GitHub does not provide shell access.", '');
    expect(r.ok).toBe(true);
    expect(r.message).toContain('test-user');
  });

  it('stdout 含 Hi <name>! → 成功', () => {
    const r = parseSshResult('Hi buxiaju!', '');
    expect(r.ok).toBe(true);
    expect(r.message).toContain('buxiaju');
  });

  it('Permission denied → 提示加 key 到 GitHub', () => {
    const r = parseSshResult('', 'git@github.com: Permission denied (publickey)');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/拒绝|公钥/);
  });

  it('Could not resolve hostname → 提示 DNS', () => {
    const r = parseSshResult('', 'ssh: Could not resolve hostname github.com');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/DNS|解析/);
  });

  it('Connection timed out → 提示 22 端口', () => {
    const r = parseSshResult('', 'ssh: connect to host github.com port 22: Connection timed out');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/22 端口|代理/);
  });

  it('Connection refused', () => {
    const r = parseSshResult('', 'ssh: connect to host github.com port 22: Connection refused');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/22/);
  });

  it('No such file or directory → 提示装 OpenSSH', () => {
    const r = parseSshResult('', 'ssh: No such file or directory');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/OpenSSH|ssh 命令/);
  });

  it('未识别的输出 → 失败带原始内容', () => {
    const r = parseSshResult('unexpected host key banner', '');
    expect(r.ok).toBe(false);
    expect(r.message).toContain('unexpected host key');
  });

  it('空输出', () => {
    const r = parseSshResult('', '');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/未识别/);
  });

  it('v0.6.3+ stdout 含 ANSI 颜色码 → 解析成功且 message 不含转义符', () => {
    // Gitee 真实输出示例：\x1b[36;01m不侠居(@buxiaju)\x1b[0m（青色加粗用户信息）
    const r = parseSshResult('Hi \x1b[36;01m不侠居(@buxiaju)\x1b[0m! You\'ve successfully authenticated', '');
    expect(r.ok).toBe(true);
    expect(r.message).not.toMatch(/\x1b/);
    expect(r.message).toContain('不侠居(@buxiaju)');
  });

  it('v0.6.3+ stderr 含 ANSI 颜色码 → 不影响 ok 判断（剥后内容识别）', () => {
    const r = parseSshResult('', '\x1b[31mPermission denied (publickey)\x1b[0m');
    expect(r.ok).toBe(false);
    expect(r.error).not.toMatch(/\x1b/);
    expect(r.error).toMatch(/拒绝|公钥/);
  });

  it('v0.6.3+ GitHub 成功消息走 stderr（OpenSSH 行为）→ 仍识别为成功', () => {
    // ssh -T git@github.com 成功时：stdout 通常空，stderr 是 "Hi buxiaju! ...shell access."
    const r = parseSshResult(
      '',
      "Hi buxiaju! You've successfully authenticated, but GitHub does not provide shell access."
    );
    expect(r.ok).toBe(true);
    expect(r.message).toBe('已认证为 buxiaju');
    expect(r.message).not.toMatch(/successfully authenticated/);
  });

  it('v0.6.3+ Gitee 成功消息在 stderr（也常见）→ 仍识别', () => {
    const r = parseSshResult(
      '',
      "Hi 不侠居(@buxiaju)! You've been authenticated"
    );
    expect(r.ok).toBe(true);
    expect(r.message).toBe('已认证为 不侠居(@buxiaju)');
  });
});

describe('stripAnsi（v0.6.3+ ANSI 剥离，纯函数）', () => {
  it('剥颜色码 \\x1b[36;01m...\\x1b[0m', async () => {
    const { stripAnsi } = await import('../../electron/services/settings');
    expect(stripAnsi('\x1b[36;01m不侠居\x1b[0m')).toBe('不侠居');
  });

  it('剥光标控制 \\x1b[2J\\x1b[H', async () => {
    const { stripAnsi } = await import('../../electron/services/settings');
    expect(stripAnsi('\x1b[2J\x1b[Hclear screen')).toBe('clear screen');
  });

  it('不含 ANSI 的字符串原样返回', async () => {
    const { stripAnsi } = await import('../../electron/services/settings');
    expect(stripAnsi('hello world')).toBe('hello world');
  });

  it('空字符串', async () => {
    const { stripAnsi } = await import('../../electron/services/settings');
    expect(stripAnsi('')).toBe('');
  });
});

describe('testSshConnection（v0.6+ SSH 推送支持）', () => {
  let realKey: string;

  beforeEach(() => {
    execFileMock.mockReset();
    // 接受多种 cb 位置：cb 始终是最后一个参数（typeof === 'function'）
    execFileMock.mockImplementation((...all: any[]) => {
      const cb = all[all.length - 1];
      if (typeof cb === 'function') cb(null, '', '');
    });
    realKey = path.join(os.tmpdir(), `kg-test-ssh-${Date.now()}-${Math.random()}.key`);
    fs.writeFileSync(realKey, 'fake key content', 'utf-8');
  });

  afterEach(() => {
    try { fs.unlinkSync(realKey); } catch { /* ignore */ }
  });

  it('传入的 key 文件不存在时立即返回错误（不调 ssh）', async () => {
    const r = await testSshConnection('C:/nope/not-exist.key');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/不存在/);
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it('传入的路径是目录而非文件时返回错误', async () => {
    const r = await testSshConnection(os.tmpdir());
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/不是一个文件/);
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it('空字符串 sshKeyPath 与不传等价', async () => {
    const r = await testSshConnection('');
    expect(execFileMock).toHaveBeenCalled();
    expect(r.ok).toBe(false); // 默认 mock 返回空 stdout
  });

  it('ssh 抛出（e.stdout 含认证成功）→ 当作成功', async () => {
    const err: any = new Error('Command failed');
    err.stdout = "Hi! You've successfully authenticated";
    err.stderr = '';
    execFileMock.mockImplementation((...all: any[]) => {
      const cb = all[all.length - 1];
      if (typeof cb === 'function') cb(err);
    });
    const r = await testSshConnection();
    expect(r.ok).toBe(true);
  });

  it('ssh 抛出（Permission denied） → 当作认证失败', async () => {
    const err: any = new Error('Command failed');
    err.stdout = '';
    err.stderr = 'Permission denied (publickey)';
    execFileMock.mockImplementation((...all: any[]) => {
      const cb = all[all.length - 1];
      if (typeof cb === 'function') cb(err);
    });
    const r = await testSshConnection();
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/拒绝/);
  });
});
