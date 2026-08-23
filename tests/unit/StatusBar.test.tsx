// v0.4+ StatusBar 组件测试
// 验证三段式渲染 + 各种仓库状态下的显示

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import StatusBar from '../../src/components/common/StatusBar';
import { I18nProvider } from '../../src/i18n';
import { useRepoStore } from '../../src/stores/repo';
import type { RepoInfo, BranchInfo, FileStatus } from '../../shared/types';

const fakeRepo: RepoInfo = {
  path: 'C:/projects/my-app',
  name: 'my-app',
  currentBranch: 'main',
};

/** 包一层 I18nProvider（StatusBar 内部用 useI18n） */
function renderStatusBar(lang: 'zh' | 'en' = 'zh') {
  return render(
    <I18nProvider lang={lang} setLang={() => {}}>
      <StatusBar />
    </I18nProvider>
  );
}

describe('StatusBar', () => {
  beforeEach(() => {
    // 每个测试前重置 store
    useRepoStore.setState({
      current: null,
      branches: [],
      status: [],
      log: [],
      remotes: [],
    });
  });

  afterEach(() => {
    cleanup();
  });

  describe('无仓库状态', () => {
    it('显示"未打开仓库"提示', () => {
      renderStatusBar('zh');
      expect(screen.getByText('未打开仓库')).toBeTruthy();
    });

    it('英文环境显示 No repository open', () => {
      renderStatusBar('en');
      expect(screen.getByText('No repository open')).toBeTruthy();
    });

    it('不显示暂存计数', () => {
      renderStatusBar('zh');
      expect(screen.queryByText(/已暂存/)).toBeNull();
    });

    it('渲染应用版本（从 window.gitgui.app.getVersion 拉）', async () => {
      renderStatusBar('zh');
      // setup.ts 里 mock 返回 '0.4.0'
      await waitFor(() => {
        expect(screen.getByText('KunyaoGit v0.4.0')).toBeTruthy();
      });
    });
  });

  describe('有仓库状态', () => {
    beforeEach(() => {
      useRepoStore.setState({ current: fakeRepo });
    });

    it('显示仓库名', () => {
      renderStatusBar('zh');
      expect(screen.getByText('my-app')).toBeTruthy();
    });

    it('显示暂存 / 未暂存计数（都为 0）', () => {
      renderStatusBar('zh');
      expect(screen.getByText('已暂存 0')).toBeTruthy();
      expect(screen.getByText('未暂存 0')).toBeTruthy();
    });

    it('不再显示"未打开仓库"', () => {
      renderStatusBar('zh');
      expect(screen.queryByText('未打开仓库')).toBeNull();
    });
  });

  describe('分支与同步状态', () => {
    it('显示当前分支名', () => {
      useRepoStore.setState({
        current: fakeRepo,
        branches: [{ name: 'feature/login', current: true, remote: false } as BranchInfo],
      });
      renderStatusBar('zh');
      expect(screen.getByText('feature/login')).toBeTruthy();
    });

    it('ahead > 0 时显示领先数', () => {
      useRepoStore.setState({
        current: fakeRepo,
        branches: [{ name: 'main', current: true, remote: false, ahead: 3, behind: 0 } as BranchInfo],
      });
      renderStatusBar('zh');
      expect(screen.getByText('3')).toBeTruthy();
    });

    it('behind > 0 时显示落后数', () => {
      useRepoStore.setState({
        current: fakeRepo,
        branches: [{ name: 'main', current: true, remote: false, ahead: 0, behind: 5 } as BranchInfo],
      });
      renderStatusBar('zh');
      expect(screen.getByText('5')).toBeTruthy();
    });

    it('ahead 和 behind 同时 > 0 时都显示', () => {
      useRepoStore.setState({
        current: fakeRepo,
        branches: [{ name: 'main', current: true, remote: false, ahead: 2, behind: 4 } as BranchInfo],
      });
      renderStatusBar('zh');
      expect(screen.getByText('2')).toBeTruthy();
      expect(screen.getByText('4')).toBeTruthy();
    });

    it('ahead=0 behind=0 时不显示同步数字', () => {
      useRepoStore.setState({
        current: fakeRepo,
        branches: [{ name: 'main', current: true, remote: false, ahead: 0, behind: 0 } as BranchInfo],
      });
      const { container } = renderStatusBar('zh');
      // 分支名还在
      expect(screen.getByText('main')).toBeTruthy();
      // 不应有 ArrowUp / ArrowDown 的数字（0 不渲染）
      expect(container.textContent).not.toMatch(/↑0|↓0/);
    });

    it('只渲染 current=true 的分支', () => {
      useRepoStore.setState({
        current: fakeRepo,
        branches: [
          { name: 'main', current: false, remote: false } as BranchInfo,
          { name: 'dev', current: true, remote: false } as BranchInfo,
          { name: 'origin/main', current: false, remote: true } as BranchInfo,
        ],
      });
      renderStatusBar('zh');
      expect(screen.getByText('dev')).toBeTruthy();
      expect(screen.queryByText('main')).toBeNull();
      expect(screen.queryByText('origin/main')).toBeNull();
    });
  });

  describe('文件状态计数', () => {
    it('正确统计已暂存数', () => {
      useRepoStore.setState({
        current: fakeRepo,
        status: [
          { path: 'a.ts', status: 'modified', staged: true },
          { path: 'b.ts', status: 'added', staged: true },
          { path: 'c.ts', status: 'modified', staged: false },
        ] as FileStatus[],
      });
      renderStatusBar('zh');
      expect(screen.getByText('已暂存 2')).toBeTruthy();
      expect(screen.getByText('未暂存 1')).toBeTruthy();
    });

    it('有冲突时显示冲突计数', () => {
      useRepoStore.setState({
        current: fakeRepo,
        status: [
          { path: 'x.ts', status: 'conflicted', staged: false },
          { path: 'y.ts', status: 'conflicted', staged: false },
        ] as FileStatus[],
      });
      renderStatusBar('zh');
      expect(screen.getByText('冲突 2')).toBeTruthy();
    });

    it('无冲突时不显示冲突段', () => {
      useRepoStore.setState({
        current: fakeRepo,
        status: [{ path: 'a.ts', status: 'modified', staged: true }] as FileStatus[],
      });
      renderStatusBar('zh');
      expect(screen.queryByText(/冲突/)).toBeNull();
    });

    it('大量文件时计数正确', () => {
      const many: FileStatus[] = Array.from({ length: 50 }, (_, i) => ({
        path: `file${i}.ts`,
        status: 'modified' as const,
        staged: i % 2 === 0,
      }));
      useRepoStore.setState({ current: fakeRepo, status: many });
      renderStatusBar('zh');
      expect(screen.getByText('已暂存 25')).toBeTruthy();
      expect(screen.getByText('未暂存 25')).toBeTruthy();
    });
  });

  describe('无障碍', () => {
    it('有 role=status', () => {
      renderStatusBar('zh');
      expect(screen.getByRole('status')).toBeTruthy();
    });

    it('有 aria-label', () => {
      renderStatusBar('zh');
      const el = screen.getByRole('status');
      expect(el.getAttribute('aria-label')).toBe('状态栏');
    });

    it('英文环境的 aria-label 跟随语言', () => {
      renderStatusBar('en');
      const el = screen.getByRole('status');
      expect(el.getAttribute('aria-label')).toBe('Status bar');
    });
  });

  describe('版本加载失败的降级', () => {
    it('getVersion 抛错时不崩溃，只是不显示版本', async () => {
      (window as any).gitgui.app.getVersion = vi.fn().mockRejectedValue(new Error('IPC failed'));
      renderStatusBar('zh');
      // 组件仍应渲染
      expect(screen.getByRole('status')).toBeTruthy();
      await waitFor(() => {
        expect(screen.queryByText(/KunyaoGit v/)).toBeNull();
      });
    });
  });
});
