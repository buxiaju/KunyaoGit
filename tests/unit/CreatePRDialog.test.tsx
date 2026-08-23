// v0.4+ CreatePRDialog 流程测试
// 覆盖：平台选择、默认 base 分支加载、默认 title、提交、失败、成功页

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act, within } from '@testing-library/react';
import CreatePRDialog from '../../src/components/repo/CreatePRDialog';
import { I18nProvider } from '../../src/i18n';
import { useRepoStore } from '../../src/stores/repo';
import type { RepoInfo, RemoteInfo, CommitLog } from '../../shared/types';

/** 在对话框内按 placeholder 取输入 */
function getInputByPlaceholder(container: HTMLElement, re: RegExp): HTMLInputElement {
  const dialog = container.querySelector('.fixed.inset-0')!;
  return within(dialog as HTMLElement).getByPlaceholderText(re) as HTMLInputElement;
}
function getAllInputs(container: HTMLElement): HTMLInputElement[] {
  const dialog = container.querySelector('.fixed.inset-0')!;
  return Array.from(dialog.querySelectorAll('input'));
}

const fakeRepo: RepoInfo = {
  path: 'C:/projects/my-app',
  name: 'my-app',
  currentBranch: 'feature/login',
};

const ghRemote: RemoteInfo = {
  name: 'origin',
  url: 'https://github.com/octocat/hello.git',
  type: 'github',
};

const giteeRemote: RemoteInfo = {
  name: 'gitee',
  url: 'https://gitee.com/octocat/hello.git',
  type: 'gitee',
};

const fakeLog: CommitLog[] = [
  {
    hash: 'abc1234567',
    short: 'abc1234',
    author: 'me',
    email: 'me@x.com',
    date: '2026-01-01T00:00:00Z',
    message: 'feat: add login flow\n\ndetails here',
    refs: '',
  },
];

function renderDialog(props: Partial<{ open: boolean; headBranch: string; onClose: () => void }> = {}) {
  const onClose = props.onClose ?? vi.fn();
  return {
    onClose,
    ...render(
      <I18nProvider lang="zh" setLang={() => {}}>
        <CreatePRDialog open={props.open ?? true} headBranch={props.headBranch ?? 'feature/login'} onClose={onClose} />
      </I18nProvider>
    ),
  };
}

describe('CreatePRDialog', () => {
  beforeEach(() => {
    useRepoStore.setState({
      current: fakeRepo,
      remotes: [ghRemote],
      log: fakeLog,
      branches: [],
      status: [],
    });
    // 默认 getDefaultBranch 返回 main
    (window.gitgui.github.getDefaultBranch as any).mockResolvedValue({ ok: true, data: 'main' });
    (window.gitgui.gitee.getDefaultBranch as any).mockResolvedValue({ ok: true, data: 'master' });
    (window.gitgui.github.createPR as any).mockResolvedValue({
      ok: true,
      data: { number: 1, htmlUrl: 'https://github.com/octocat/hello/pull/1' },
    });
    (window.gitgui.gitee.createPR as any).mockResolvedValue({
      ok: true,
      data: { number: 2, htmlUrl: 'https://gitee.com/octocat/hello/pulls/2' },
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('打开与关闭', () => {
    it('open=false 时不渲染', () => {
      renderDialog({ open: false });
      expect(screen.queryByText('创建 Pull Request')).toBeNull();
    });

    it('open=true 时显示标题与表单', () => {
      renderDialog();
      expect(screen.getByText('创建 Pull Request')).toBeTruthy();
    });

    it('点击右上 X 关闭', () => {
      const { onClose } = renderDialog();
      // X 按钮在头部右侧
      const closeBtn = screen.getByText('创建 Pull Request').parentElement!.querySelector('button')!;
      fireEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('点击遮罩关闭', () => {
      const { container, onClose } = renderDialog();
      const overlay = container.querySelector('.fixed.inset-0')!;
      fireEvent.mouseDown(overlay);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('点击面板内部不关闭', () => {
      const { onClose, container } = renderDialog();
      // 点第一个输入框（head 分支 readOnly input）
      const headInput = getAllInputs(container)[0];
      fireEvent.mouseDown(headInput);
      expect(onClose).not.toHaveBeenCalled();
    });

    it('Esc 关闭', () => {
      const { onClose } = renderDialog();
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('平台选择', () => {
    it('只有一个 GitHub remote 时显示 octocat/hello', async () => {
      const { container } = renderDialog();
      await waitFor(() => {
        expect(within(container).getByText('octocat/hello')).toBeTruthy();
      });
    });

    it('同时有 GitHub 和 Gitee 时显示两个平台按钮', async () => {
      useRepoStore.setState({ remotes: [ghRemote, giteeRemote] });
      const { container } = renderDialog();
      await waitFor(() => {
        // 平台按钮里的 "GitHub" 和 "Gitee" 文字（font-medium 那一行）
        const dialog = container.querySelector('.fixed.inset-0')!;
        const buttons = Array.from(dialog.querySelectorAll('button'));
        const labels = buttons
          .map((b) => b.querySelector('.font-medium')?.textContent?.trim())
          .filter(Boolean);
        expect(labels).toContain('GitHub');
        expect(labels).toContain('Gitee');
      });
    });

    it('切换平台会重新拉默认分支', async () => {
      useRepoStore.setState({ remotes: [ghRemote, giteeRemote] });
      const { container } = renderDialog();
      await waitFor(() => {
        const dialog = container.querySelector('.fixed.inset-0')!;
        const buttons = Array.from(dialog.querySelectorAll('button'));
        const giteeBtn = buttons.find(
          (b) => b.querySelector('.font-medium')?.textContent?.trim() === 'Gitee'
        );
        expect(giteeBtn).toBeTruthy();
        fireEvent.click(giteeBtn!);
      });
      await waitFor(() => {
        expect(window.gitgui.gitee.getDefaultBranch).toHaveBeenCalled();
      });
    });
  });

  describe('默认值加载', () => {
    it('默认 base 分支从主进程拉', async () => {
      const { container } = renderDialog();
      await waitFor(() => {
        const input = getInputByPlaceholder(container, /master|main|目标分支/);
        expect(input.value).toBe('main');
      });
    });

    it('默认 base 拉取失败时降级为 master', async () => {
      (window.gitgui.github.getDefaultBranch as any).mockResolvedValue({ ok: false, error: 'boom' });
      const { container } = renderDialog();
      await waitFor(() => {
        const input = getInputByPlaceholder(container, /master|main|目标分支/);
        expect(input.value).toBe('master');
      });
    });

    it('默认 title 取 log[0] subject（首行）', async () => {
      const { container } = renderDialog();
      await waitFor(() => {
        const input = getInputByPlaceholder(container, /简洁描述/);
        expect(input.value).toBe('feat: add login flow');
      });
    });

    it('log 为空时 title 留空', async () => {
      useRepoStore.setState({ log: [] });
      const { container } = renderDialog();
      await waitFor(() => {
        const input = getInputByPlaceholder(container, /简洁描述/);
        expect(input.value).toBe('');
      });
    });
  });

  describe('无可用平台 remote', () => {
    it('没有 remote 时显示提示且不显示表单', () => {
      useRepoStore.setState({ remotes: [] });
      renderDialog();
      expect(screen.getByText('没有可用的 GitHub / Gitee 远程仓库')).toBeTruthy();
      // 标题 input 不应存在
      expect(screen.queryByPlaceholderText(/简洁描述/)).toBeNull();
    });

    it('remote URL 不是 github/gitee 时也走提示', () => {
      useRepoStore.setState({
        remotes: [
          { name: 'gitlab', url: 'https://gitlab.com/octocat/hello.git', type: 'other' },
        ],
      });
      renderDialog();
      expect(screen.getByText('没有可用的 GitHub / Gitee 远程仓库')).toBeTruthy();
    });
  });

  describe('提交 PR', () => {
    it('点击提交按钮调用 github.createPR 并显示成功页', async () => {
      const { container } = renderDialog();
      await waitFor(() => {
        expect(getInputByPlaceholder(container, /master|main|目标分支/).value).toBe('main');
      });
      const submitBtn = screen.getByRole('button', { name: /创建 PR/i });
      fireEvent.click(submitBtn);
      await waitFor(() => {
        expect(window.gitgui.github.createPR).toHaveBeenCalledWith(
          expect.objectContaining({
            owner: 'octocat',
            repo: 'hello',
            head: 'feature/login',
            base: 'main',
            title: 'feat: add login flow',
          })
        );
        expect(screen.getByText('Pull Request 创建成功')).toBeTruthy();
        expect(screen.getByText('https://github.com/octocat/hello/pull/1')).toBeTruthy();
      });
    });

    it('Gitee 平台会调 gitee.createPR 且不带 draft', async () => {
      useRepoStore.setState({ remotes: [giteeRemote] });
      const { container } = renderDialog();
      await waitFor(() => {
        expect(getInputByPlaceholder(container, /master|main|目标分支/).value).toBe('master');
      });
      fireEvent.click(screen.getByRole('button', { name: /创建 PR/i }));
      await waitFor(() => {
        expect(window.gitgui.gitee.createPR).toHaveBeenCalled();
        const call = (window.gitgui.gitee.createPR as any).mock.calls[0][0];
        expect(call.draft).toBeUndefined();
      });
    });

    it('GitHub 平台会带上 draft 字段', async () => {
      const { container } = renderDialog();
      await waitFor(() => {
        expect(getInputByPlaceholder(container, /master|main|目标分支/).value).toBe('main');
      });
      // 勾选 draft：唯一的 checkbox
      const draftCheckbox = screen.getByRole('checkbox');
      fireEvent.click(draftCheckbox);
      fireEvent.click(screen.getByRole('button', { name: /创建 PR/i }));
      await waitFor(() => {
        const call = (window.gitgui.github.createPR as any).mock.calls[0][0];
        expect(call.draft).toBe(true);
      });
    });

    it('title 为空时提交按钮被禁用', async () => {
      const { container } = renderDialog();
      await waitFor(() => {
        expect(getInputByPlaceholder(container, /master|main|目标分支/).value).toBe('main');
      });
      // 清空 title
      const titleInput = getInputByPlaceholder(container, /简洁描述/);
      fireEvent.change(titleInput, { target: { value: '' } });
      const submitBtn = screen.getByRole('button', { name: /创建 PR/i }) as HTMLButtonElement;
      expect(submitBtn.disabled).toBe(true);
    });

    it('createPR 失败时显示错误但不进入成功页', async () => {
      (window.gitgui.github.createPR as any).mockResolvedValue({ ok: false, error: 'permission denied' });
      const { container } = renderDialog();
      await waitFor(() => {
        expect(getInputByPlaceholder(container, /master|main|目标分支/).value).toBe('main');
      });
      fireEvent.click(screen.getByRole('button', { name: /创建 PR/i }));
      await waitFor(() => {
        expect(window.gitgui.github.createPR).toHaveBeenCalled();
      });
      expect(screen.queryByText('Pull Request 创建成功')).toBeNull();
    });
  });

  describe('成功页交互', () => {
    it('点击"在浏览器打开"调用 shellOpen', async () => {
      const { container } = renderDialog();
      await waitFor(() => {
        expect(getInputByPlaceholder(container, /master|main|目标分支/).value).toBe('main');
      });
      fireEvent.click(screen.getByRole('button', { name: /创建 PR/i }));
      await waitFor(() => screen.getByText('Pull Request 创建成功'));
      fireEvent.click(screen.getByText('在浏览器打开'));
      expect(window.gitgui.app.shellOpen).toHaveBeenCalledWith('https://github.com/octocat/hello/pull/1');
    });

    it('成功页"关闭"按钮调用 onClose', async () => {
      const { onClose, container } = renderDialog();
      await waitFor(() => {
        expect(getInputByPlaceholder(container, /master|main|目标分支/).value).toBe('main');
      });
      fireEvent.click(screen.getByRole('button', { name: /创建 PR/i }));
      await waitFor(() => screen.getByText('Pull Request 创建成功'));
      // 成功页底部"关闭"按钮：button 里的"关闭"文字
      const closeBtn = screen.getAllByText('关闭').find((el) => el.closest('button')!);
      expect(closeBtn).toBeTruthy();
      fireEvent.click(closeBtn!);
      expect(onClose).toHaveBeenCalled();
    });
  });
});
