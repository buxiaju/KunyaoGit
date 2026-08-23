// v0.4+ 命令面板注册表测试
// 测 filterCommands 的 when 门控 + query 匹配

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useRepoStore } from '../../src/stores/repo';
import { commands, filterCommands } from '../../src/config/commands';
import type { RepoInfo, RemoteInfo } from '../../shared/types';

const fakeRepo: RepoInfo = {
  path: 'C:/fake/repo',
  name: 'fake-repo',
  currentBranch: 'main',
};

const githubRemote: RemoteInfo = {
  name: 'origin',
  url: 'https://github.com/foo/bar.git',
};

describe('commands 注册表', () => {
  it('所有命令都有唯一 id', () => {
    const ids = commands.map((c) => c.id);
    const unique = new Set(ids);
    expect(unique.size, `存在重复 id: ${ids.filter((v, i) => ids.indexOf(v) !== i)}`).toBe(ids.length);
  });

  it('所有命令都有 titleKey / category / run', () => {
    for (const c of commands) {
      expect(c.titleKey, `${c.id} 缺少 titleKey`).toBeTruthy();
      expect(c.category, `${c.id} 缺少 category`).toBeTruthy();
      expect(typeof c.run, `${c.id} 的 run 不是函数`).toBe('function');
    }
  });

  it('category 只能是 4 个合法值', () => {
    const valid = ['git', 'navigation', 'view', 'settings'];
    for (const c of commands) {
      expect(valid, `${c.id} 的 category "${c.category}" 非法`).toContain(c.category);
    }
  });

  it('4 个 category 都至少有一条命令', () => {
    const cats = new Set(commands.map((c) => c.category));
    expect(cats.has('git')).toBe(true);
    expect(cats.has('navigation')).toBe(true);
    expect(cats.has('view')).toBe(true);
    expect(cats.has('settings')).toBe(true);
  });

  it('命令总数达到 v0.4 目标（>= 15 条）', () => {
    expect(commands.length).toBeGreaterThanOrEqual(15);
  });
});

describe('filterCommands — when 门控', () => {
  beforeEach(() => {
    // 重置 store 到"没有仓库"状态
    useRepoStore.setState({ current: null, remotes: [], branches: [], status: [], log: [] });
  });

  it('没有打开仓库时，需要仓库的命令被过滤掉', () => {
    const list = filterCommands('');
    const ids = list.map((c) => c.id);
    // 这些需要 current
    expect(ids).not.toContain('git.fetch');
    expect(ids).not.toContain('git.pull');
    expect(ids).not.toContain('git.push');
    expect(ids).not.toContain('git.stash');
    expect(ids).not.toContain('git.refresh');
    expect(ids).not.toContain('nav.repo');
    expect(ids).not.toContain('nav.releases');
  });

  it('没有打开仓库时，无条件命令仍然可用', () => {
    const list = filterCommands('');
    const ids = list.map((c) => c.id);
    expect(ids).toContain('nav.home');
    expect(ids).toContain('nav.settings');
    expect(ids).toContain('nav.openRepo');
    expect(ids).toContain('view.theme.dark');
    expect(ids).toContain('view.lang.zh');
  });

  it('打开仓库后，需要仓库的命令出现', () => {
    useRepoStore.setState({ current: fakeRepo });
    const ids = filterCommands('').map((c) => c.id);
    expect(ids).toContain('git.fetch');
    expect(ids).toContain('git.pull');
    expect(ids).toContain('git.stash');
    expect(ids).toContain('git.refresh');
    expect(ids).toContain('nav.repo');
    expect(ids).toContain('nav.releases');
  });

  it('git.push 额外要求有 remote', () => {
    // 只有仓库没 remote → push 不可用
    useRepoStore.setState({ current: fakeRepo, remotes: [] });
    expect(filterCommands('').map((c) => c.id)).not.toContain('git.push');

    // 有 remote → push 可用
    useRepoStore.setState({ current: fakeRepo, remotes: [githubRemote] });
    expect(filterCommands('').map((c) => c.id)).toContain('git.push');
  });
});

describe('filterCommands — query 匹配', () => {
  beforeEach(() => {
    // 用"有仓库 + 有 remote"的完整状态，让所有命令可见
    useRepoStore.setState({
      current: fakeRepo,
      remotes: [githubRemote],
      branches: [],
      status: [],
      log: [],
    });
  });

  it('空 query 返回所有可用命令', () => {
    const all = filterCommands('');
    // 此时所有 when 都满足，应等于全量
    expect(all.length).toBe(commands.length);
  });

  it('只有空白的 query 等同于空 query', () => {
    expect(filterCommands('   ').length).toBe(filterCommands('').length);
  });

  it('按 titleKey 叶子名匹配', () => {
    // 'command.fetch' 的叶子是 'fetch'
    const r = filterCommands('fetch');
    expect(r.length).toBeGreaterThan(0);
    expect(r.some((c) => c.id === 'git.fetch')).toBe(true);
  });

  it('按 id 匹配', () => {
    const r = filterCommands('theme');
    const ids = r.map((c) => c.id);
    expect(ids).toContain('view.theme.dark');
    expect(ids).toContain('view.theme.ocean');
    expect(ids).toContain('view.theme.light');
  });

  it('大小写不敏感', () => {
    const lower = filterCommands('push');
    const upper = filterCommands('PUSH');
    expect(upper.length).toBe(lower.length);
    expect(upper.length).toBeGreaterThan(0);
  });

  it('无匹配时返回空数组', () => {
    expect(filterCommands('zzzzzzznonexistent')).toEqual([]);
  });

  it('匹配 nav 前缀返回所有导航命令', () => {
    const r = filterCommands('nav.');
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((c) => c.category === 'navigation')).toBe(true);
  });

  it('部分匹配生效', () => {
    // 'stas' 应能匹配 'stash'
    const r = filterCommands('stas');
    expect(r.some((c) => c.id === 'git.stash')).toBe(true);
  });
});

describe('filterCommands — 组合场景', () => {
  it('query + when 同时生效：无仓库时搜 fetch 无结果', () => {
    useRepoStore.setState({ current: null, remotes: [] });
    expect(filterCommands('fetch')).toEqual([]);
  });

  it('query + when 同时生效：有仓库时搜 fetch 有结果', () => {
    useRepoStore.setState({ current: fakeRepo, remotes: [githubRemote] });
    expect(filterCommands('fetch').length).toBeGreaterThan(0);
  });

  it('过滤结果保持注册表的原始顺序', () => {
    useRepoStore.setState({ current: fakeRepo, remotes: [githubRemote] });
    const filtered = filterCommands('');
    const originalOrder = commands.map((c) => c.id);
    const filteredOrder = filtered.map((c) => c.id);
    // filteredOrder 应是 originalOrder 的子序列（此处是全量，直接相等）
    expect(filteredOrder).toEqual(originalOrder);
  });
});
