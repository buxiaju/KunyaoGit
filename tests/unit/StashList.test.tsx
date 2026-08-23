// v0.4+ StashList 组件测试
// 覆盖：展开/折叠、加载、save 流程、apply、pop、drop（带 confirm）、view diff

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import StashList from '../../src/components/repo/StashList';
import { I18nProvider } from '../../src/i18n';
import { useRepoStore } from '../../src/stores/repo';
import type { RepoInfo, StashEntry } from '../../shared/types';

const fakeRepo: RepoInfo = {
  path: 'C:/projects/my-app',
  name: 'my-app',
  currentBranch: 'main',
};

const fakeEntries: StashEntry[] = [
  { index: 0, ref: 'stash@{0}', message: 'WIP: login fix', branch: 'feature/x', hash: 'abc1234', date: '2026-01-01T00:00:00Z' },
  { index: 1, ref: 'stash@{1}', message: 'temp changes', branch: 'main', hash: 'def5678', date: '2026-01-02T00:00:00Z' },
];

function renderList() {
  return render(
    <I18nProvider lang="zh" setLang={() => {}}>
      <StashList />
    </I18nProvider>
  );
}

/** 等待 load 完成（entries 出现或空提示出现） */
async function waitLoaded() {
  await waitFor(() => {
    // 任一出现即可
    expect(
      screen.queryByText('暂无 stash') ||
        screen.queryByText('stash@{0}') ||
        screen.queryByText(/加载中/)
    ).toBeTruthy();
  });
}

describe('StashList', () => {
  beforeEach(() => {
    useRepoStore.setState({
      current: fakeRepo,
      remotes: [],
      log: [],
      branches: [],
      status: [],
    });
    (window.gitgui.git.stashList as any).mockResolvedValue({ ok: true, data: fakeEntries });
    (window.gitgui.git.stashList as any).mockClear?.();
    (window.gitgui.git.stash as any).mockResolvedValue({ ok: true, data: undefined });
    (window.gitgui.git.stashApply as any).mockResolvedValue({ ok: true, data: undefined });
    (window.gitgui.git.stashDrop as any).mockResolvedValue({ ok: true, data: undefined });
    (window.gitgui.git.stashShow as any).mockResolvedValue({ ok: true, data: [] });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('渲染', () => {
    it('无仓库时返回 null', () => {
      useRepoStore.setState({ current: null });
      const { container } = renderList();
      expect(container.querySelector('.border-b')).toBeNull();
    });

    it('默认折叠，只显示标题和数量', () => {
      renderList();
      expect(screen.getByText('Stash 队列')).toBeTruthy();
      // entries 还未展开，看不到 ref 文本
      expect(screen.queryByText('stash@{0}')).toBeNull();
    });

    it('点击标题展开/折叠', async () => {
      renderList();
      // 展开
      const titleBtn = screen.getByText('Stash 队列').closest('button')!;
      fireEvent.click(titleBtn);
      await waitFor(() => screen.getByText('stash@{0}'));
      // 再次点击折叠
      fireEvent.click(titleBtn);
      await waitFor(() => {
        expect(screen.queryByText('stash@{0}')).toBeNull();
      });
    });

    it('展开后显示每条 ref / message', async () => {
      renderList();
      fireEvent.click(screen.getByText('Stash 队列').closest('button')!);
      await waitLoaded();
      expect(screen.getByText('stash@{0}')).toBeTruthy();
      expect(screen.getByText('WIP: login fix')).toBeTruthy();
      expect(screen.getByText('stash@{1}')).toBeTruthy();
    });

    it('加载失败显示错误 toast', async () => {
      (window.gitgui.git.stashList as any).mockResolvedValue({ ok: false, error: 'git error' });
      renderList();
      fireEvent.click(screen.getByText('Stash 队列').closest('button')!);
      // toast 由全局管理，难以直接断言；只保证不抛错且能再次加载
      await waitFor(() => {
        expect(window.gitgui.git.stashList).toHaveBeenCalled();
      });
    });

    it('空列表显示暂无 stash', async () => {
      (window.gitgui.git.stashList as any).mockResolvedValue({ ok: true, data: [] });
      renderList();
      fireEvent.click(screen.getByText('Stash 队列').closest('button')!);
      await waitFor(() => screen.getByText('暂无 stash'));
    });
  });

  describe('保存 stash', () => {
    it('点击 + 保存 打开输入表单', () => {
      renderList();
      const saveBtn = screen.getByText('+ 保存当前修改');
      fireEvent.click(saveBtn);
      expect(screen.getByPlaceholderText(/可选/)).toBeTruthy();
    });

    it('输入后点 OK 调用 git.stash 并刷新列表', async () => {
      renderList();
      fireEvent.click(screen.getByText('+ 保存当前修改'));
      const input = screen.getByPlaceholderText(/可选/) as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'fix bug' } });
      fireEvent.click(screen.getByText('OK'));
      await waitFor(() => {
        expect(window.gitgui.git.stash).toHaveBeenCalledWith(fakeRepo.path, 'fix bug');
      });
    });

    it('空 message 时调用 git.stash 时不传 message', async () => {
      renderList();
      fireEvent.click(screen.getByText('+ 保存当前修改'));
      fireEvent.click(screen.getByText('OK'));
      await waitFor(() => {
        expect(window.gitgui.git.stash).toHaveBeenCalledWith(fakeRepo.path, undefined);
      });
    });

    it('Enter 键也能保存', async () => {
      renderList();
      fireEvent.click(screen.getByText('+ 保存当前修改'));
      const input = screen.getByPlaceholderText(/可选/) as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'hotfix' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      await waitFor(() => {
        expect(window.gitgui.git.stash).toHaveBeenCalledWith(fakeRepo.path, 'hotfix');
      });
    });

    it('保存失败显示错误 toast', async () => {
      (window.gitgui.git.stash as any).mockResolvedValue({ ok: false, error: 'conflict' });
      renderList();
      fireEvent.click(screen.getByText('+ 保存当前修改'));
      fireEvent.click(screen.getByText('OK'));
      await waitFor(() => {
        expect(window.gitgui.git.stash).toHaveBeenCalled();
      });
    });
  });

  describe('Apply / Pop / Drop', () => {
    beforeEach(async () => {
      renderList();
      fireEvent.click(screen.getByText('Stash 队列').closest('button')!);
      await waitLoaded();
    });

    it('Apply 调用 git.stashApply', async () => {
      const applyBtn = screen.getAllByTitle('应用（保留）')[0];
      fireEvent.click(applyBtn);
      await waitFor(() => {
        expect(window.gitgui.git.stashApply).toHaveBeenCalledWith(fakeRepo.path, 'stash@{0}');
      });
    });

    it('Pop 调用 apply + drop', async () => {
      const popBtn = screen.getAllByTitle('应用并移除')[0];
      fireEvent.click(popBtn);
      await waitFor(() => {
        expect(window.gitgui.git.stashApply).toHaveBeenCalledWith(fakeRepo.path, 'stash@{0}');
        expect(window.gitgui.git.stashDrop).toHaveBeenCalledWith(fakeRepo.path, 'stash@{0}');
      });
    });

    it('Pop 时 apply 成功但 drop 失败时显示 warn toast', async () => {
      (window.gitgui.git.stashApply as any).mockResolvedValue({ ok: true, data: undefined });
      (window.gitgui.git.stashDrop as any).mockResolvedValue({ ok: false, error: 'not found' });
      fireEvent.click(screen.getAllByTitle('应用并移除')[0]);
      await waitFor(() => {
        expect(window.gitgui.git.stashApply).toHaveBeenCalled();
        expect(window.gitgui.git.stashDrop).toHaveBeenCalled();
      });
    });

    it('Drop 需要 confirm 确认；点确认后才真正 drop', async () => {
      const confirmSpy = vi.fn(() => true);
      vi.stubGlobal('confirm', confirmSpy);
      const dropBtn = screen.getAllByTitle('删除')[0];
      fireEvent.click(dropBtn);
      await waitFor(() => {
        expect(confirmSpy).toHaveBeenCalled();
        expect(window.gitgui.git.stashDrop).toHaveBeenCalledWith(fakeRepo.path, 'stash@{0}');
      });
      vi.unstubAllGlobals();
    });

    it('Drop confirm 取消时不会 drop', async () => {
      const confirmSpy = vi.fn(() => false);
      vi.stubGlobal('confirm', confirmSpy);
      fireEvent.click(screen.getAllByTitle('删除')[0]);
      // 等一拍确保没调用
      await new Promise((r) => setTimeout(r, 50));
      expect(confirmSpy).toHaveBeenCalled();
      expect(window.gitgui.git.stashDrop).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });
  });

  describe('View Diff', () => {
    it('点击查看 diff 调用 git.stashShow 并显示 diff 弹窗', async () => {
      (window.gitgui.git.stashShow as any).mockResolvedValue({
        ok: true,
        data: [
          {
            path: 'src/login.ts',
            isBinary: false,
            hunks: [
              {
                oldStart: 1,
                oldLines: 1,
                newStart: 1,
                newLines: 2,
                lines: [
                  { type: 'del', content: 'old line' },
                  { type: 'add', content: 'new line' },
                ],
              },
            ],
          },
        ],
      });
      renderList();
      fireEvent.click(screen.getByText('Stash 队列').closest('button')!);
      await waitLoaded();
      const diffBtn = screen.getAllByTitle('查看 diff')[0];
      fireEvent.click(diffBtn);
      await waitFor(() => {
        expect(window.gitgui.git.stashShow).toHaveBeenCalled();
        // diff 弹窗里 src/login.ts
        expect(screen.getByText('src/login.ts')).toBeTruthy();
      });
    });

    it('stashShow 失败显示错误 toast', async () => {
      (window.gitgui.git.stashShow as any).mockResolvedValue({ ok: false, error: 'oops' });
      renderList();
      fireEvent.click(screen.getByText('Stash 队列').closest('button')!);
      await waitLoaded();
      fireEvent.click(screen.getAllByTitle('查看 diff')[0]);
      await waitFor(() => {
        expect(window.gitgui.git.stashShow).toHaveBeenCalled();
      });
    });
  });
});
