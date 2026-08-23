// v0.4+ CommandPalette 组件交互测试
// 覆盖：显隐、搜索过滤、分组渲染、键盘导航（↑↓/Enter/Esc）、鼠标点击、遮罩关闭

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import CommandPalette from '../../src/components/common/CommandPalette';
import { I18nProvider } from '../../src/i18n';
import { useCommandPalette } from '../../src/hooks/useCommandPalette';
import { useRepoStore } from '../../src/stores/repo';
import { commands } from '../../src/config/commands';
import type { RepoInfo } from '../../shared/types';

const fakeRepo: RepoInfo = {
  path: 'C:/projects/my-app',
  name: 'my-app',
  currentBranch: 'main',
};

function renderPalette(lang: 'zh' | 'en' = 'zh') {
  return render(
    <I18nProvider lang={lang} setLang={() => {}}>
      <CommandPalette />
    </I18nProvider>
  );
}

/** 打开面板（store 是全局的，须用 act 包裹以触发 re-render） */
function openPalette() {
  act(() => {
    useCommandPalette.getState().openPalette();
  });
}

/** 在搜索框输入 */
function typeQuery(text: string) {
  const input = screen.getByPlaceholderText('输入命令或搜索…') as HTMLInputElement;
  fireEvent.change(input, { target: { value: text } });
  return input;
}

/** 派发全局 keydown（组件用 capture 阶段监听 window） */
function pressKey(key: string) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

/**
 * 冲刷微任务队列。
 * 组件里命令是 `Promise.resolve().then(() => c.run())` 异步执行的
 * （为了不卡住关闭动画），所以断言前必须让微任务跑完。
 */
async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

/** 取分组标题（那些 uppercase 小标签），避免和同名的导航项文本冲突 */
function categoryLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('div.uppercase')).map((el) =>
    (el.textContent || '').trim()
  );
}

describe('CommandPalette', () => {
  beforeEach(() => {
    useCommandPalette.setState({ open: false });
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
    vi.restoreAllMocks();
  });

  describe('显示与隐藏', () => {
    it('open=false 时不渲染任何内容', () => {
      renderPalette();
      expect(screen.queryByPlaceholderText('输入命令或搜索…')).toBeNull();
    });

    it('open=true 时渲染搜索框', () => {
      renderPalette();
      openPalette();
      expect(screen.getByPlaceholderText('输入命令或搜索…')).toBeTruthy();
    });

    it('英文环境用英文 placeholder', () => {
      renderPalette('en');
      openPalette();
      expect(screen.getByPlaceholderText(/Type a command/i)).toBeTruthy();
    });

    it('底部提示行显示导航/执行说明', () => {
      renderPalette();
      openPalette();
      expect(screen.getByText('命令面板')).toBeTruthy();
      expect(screen.getByText(/↑↓ 导航/)).toBeTruthy();
    });

    it('重新打开时清空上次的搜索词', () => {
      renderPalette();
      openPalette();
      typeQuery('theme');
      act(() => useCommandPalette.getState().closePalette());
      openPalette();
      const input = screen.getByPlaceholderText('输入命令或搜索…') as HTMLInputElement;
      expect(input.value).toBe('');
    });
  });

  describe('命令列表渲染', () => {
    it('无仓库时不显示需要仓库的命令（Fetch/Pull）', () => {
      renderPalette();
      openPalette();
      expect(screen.queryByText('Fetch')).toBeNull();
      expect(screen.queryByText('Pull')).toBeNull();
    });

    it('无仓库时仍显示导航与视图命令', () => {
      renderPalette();
      openPalette();
      expect(screen.getByText('主题：暗色')).toBeTruthy();
      expect(screen.getByText('打开本地仓库')).toBeTruthy();
    });

    it('有仓库时显示 Git 命令并出现 Git 分组标题', () => {
      useRepoStore.setState({ current: fakeRepo });
      const { container } = renderPalette();
      openPalette();
      expect(screen.getByText('Fetch')).toBeTruthy();
      expect(categoryLabels(container)).toContain('Git');
    });

    it('有仓库但无 remote 时不显示 Push', () => {
      useRepoStore.setState({ current: fakeRepo, remotes: [] });
      renderPalette();
      openPalette();
      expect(screen.queryByText('Push')).toBeNull();
    });

    it('有仓库且有 remote 时显示 Push', () => {
      useRepoStore.setState({
        current: fakeRepo,
        remotes: [{ name: 'origin', refs: { fetch: 'https://github.com/a/b.git', push: 'https://github.com/a/b.git' } }] as any,
      });
      renderPalette();
      openPalette();
      expect(screen.getByText('Push')).toBeTruthy();
    });

    it('分组标题按 git → 导航 → 视图 → 设置 顺序出现', () => {
      useRepoStore.setState({ current: fakeRepo });
      const { container } = renderPalette();
      openPalette();
      expect(categoryLabels(container)).toEqual(['Git', '导航', '视图', '设置']);
    });

    it('带 shortcut 的命令显示快捷键文本', () => {
      useRepoStore.setState({ current: fakeRepo });
      renderPalette();
      openPalette();
      expect(screen.getByText('Ctrl+R')).toBeTruthy();
    });
  });

  describe('搜索过滤', () => {
    it('输入 theme 只保留三个主题命令', () => {
      renderPalette();
      openPalette();
      typeQuery('theme');
      expect(screen.getByText('主题：暗色')).toBeTruthy();
      expect(screen.getByText('主题：亮色')).toBeTruthy();
      expect(screen.queryByText('打开本地仓库')).toBeNull();
    });

    it('搜索无匹配时显示空状态提示', () => {
      renderPalette();
      openPalette();
      typeQuery('zzzz-not-exist');
      expect(screen.getByText('没有匹配的命令')).toBeTruthy();
    });

    it('搜索大小写不敏感', () => {
      renderPalette();
      openPalette();
      typeQuery('THEME');
      expect(screen.getByText('主题：暗色')).toBeTruthy();
    });

    it('可以按命令 id 片段搜索（nav.）', () => {
      const { container } = renderPalette();
      openPalette();
      typeQuery('nav.');
      expect(categoryLabels(container)).toEqual(['导航']);
    });

    it('清空搜索词后恢复完整列表', () => {
      renderPalette();
      openPalette();
      typeQuery('theme');
      expect(screen.queryByText('打开本地仓库')).toBeNull();
      typeQuery('');
      expect(screen.getByText('打开本地仓库')).toBeTruthy();
    });
  });

  describe('键盘导航', () => {
    it('Esc 关闭面板', () => {
      renderPalette();
      openPalette();
      pressKey('Escape');
      expect(useCommandPalette.getState().open).toBe(false);
    });

    it('ArrowDown 后 Enter 执行第二条命令', async () => {
      renderPalette();
      openPalette();
      // 无仓库时首条是 nav.home，第二条是 nav.github
      const target = commands.find((c) => c.id === 'nav.github')!;
      const spy = vi.spyOn(target, 'run').mockImplementation(() => {});
      pressKey('ArrowDown');
      pressKey('Enter');
      await flush();
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('Enter 执行当前高亮的第一条命令并关闭面板', async () => {
      renderPalette();
      openPalette();
      const first = commands.find((c) => c.id === 'nav.home')!;
      const spy = vi.spyOn(first, 'run').mockImplementation(() => {});
      pressKey('Enter');
      await flush();
      expect(spy).toHaveBeenCalledTimes(1);
      expect(useCommandPalette.getState().open).toBe(false);
    });

    it('ArrowUp 从首项回环到末项', async () => {
      renderPalette();
      openPalette();
      // 无仓库时末项属于 settings 分组，最后一条是 settings.openDataDir
      const last = commands.find((c) => c.id === 'settings.openDataDir')!;
      const spy = vi.spyOn(last, 'run').mockImplementation(() => {});
      pressKey('ArrowUp');
      pressKey('Enter');
      await flush();
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('空结果时按 Enter 不抛错也不执行任何命令', () => {
      renderPalette();
      openPalette();
      typeQuery('zzzz-not-exist');
      expect(() => pressKey('Enter')).not.toThrow();
      // 面板保持打开（没有命令被执行）
      expect(useCommandPalette.getState().open).toBe(true);
    });

    it('关闭后 Esc 不再影响 store（监听已解绑）', () => {
      renderPalette();
      openPalette();
      pressKey('Escape');
      expect(useCommandPalette.getState().open).toBe(false);
      // 再按一次不应抛错
      expect(() => pressKey('Escape')).not.toThrow();
    });
  });

  describe('鼠标交互', () => {
    it('点击命令执行它并关闭面板', async () => {
      renderPalette();
      openPalette();
      const target = commands.find((c) => c.id === 'view.theme.ocean')!;
      const spy = vi.spyOn(target, 'run').mockImplementation(() => {});
      fireEvent.click(screen.getByText('主题：深蓝'));
      await flush();
      expect(spy).toHaveBeenCalledTimes(1);
      expect(useCommandPalette.getState().open).toBe(false);
    });

    it('hover 命令会把高亮移到它，Enter 执行的是它', async () => {
      renderPalette();
      openPalette();
      const target = commands.find((c) => c.id === 'view.theme.light')!;
      const spy = vi.spyOn(target, 'run').mockImplementation(() => {});
      // 文本节点在 span 上，button 是其父级
      const btn = screen.getByText('主题：亮色').closest('button')!;
      fireEvent.mouseEnter(btn);
      pressKey('Enter');
      await flush();
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('点击右上角 X 关闭面板', () => {
      renderPalette();
      openPalette();
      // X 按钮是搜索行内唯一的 button
      const input = screen.getByPlaceholderText('输入命令或搜索…');
      const closeBtn = input.parentElement!.querySelector('button')!;
      fireEvent.click(closeBtn);
      expect(useCommandPalette.getState().open).toBe(false);
    });

    it('点击遮罩层关闭面板', () => {
      const { container } = renderPalette();
      openPalette();
      const overlay = container.querySelector('.fixed.inset-0')!;
      fireEvent.mouseDown(overlay);
      expect(useCommandPalette.getState().open).toBe(false);
    });

    it('点击面板内部不关闭', () => {
      renderPalette();
      openPalette();
      const input = screen.getByPlaceholderText('输入命令或搜索…');
      fireEvent.mouseDown(input);
      expect(useCommandPalette.getState().open).toBe(true);
    });
  });
});
