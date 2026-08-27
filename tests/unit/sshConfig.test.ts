// v0.6.2+ SSH 按 host 路由：OpenSSH config 写入工具单测
//
// 关键点：本模块是**纯函数**（不调 fs / shell），所以单测无 mock。

import { describe, it, expect } from 'vitest';
import {
  MANAGE_START,
  MANAGE_END,
  renderBlock,
  renderManagedSection,
  stripManagedSection,
  writeSshConfig,
  getEffectiveKeyForHost,
  detectRemoteHost,
} from '../../electron/lib/sshConfig';

describe('renderBlock（v0.6.2+ SSH 按 host）', () => {
  it('github.com + keyPath 渲染标准 OpenSSH 块', () => {
    const out = renderBlock({ host: 'github.com', keyPath: '/home/u/.ssh/id_ed25519_github' });
    expect(out).toContain('Host github.com');
    expect(out).toContain('  IdentityFile /home/u/.ssh/id_ed25519_github');
    expect(out).toContain('  IdentitiesOnly yes');
    expect(out).toContain('  StrictHostKeyChecking accept-new');
  });

  it('无 keyPath → 渲染空字符串（让外层过滤掉）', () => {
    expect(renderBlock({ host: 'github.com' })).toBe('');
    expect(renderBlock({ host: 'github.com', keyPath: '' })).toBe('');
  });

  it('identitiesOnly=false → 跳过 IdentitiesOnly 行', () => {
    const out = renderBlock({ host: 'gitee.com', keyPath: '/k', identitiesOnly: false });
    expect(out).not.toContain('IdentitiesOnly');
  });

  it('strictHostKeyChecking 自定义值', () => {
    const out = renderBlock({ host: 'gitee.com', keyPath: '/k', strictHostKeyChecking: 'no' });
    expect(out).toContain('StrictHostKeyChecking no');
  });
});

describe('renderManagedSection', () => {
  it('多个 block 拼成一段，前后包标记', () => {
    const out = renderManagedSection([
      { host: 'github.com', keyPath: '/k1' },
      { host: 'gitee.com', keyPath: '/k2' },
    ]);
    expect(out).toContain(MANAGE_START);
    expect(out).toContain(MANAGE_END);
    expect(out.indexOf(MANAGE_START)).toBeLessThan(out.indexOf('Host github.com'));
    expect(out.indexOf('Host gitee.com')).toBeLessThan(out.indexOf(MANAGE_END));
  });

  it('全部空 → 返回空字符串（外层不写标记）', () => {
    expect(renderManagedSection([])).toBe('');
    expect(renderManagedSection([{ host: 'github.com' }])).toBe('');
  });
});

describe('stripManagedSection', () => {
  it('无标记 → before 全文，after 空', () => {
    const content = 'Host foo\n  User test\n';
    const r = stripManagedSection(content);
    expect(r.before).toBe(content);
    expect(r.after).toBe('');
  });

  it('有标记 → before/after 都不含标记', () => {
    const content = `Host foo\n  User test\n${MANAGE_START}\nHost github.com\n  IdentityFile /k\n${MANAGE_END}\nHost bar\n  User baz\n`;
    const r = stripManagedSection(content);
    expect(r.before).toBe('Host foo\n  User test\n');
    expect(r.before).not.toContain(MANAGE_START);
    expect(r.after).toBe('Host bar\n  User baz\n');
    expect(r.after).not.toContain(MANAGE_END);
  });

  it('标记不完整（缺 END）→ 保守不动（before = 全文）', () => {
    const content = `Host foo\n${MANAGE_START}\nHost github.com\n`;
    const r = stripManagedSection(content);
    expect(r.before).toBe(content);
    expect(r.after).toBe('');
  });
});

describe('writeSshConfig', () => {
  it('空文件 + 1 个 block → 追加 KunyaoGit 块', () => {
    const out = writeSshConfig('', [{ host: 'github.com', keyPath: '/k' }]);
    expect(out).toContain('Host github.com');
    expect(out).toContain('IdentityFile /k');
    expect(out).toContain(MANAGE_START);
  });

  it('已有 KunyaoGit 块 → 替换', () => {
    const old = `Host foo\n${MANAGE_START}\nHost github.com\n  IdentityFile /OLD\n${MANAGE_END}\nHost bar\n`;
    const out = writeSshConfig(old, [{ host: 'github.com', keyPath: '/NEW' }]);
    expect(out).not.toContain('/OLD');
    expect(out).toContain('IdentityFile /NEW');
    expect(out).toContain('Host foo');
    expect(out).toContain('Host bar');
  });

  it('块全空 → 等价于"删 KunyaoGit 段"', () => {
    const old = `Host foo\n${MANAGE_START}\nHost github.com\n  IdentityFile /k\n${MANAGE_END}\nHost bar\n`;
    const out = writeSshConfig(old, []);
    expect(out).not.toContain(MANAGE_START);
    expect(out).not.toContain('IdentityFile');
    expect(out).toContain('Host foo');
    expect(out).toContain('Host bar');
  });

  it('保留用户自定义 Host 块（不删）', () => {
    const old = `Host my-server\n  HostName 1.2.3.4\n  User kunyao\n${MANAGE_START}\nHost github.com\n  IdentityFile /k\n${MANAGE_END}\n`;
    const out = writeSshConfig(old, [{ host: 'gitee.com', keyPath: '/kg' }]);
    expect(out).toContain('Host my-server');
    expect(out).toContain('HostName 1.2.3.4');
    expect(out).not.toContain('github.com');  // 旧 github.com 块被替换（只保留 gitee.com 新块）
    expect(out).toContain('Host gitee.com');
  });
});

describe('getEffectiveKeyForHost', () => {
  it('github.com 命中 sshKeysByHost.github', () => {
    const k = getEffectiveKeyForHost('github.com', { github: '/g', gitee: '/gt' }, '/fallback');
    expect(k).toBe('/g');
  });
  it('gitee.com 命中 sshKeysByHost.gitee', () => {
    const k = getEffectiveKeyForHost('gitee.com', { github: '/g', gitee: '/gt' }, '/fallback');
    expect(k).toBe('/gt');
  });
  it('sshKeysByHost.github 未配 → fallback', () => {
    const k = getEffectiveKeyForHost('github.com', { gitee: '/gt' }, '/fallback');
    expect(k).toBe('/fallback');
  });
  it('其他 host（gitlab.com）→ 直接 fallback（不查 sshKeysByHost）', () => {
    const k = getEffectiveKeyForHost('gitlab.com', { github: '/g' }, '/fallback');
    expect(k).toBe('/fallback');
  });
  it('sshKeysByHost undefined → fallback', () => {
    expect(getEffectiveKeyForHost('github.com', undefined, '/f')).toBe('/f');
  });
  it('fallback undefined → undefined（让 git 用 OpenSSH 默认）', () => {
    expect(getEffectiveKeyForHost('github.com', { github: '/g' }, undefined)).toBe('/g');
    expect(getEffectiveKeyForHost('github.com', undefined, undefined)).toBeUndefined();
  });
  it('host 大小写不敏感', () => {
    const k = getEffectiveKeyForHost('GITHUB.COM', { github: '/g' }, undefined);
    expect(k).toBe('/g');
  });
});

describe('detectRemoteHost', () => {
  it('HTTPS GitHub URL', () => {
    expect(detectRemoteHost('https://github.com/foo/bar.git')).toBe('github.com');
  });
  it('SSH scp-like GitHub URL', () => {
    expect(detectRemoteHost('git@github.com:foo/bar.git')).toBe('github.com');
  });
  it('Gitee URL', () => {
    expect(detectRemoteHost('https://gitee.com/buxiaju/repo.git')).toBe('gitee.com');
  });
  it('其他 host（gitlab）→ "other"', () => {
    expect(detectRemoteHost('https://gitlab.com/foo/bar.git')).toBe('other');
  });
  it('空 / null / undefined → null', () => {
    expect(detectRemoteHost(null)).toBeNull();
    expect(detectRemoteHost(undefined)).toBeNull();
    expect(detectRemoteHost('')).toBeNull();
  });
});
