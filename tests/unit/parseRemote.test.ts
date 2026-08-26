// v0.6+ SSH 推送支持：parseRemote 互转 + protocol 检测

import { describe, it, expect } from 'vitest';
import {
  parseRemoteUrl,
  detectProtocol,
  toSshUrl,
  toHttpsUrl,
} from '../../electron/lib/parseRemote';
// 镜像实现两边必须保持一致；src/lib/parseRemote.ts 在 import 时已通过类型检查
import * as srcParse from '../../src/lib/parseRemote';

describe('detectProtocol', () => {
  it('HTTPS', () => {
    expect(detectProtocol('https://github.com/foo/bar.git')).toBe('https');
  });
  it('scp-like SSH (git@host:owner/repo.git)', () => {
    expect(detectProtocol('git@github.com:foo/bar.git')).toBe('ssh');
    expect(detectProtocol('git@gitee.com:buxiaju/repo.git')).toBe('ssh');
  });
  it('ssh:// 形式', () => {
    expect(detectProtocol('ssh://git@github.com/foo/bar.git')).toBe('ssh');
  });
  it('git:// 形式', () => {
    expect(detectProtocol('git://github.com/foo/bar.git')).toBe('git');
  });
  it('HTTP (非 HTTPS)', () => {
    expect(detectProtocol('http://github.com/foo/bar.git')).toBe('git');
  });
  it('空 / 非字符串', () => {
    expect(detectProtocol('')).toBe('unknown');
    expect(detectProtocol(null as any)).toBe('unknown');
    expect(detectProtocol(undefined as any)).toBe('unknown');
  });
});

describe('toSshUrl（健壮性 / v0.6+ SSH）', () => {
  it('HTTPS GitHub URL → SSH', () => {
    expect(toSshUrl('https://github.com/buxiaju/DouBi.git')).toBe('git@github.com:buxiaju/DouBi.git');
    expect(toSshUrl('https://github.com/buxiaju/DouBi')).toBe('git@github.com:buxiaju/DouBi.git');
  });
  it('HTTPS Gitee URL → SSH', () => {
    expect(toSshUrl('https://gitee.com/buxiaju/DouBi.git')).toBe('git@gitee.com:buxiaju/DouBi.git');
  });
  it('已 SSH 形式 → 归一化为标准 scp 形式', () => {
    expect(toSshUrl('ssh://git@github.com/buxiaju/DouBi.git')).toBe('git@github.com:buxiaju/DouBi.git');
    expect(toSshUrl('git@github.com:buxiaju/DouBi.git')).toBe('git@github.com:buxiaju/DouBi.git');
  });
  it('带 user:pass token 的 URL → 也能转（解析时忽略）', () => {
    expect(toSshUrl('https://ghp_xxx@github.com/buxiaju/DouBi.git')).toBe('git@github.com:buxiaju/DouBi.git');
  });
  it('其他平台（GitLab）保留原 host', () => {
    expect(toSshUrl('https://gitlab.com/foo/bar.git')).toBe('git@gitlab.com:foo/bar.git');
  });
  it('非法 URL 返回 null', () => {
    expect(toSshUrl('not a url')).toBeNull();
    expect(toSshUrl('')).toBeNull();
  });
});

describe('toHttpsUrl', () => {
  it('SSH URL → HTTPS', () => {
    expect(toHttpsUrl('git@github.com:buxiaju/DouBi.git')).toBe('https://github.com/buxiaju/DouBi.git');
    expect(toHttpsUrl('ssh://git@gitee.com/buxiaju/DouBi.git')).toBe('https://gitee.com/buxiaju/DouBi.git');
  });
  it('HTTPS URL → 归一化（去掉 .git 加回）', () => {
    expect(toHttpsUrl('https://github.com/buxiaju/DouBi.git')).toBe('https://github.com/buxiaju/DouBi.git');
    expect(toHttpsUrl('https://github.com/buxiaju/DouBi')).toBe('https://github.com/buxiaju/DouBi.git');
  });
});

describe('src/lib/parseRemote 与 electron/lib/parseRemote 镜像一致（v0.6+）', () => {
  // 两份实现必须严格一致，否则主进程和渲染层解析同一 URL 会得到不同结果。
  // 这里抽样测几个关键函数。
  const cases = [
    'https://github.com/buxiaju/DouBi.git',
    'git@github.com:buxiaju/DouBi.git',
    'ssh://git@gitee.com/buxiaju/DouBi.git',
    'https://ghp_xxx@github.com/buxiaju/DouBi.git',
  ];
  for (const url of cases) {
    it(`detectProtocol 一致: ${url}`, () => {
      expect(detectProtocol(url)).toBe(srcParse.detectProtocol(url));
    });
    it(`toSshUrl 一致: ${url}`, () => {
      expect(toSshUrl(url)).toBe(srcParse.toSshUrl(url));
    });
    it(`toHttpsUrl 一致: ${url}`, () => {
      expect(toHttpsUrl(url)).toBe(srcParse.toHttpsUrl(url));
    });
    it(`parseRemoteUrl 一致: ${url}`, () => {
      expect(parseRemoteUrl(url)).toEqual(srcParse.parseRemoteUrl(url));
    });
  }
});
