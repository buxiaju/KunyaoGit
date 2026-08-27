// v0.6.3+ SSH key 列表 / 删除 单测
//
// 关键点：
// - listSshKeys 扫 ~/.ssh/id_* + 配对 .pub；用临时 home 避免污染用户 .ssh
// - deleteSshKey 路径必须在 ~/.ssh/ 下 + 文件名必须 id_* 前缀（安全护栏）

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const execFileMock = vi.fn();
vi.mock('node:child_process', () => ({
  default: { execFile: (...args: any[]) => execFileMock(...args) },
  execFile: (...args: any[]) => execFileMock(...args),
}));

let tmpHome: string;
let realHomedir: () => string;
let listSshKeys: typeof import('../../electron/services/settings').listSshKeys;
let deleteSshKey: typeof import('../../electron/services/settings').deleteSshKey;

beforeEach(async () => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'sshkeys-home-'));
  realHomedir = os.homedir;
  os.homedir = () => tmpHome;
  execFileMock.mockReset();
  // mock ssh-keygen -lf 算 fingerprint
  execFileMock.mockImplementation((...all: any[]) => {
    const cb = all[all.length - 1];
    if (typeof cb !== 'function') return;
    // 返回包含 SHA256:... 的输出（被测函数只 match /SHA256:\S+/)
    cb(null, { stdout: '256 SHA256:abcdef1234567890 user@host (ED25519)', stderr: '' });
  });
  ({ listSshKeys, deleteSshKey } = await import('../../electron/services/settings'));
});

afterEach(() => {
  os.homedir = realHomedir;
  if (tmpHome && fs.existsSync(tmpHome)) {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

describe('listSshKeys（v0.6.3+ 列出 ~/.ssh 私钥）', () => {
  it('~/.ssh 不存在 → 返回空数组', async () => {
    const list = await listSshKeys();
    expect(list).toEqual([]);
  });

  it('~/.ssh 空目录 → 返回空数组', async () => {
    fs.mkdirSync(path.join(tmpHome, '.ssh'));
    const list = await listSshKeys();
    expect(list).toEqual([]);
  });

  it('id_ed25519_github + .pub 配对 → 识别为 github.com', async () => {
    const sshDir = path.join(tmpHome, '.ssh');
    fs.mkdirSync(sshDir);
    fs.writeFileSync(path.join(sshDir, 'id_ed25519_github'), 'priv\n');
    fs.writeFileSync(path.join(sshDir, 'id_ed25519_github.pub'), 'ssh-ed25519 AAAA pub\n');
    const list = await listSshKeys();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('id_ed25519_github');
    expect(list[0].host).toBe('github.com');
    expect(list[0].fingerprint).toContain('SHA256:');
  });

  it('id_ed25519_gitee + .pub → host = gitee.com', async () => {
    const sshDir = path.join(tmpHome, '.ssh');
    fs.mkdirSync(sshDir);
    fs.writeFileSync(path.join(sshDir, 'id_ed25519_gitee'), 'priv\n');
    fs.writeFileSync(path.join(sshDir, 'id_ed25519_gitee.pub'), 'pub\n');
    const list = await listSshKeys();
    expect(list[0].host).toBe('gitee.com');
  });

  it('id_ed25519（无后缀）→ host undefined', async () => {
    const sshDir = path.join(tmpHome, '.ssh');
    fs.mkdirSync(sshDir);
    fs.writeFileSync(path.join(sshDir, 'id_ed25519'), 'priv\n');
    fs.writeFileSync(path.join(sshDir, 'id_ed25519.pub'), 'pub\n');
    const list = await listSshKeys();
    expect(list[0].host).toBeUndefined();
  });

  it('没有 .pub 配对的私钥 → 不列出', async () => {
    const sshDir = path.join(tmpHome, '.ssh');
    fs.mkdirSync(sshDir);
    fs.writeFileSync(path.join(sshDir, 'id_ed25519_lonely'), 'priv\n');
    const list = await listSshKeys();
    expect(list).toEqual([]);
  });

  it('.pub 单文件（无对应私钥）→ 不列出', async () => {
    const sshDir = path.join(tmpHome, '.ssh');
    fs.mkdirSync(sshDir);
    fs.writeFileSync(path.join(sshDir, 'id_ed25519_ghost.pub'), 'pub\n');
    const list = await listSshKeys();
    expect(list).toEqual([]);
  });

  it('非 id_* 文件（random.txt）→ 不列出', async () => {
    const sshDir = path.join(tmpHome, '.ssh');
    fs.mkdirSync(sshDir);
    fs.writeFileSync(path.join(sshDir, 'random.txt'), 'whatever\n');
    fs.writeFileSync(path.join(sshDir, 'random.txt.pub'), 'whatever\n');
    const list = await listSshKeys();
    expect(list).toEqual([]);
  });

  it('多个 key → 排序：github > gitee > undefined', async () => {
    const sshDir = path.join(tmpHome, '.ssh');
    fs.mkdirSync(sshDir);
    for (const n of ['id_ed25519', 'id_ed25519_github', 'id_ed25519_gitee']) {
      fs.writeFileSync(path.join(sshDir, n), 'priv\n');
      fs.writeFileSync(path.join(sshDir, n + '.pub'), 'pub\n');
    }
    const list = await listSshKeys();
    expect(list.map((k) => k.name)).toEqual([
      'id_ed25519_github',
      'id_ed25519_gitee',
      'id_ed25519',
    ]);
  });

  it('id_rsa + .pub 配对 → 列出（兼容老 key）', async () => {
    const sshDir = path.join(tmpHome, '.ssh');
    fs.mkdirSync(sshDir);
    fs.writeFileSync(path.join(sshDir, 'id_rsa'), 'priv\n');
    fs.writeFileSync(path.join(sshDir, 'id_rsa.pub'), 'pub\n');
    const list = await listSshKeys();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('id_rsa');
  });
});

describe('deleteSshKey（v0.6.3+ 删除一对私钥）', () => {
  it('空 keyPath → ok=false', async () => {
    const r = await deleteSshKey('');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/keyPath/);
  });

  it('路径在 ~/.ssh/ 之外 → 拒绝', async () => {
    const r = await deleteSshKey('C:/Windows/System32/drivers/etc/hosts');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/只能删除/);
  });

  it('路径在 ~/.ssh/ 下但文件名不是 id_ 前缀 → 拒绝', async () => {
    const sshDir = path.join(tmpHome, '.ssh');
    fs.mkdirSync(sshDir);
    const target = path.join(sshDir, 'random.txt');
    fs.writeFileSync(target, 'whatever\n');
    const r = await deleteSshKey(target);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/id_/);
  });

  it('合法 id_ed25519_github → 删私钥 + .pub，ok=true', async () => {
    const sshDir = path.join(tmpHome, '.ssh');
    fs.mkdirSync(sshDir);
    const target = path.join(sshDir, 'id_ed25519_github');
    fs.writeFileSync(target, 'priv\n');
    fs.writeFileSync(target + '.pub', 'pub\n');
    const r = await deleteSshKey(target);
    expect(r.ok).toBe(true);
    expect(fs.existsSync(target)).toBe(false);
    expect(fs.existsSync(target + '.pub')).toBe(false);
  });

  it('只有私钥没有 .pub → 删私钥，ok=true', async () => {
    const sshDir = path.join(tmpHome, '.ssh');
    fs.mkdirSync(sshDir);
    const target = path.join(sshDir, 'id_ed25519_github');
    fs.writeFileSync(target, 'priv\n');
    const r = await deleteSshKey(target);
    expect(r.ok).toBe(true);
    expect(fs.existsSync(target)).toBe(false);
  });

  it('不存在的文件 → ok=true（幂等）', async () => {
    const sshDir = path.join(tmpHome, '.ssh');
    fs.mkdirSync(sshDir);
    const r = await deleteSshKey(path.join(sshDir, 'id_ed25519_ghost'));
    expect(r.ok).toBe(true);
  });
});
