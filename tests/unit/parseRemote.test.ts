// v0.4+ parseRemoteUrl 单元测试
// 覆盖 GitHub / Gitee 的 https / ssh / 带凭据 / 无 .git 后缀等格式

import { describe, it, expect } from 'vitest';
import { parseRemoteUrl } from '../../src/lib/parseRemote';

describe('parseRemoteUrl', () => {
  describe('GitHub HTTPS', () => {
    it('解析标准 https 带 .git 后缀', () => {
      const r = parseRemoteUrl('https://github.com/buxiaju/KunyaoGit.git');
      expect(r).toEqual({
        owner: 'buxiaju',
        repo: 'KunyaoGit',
        platform: 'github',
        displayUrl: 'https://github.com/buxiaju/KunyaoGit.git',
      });
    });

    it('解析 https 不带 .git 后缀', () => {
      const r = parseRemoteUrl('https://github.com/buxiaju/KunyaoGit');
      expect(r?.owner).toBe('buxiaju');
      expect(r?.repo).toBe('KunyaoGit');
      expect(r?.platform).toBe('github');
    });

    it('剥离 URL 中的 user:token 凭据', () => {
      const r = parseRemoteUrl('https://buxiaju:ghp_xxxxxxxx@github.com/buxiaju/KunyaoGit.git');
      expect(r?.owner).toBe('buxiaju');
      expect(r?.repo).toBe('KunyaoGit');
      expect(r?.platform).toBe('github');
      // displayUrl 不应该含 token
      expect(r?.displayUrl).not.toContain('ghp_');
      expect(r?.displayUrl).toBe('https://github.com/buxiaju/KunyaoGit.git');
    });

    it('处理 URL 末尾的查询参数', () => {
      const r = parseRemoteUrl('https://github.com/buxiaju/KunyaoGit.git?foo=bar');
      expect(r?.owner).toBe('buxiaju');
      expect(r?.repo).toBe('KunyaoGit');
    });

    it('处理 URL 末尾的 hash', () => {
      const r = parseRemoteUrl('https://github.com/buxiaju/KunyaoGit.git#readme');
      expect(r?.owner).toBe('buxiaju');
      expect(r?.repo).toBe('KunyaoGit');
    });
  });

  describe('GitHub SSH', () => {
    it('解析 git@ 格式', () => {
      const r = parseRemoteUrl('git@github.com:buxiaju/KunyaoGit.git');
      expect(r?.owner).toBe('buxiaju');
      expect(r?.repo).toBe('KunyaoGit');
      expect(r?.platform).toBe('github');
    });

    it('解析 git@ 格式不带 .git', () => {
      const r = parseRemoteUrl('git@github.com:buxiaju/KunyaoGit');
      expect(r?.owner).toBe('buxiaju');
      expect(r?.repo).toBe('KunyaoGit');
    });

    it('解析 ssh:// 协议格式', () => {
      const r = parseRemoteUrl('ssh://git@github.com/buxiaju/KunyaoGit.git');
      expect(r?.owner).toBe('buxiaju');
      expect(r?.repo).toBe('KunyaoGit');
      expect(r?.platform).toBe('github');
    });
  });

  describe('Gitee', () => {
    it('解析 Gitee https', () => {
      const r = parseRemoteUrl('https://gitee.com/buxiaju/KunyaoGit.git');
      expect(r?.owner).toBe('buxiaju');
      expect(r?.repo).toBe('KunyaoGit');
      expect(r?.platform).toBe('gitee');
    });

    it('解析 Gitee ssh', () => {
      const r = parseRemoteUrl('git@gitee.com:buxiaju/KunyaoGit.git');
      expect(r?.owner).toBe('buxiaju');
      expect(r?.repo).toBe('KunyaoGit');
      expect(r?.platform).toBe('gitee');
    });

    it('Gitee 大小写不敏感', () => {
      const r = parseRemoteUrl('https://GITEE.COM/buxiaju/KunyaoGit.git');
      expect(r?.platform).toBe('gitee');
    });
  });

  describe('其他平台 / 边界情况', () => {
    it('未知平台标记为 other', () => {
      const r = parseRemoteUrl('https://gitlab.com/foo/bar.git');
      expect(r?.owner).toBe('foo');
      expect(r?.repo).toBe('bar');
      expect(r?.platform).toBe('other');
    });

    it('自建 Git 服务标记为 other', () => {
      const r = parseRemoteUrl('https://git.company.internal/team/project.git');
      expect(r?.platform).toBe('other');
      expect(r?.owner).toBe('team');
      expect(r?.repo).toBe('project');
    });

    it('空字符串返回 null', () => {
      expect(parseRemoteUrl('')).toBeNull();
    });

    it('非字符串返回 null', () => {
      // @ts-expect-error 故意传错类型测试防御
      expect(parseRemoteUrl(null)).toBeNull();
      // @ts-expect-error
      expect(parseRemoteUrl(undefined)).toBeNull();
    });

    it('缺少 repo 段返回 null', () => {
      expect(parseRemoteUrl('https://github.com/buxiaju')).toBeNull();
    });

    it('只有 host 返回 null', () => {
      expect(parseRemoteUrl('https://github.com')).toBeNull();
    });

    it('两端空白自动 trim', () => {
      const r = parseRemoteUrl('  https://github.com/buxiaju/KunyaoGit.git  ');
      expect(r?.owner).toBe('buxiaju');
      expect(r?.repo).toBe('KunyaoGit');
    });
  });

  describe('特殊仓库名', () => {
    it('仓库名含连字符', () => {
      const r = parseRemoteUrl('https://github.com/foo-bar/baz-qux.git');
      expect(r?.owner).toBe('foo-bar');
      expect(r?.repo).toBe('baz-qux');
    });

    it('仓库名含点号（非 .git 后缀）', () => {
      const r = parseRemoteUrl('https://github.com/foo/bar.js.git');
      expect(r?.repo).toBe('bar.js');
    });

    it('仓库名含下划线', () => {
      const r = parseRemoteUrl('https://github.com/foo/my_repo.git');
      expect(r?.repo).toBe('my_repo');
    });

    it('owner 是组织名', () => {
      const r = parseRemoteUrl('https://github.com/microsoft/vscode.git');
      expect(r?.owner).toBe('microsoft');
      expect(r?.repo).toBe('vscode');
    });
  });
});
