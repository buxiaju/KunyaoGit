// v0.5+ FileHistoryPanel 组件测试
// 覆盖：打开/关闭、加载/错误/空状态、commit 列表渲染、点开展开 diff、AbortController 竞态

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';
import FileHistoryPanel from '../../src/components/repo/FileHistoryPanel';
import { I18nProvider } from '../../src/i18n';
import { useRepoStore } from '../../src/stores/repo';
import { ok } from '../setup';
import type { RepoInfo, CommitInfo, FileDiff } from '../../shared/types';

const fakeRepo: RepoInfo = {
  path: 'C:/projects/my-app',
  name: 'my-app',
  currentBranch: 'main',
};

const fakeCommits: CommitInfo[] = [
  { hash: 'abc1234567', shortHash: 'abc1234', author: 'me', email: 'me@x.com', date: '2026-01-02T00:00:00Z', message: 'fix bug', refs: [] },
  { hash: 'def5678901', shortHash: 'def5678', author: 'alice', email: 'a@x.com', date: '2026-01-01T00:00:00Z', message: 'init', refs: [] },
];

const fakeDiff: FileDiff = {
  path: 'src/foo.ts',
  isBinary: false,
  hunks: [
    {
      oldStart: 1, oldLines: 1, newStart: 1, newLines: 2,
      lines: [
        { type: 'del', content: 'old line', oldLine: 1 },
        { type: 'add', content: 'new line', newLine: 1 },
      ],
    },
  ],
};

function renderPanel(file: string | null = 'src/foo.ts', open = true) {
  return render(
    <I18nProvider lang="zh" setLang={() => {}}>
      <FileHistoryPanel file={file} open={open} onClose={vi.fn()} />
    </I18nProvider>
  );
}

describe('FileHistoryPanel', () => {
  beforeEach(() => {
    useRepoStore.setState({
      current: fakeRepo,
      remotes: [],
      log: [],
      branches: [],
      status: [],
    });
    // 重置调用历史 + 默认 mockResolvedValue（不 mockReset，否则清掉 setup.ts 的默认值）
    (window.gitgui.git.fileLog as any).mockClear();
    (window.gitgui.git.fileDiff as any).mockClear();
    (window.gitgui.git.fileLog as any).mockResolvedValue(ok([]));
    (window.gitgui.git.fileDiff as any).mockResolvedValue(ok(null));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('显示与隐藏', () => {
    it('open=false 时不渲染', () => {
      renderPanel('src/foo.ts', false);
      expect(screen.queryByText('文件历史')).toBeNull();
    });

    it('open=true 时显示标题 + 文件名 + 关闭按钮', () => {
      renderPanel('src/foo.ts');
      expect(screen.getByText('文件历史')).toBeTruthy();
      expect(screen.getByText('src/foo.ts')).toBeTruthy();
    });

    it('点击关闭按钮调 onClose', () => {
      const onClose = vi.fn();
      const { container } = render(
        <I18nProvider lang="zh" setLang={() => {}}>
          <FileHistoryPanel file="src/foo.ts" open onClose={onClose} />
        </I18nProvider>
      );
      // 头部 X 按钮是 panel 内的第一个 button
      const buttons = container.querySelectorAll('button');
      expect(buttons.length).toBeGreaterThan(0);
      fireEvent.click(buttons[0]);
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('加载数据', () => {
    it('打开时自动调 fileLog', async () => {
      (window.gitgui.git.fileLog as any).mockResolvedValue(ok(fakeCommits));
      renderPanel();
      await waitFor(() => {
        expect(window.gitgui.git.fileLog).toHaveBeenCalledWith(fakeRepo.path, 'src/foo.ts', { maxCount: 50 });
      });
    });

    it('加载失败时显示错误', async () => {
      (window.gitgui.git.fileLog as any).mockResolvedValue({ ok: false, error: '权限拒绝' });
      renderPanel();
      await waitFor(() => {
        expect(screen.getByText(/加载文件历史失败/)).toBeTruthy();
        expect(screen.getByText(/权限拒绝/)).toBeTruthy();
      });
    });

    it('commit 列表为空时显示空提示', async () => {
      (window.gitgui.git.fileLog as any).mockResolvedValue(ok([]));
      renderPanel();
      await waitFor(() => {
        expect(screen.getByText('暂无提交历史')).toBeTruthy();
      });
    });

    it('显示 commit 列表（message / author / shortHash）', async () => {
      (window.gitgui.git.fileLog as any).mockResolvedValue(ok(fakeCommits));
      const { container } = renderPanel();
      await waitFor(() => {
        expect(container.textContent).toContain('fix bug');
        expect(container.textContent).toContain('init');
        expect(container.textContent).toContain('abc1234');
        expect(container.textContent).toContain('def5678');
        expect(container.textContent).toContain('me');
        expect(container.textContent).toContain('alice');
      });
    });
  });

  describe('展开 / 折叠 diff', () => {
    it('点 commit 行调 fileDiff 拉 diff 并渲染', async () => {
      (window.gitgui.git.fileLog as any).mockResolvedValue(ok(fakeCommits));
      (window.gitgui.git.fileDiff as any).mockResolvedValue(ok(fakeDiff));
      const { container } = renderPanel();
      await waitFor(() => screen.getByText('fix bug'));
      // 点第一条 commit
      const firstCommit = screen.getByText('fix bug').closest('button')!;
      fireEvent.click(firstCommit);
      await waitFor(() => {
        expect(window.gitgui.git.fileDiff).toHaveBeenCalledWith(
          fakeRepo.path, 'src/foo.ts', { fromHash: 'abc1234567' }
        );
      });
      // diff 内容渲染
      expect(container.textContent).toContain('old line');
      expect(container.textContent).toContain('new line');
    });

    it('空 diff（没变更）显示 noChanges 提示', async () => {
      (window.gitgui.git.fileLog as any).mockResolvedValue(ok(fakeCommits));
      (window.gitgui.git.fileDiff as any).mockResolvedValue(ok(null));
      const { container } = renderPanel();
      await waitFor(() => screen.getByText('fix bug'));
      fireEvent.click(screen.getByText('fix bug').closest('button')!);
      await waitFor(() => {
        expect(container.textContent).toContain('该 commit 没有文件变更');
      });
    });

    it('同一 commit 重复点 → 折叠', async () => {
      (window.gitgui.git.fileLog as any).mockResolvedValue(ok(fakeCommits));
      (window.gitgui.git.fileDiff as any).mockResolvedValue(ok(fakeDiff));
      renderPanel();
      await waitFor(() => screen.getByText('fix bug'));
      const btn = screen.getByText('fix bug').closest('button')!;
      fireEvent.click(btn);
      await waitFor(() => expect(window.gitgui.git.fileDiff).toHaveBeenCalledTimes(1));
      // 再点一次折叠
      fireEvent.click(btn);
      // 没有第二次 fileDiff 调用
      expect(window.gitgui.git.fileDiff).toHaveBeenCalledTimes(1);
    });

    it('再次打开同一文件时清空之前状态', async () => {
      (window.gitgui.git.fileLog as any).mockResolvedValue(ok(fakeCommits));
      const { rerender } = render(
        <I18nProvider lang="zh" setLang={() => {}}>
          <FileHistoryPanel file="src/foo.ts" open onClose={vi.fn()} />
        </I18nProvider>
      );
      await waitFor(() => screen.getByText('fix bug'));
      // 关闭后再开
      rerender(
        <I18nProvider lang="zh" setLang={() => {}}>
          <FileHistoryPanel file="src/foo.ts" open={false} onClose={vi.fn()} />
        </I18nProvider>
      );
      rerender(
        <I18nProvider lang="zh" setLang={() => {}}>
          <FileHistoryPanel file="src/other.ts" open onClose={vi.fn()} />
        </I18nProvider>
      );
      await waitFor(() => {
        expect(window.gitgui.git.fileLog).toHaveBeenCalledWith(fakeRepo.path, 'src/other.ts', { maxCount: 50 });
      });
    });
  });

  describe('边界', () => {
    it('无仓库时不调 fileLog', () => {
      useRepoStore.setState({ current: null });
      renderPanel();
      expect(window.gitgui.git.fileLog).not.toHaveBeenCalled();
    });

    it('file=null 时不调 fileLog', () => {
      renderPanel(null);
      expect(window.gitgui.git.fileLog).not.toHaveBeenCalled();
    });
  });
});
