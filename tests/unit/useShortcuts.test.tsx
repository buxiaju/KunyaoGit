// v0.4+ useGlobalShortcuts hook 测试
// 覆盖：Ctrl/Cmd+Shift+P 切换命令面板、Ctrl/Cmd+R 派发刷新事件、? 派发速查表事件、
//       input/textarea 内让位、事件监听 cleanup

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { useGlobalShortcuts } from '../../src/hooks/useShortcuts';
import { useCommandPalette } from '../../src/hooks/useCommandPalette';

/** 用一个挂载 hook 的最小组件 */
function Harness() {
  useGlobalShortcuts();
  return null;
}

function pressKey(init: Partial<KeyboardEventInit & { key: string; target?: EventTarget | null }>) {
  const { target, ...init2 } = init;
  const ev = new KeyboardEvent('keydown', { bubbles: true, ...init2 });
  if (target) Object.defineProperty(ev, 'target', { value: target, writable: false });
  window.dispatchEvent(ev);
  return ev;
}

describe('useGlobalShortcuts', () => {
  beforeEach(() => {
    useCommandPalette.setState({ open: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Ctrl+Shift+P 切换命令面板', () => {
    render(<Harness />);
    pressKey({ key: 'P', ctrlKey: true, shiftKey: true });
    expect(useCommandPalette.getState().open).toBe(true);
    pressKey({ key: 'P', ctrlKey: true, shiftKey: true });
    expect(useCommandPalette.getState().open).toBe(false);
  });

  it('Cmd+Shift+P（mac）也能切换', () => {
    render(<Harness />);
    pressKey({ key: 'P', metaKey: true, shiftKey: true });
    expect(useCommandPalette.getState().open).toBe(true);
  });

  it('小写 p 也接受', () => {
    render(<Harness />);
    pressKey({ key: 'p', ctrlKey: true, shiftKey: true });
    expect(useCommandPalette.getState().open).toBe(true);
  });

  it('Ctrl+R 派发 kg:shortcut:refresh 事件', () => {
    const onRefresh = vi.fn();
    window.addEventListener('kg:shortcut:refresh', onRefresh);
    render(<Harness />);
    pressKey({ key: 'r', ctrlKey: true });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    window.removeEventListener('kg:shortcut:refresh', onRefresh);
  });

  it('Shift+? 派发 kg:shortcut:cheatsheet 事件', () => {
    const onShow = vi.fn();
    window.addEventListener('kg:shortcut:cheatsheet', onShow);
    render(<Harness />);
    pressKey({ key: '?', shiftKey: true });
    expect(onShow).toHaveBeenCalledTimes(1);
    window.removeEventListener('kg:shortcut:cheatsheet', onShow);
  });

  it('Ctrl+Shift+? 不派发 cheatsheet（因为需要纯 ?，不要 mod）', () => {
    const onShow = vi.fn();
    window.addEventListener('kg:shortcut:cheatsheet', onShow);
    render(<Harness />);
    pressKey({ key: '?', shiftKey: true, ctrlKey: true });
    expect(onShow).not.toHaveBeenCalled();
    window.removeEventListener('kg:shortcut:cheatsheet', onShow);
  });

  it('Ctrl+R 在 input 内不触发', () => {
    const onRefresh = vi.fn();
    window.addEventListener('kg:shortcut:refresh', onRefresh);
    const input = document.createElement('input');
    document.body.appendChild(input);
    render(<Harness />);
    pressKey({ key: 'r', ctrlKey: true, target: input });
    expect(onRefresh).not.toHaveBeenCalled();
    window.removeEventListener('kg:shortcut:refresh', onRefresh);
    document.body.removeChild(input);
  });

  it('Ctrl+R 在 textarea 内不触发', () => {
    const onRefresh = vi.fn();
    window.addEventListener('kg:shortcut:refresh', onRefresh);
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    render(<Harness />);
    pressKey({ key: 'r', ctrlKey: true, target: ta });
    expect(onRefresh).not.toHaveBeenCalled();
    window.removeEventListener('kg:shortcut:refresh', onRefresh);
    document.body.removeChild(ta);
  });

  it('Ctrl+R 在 contentEditable 内不触发', () => {
    const onRefresh = vi.fn();
    window.addEventListener('kg:shortcut:refresh', onRefresh);
    const div = document.createElement('div');
    div.contentEditable = 'true';
    document.body.appendChild(div);
    render(<Harness />);
    pressKey({ key: 'r', ctrlKey: true, target: div });
    expect(onRefresh).not.toHaveBeenCalled();
    window.removeEventListener('kg:shortcut:refresh', onRefresh);
    document.body.removeChild(div);
  });

  it('? 在 input 内不触发 cheatsheet', () => {
    const onShow = vi.fn();
    window.addEventListener('kg:shortcut:cheatsheet', onShow);
    const input = document.createElement('input');
    document.body.appendChild(input);
    render(<Harness />);
    pressKey({ key: '?', shiftKey: true, target: input });
    expect(onShow).not.toHaveBeenCalled();
    window.removeEventListener('kg:shortcut:cheatsheet', onShow);
    document.body.removeChild(input);
  });

  it('Ctrl+Shift+P 在 input 内仍触发（命令面板任何时候都可开）', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    render(<Harness />);
    pressKey({ key: 'P', ctrlKey: true, shiftKey: true, target: input });
    expect(useCommandPalette.getState().open).toBe(true);
    document.body.removeChild(input);
  });

  it('kg:shortcut:open-palette 自定义事件也能切换面板', () => {
    render(<Harness />);
    window.dispatchEvent(new CustomEvent('kg:shortcut:open-palette'));
    expect(useCommandPalette.getState().open).toBe(true);
  });

  it('unmount 后所有全局监听都解绑', () => {
    const onRefresh = vi.fn();
    const onShow = vi.fn();
    window.addEventListener('kg:shortcut:refresh', onRefresh);
    window.addEventListener('kg:shortcut:cheatsheet', onShow);
    const { unmount } = render(<Harness />);
    unmount();
    pressKey({ key: 'r', ctrlKey: true });
    pressKey({ key: '?', shiftKey: true });
    expect(onRefresh).not.toHaveBeenCalled();
    expect(onShow).not.toHaveBeenCalled();
    window.removeEventListener('kg:shortcut:refresh', onRefresh);
    window.removeEventListener('kg:shortcut:cheatsheet', onShow);
  });

  it('不带修饰的 r 不会触发任何东西', () => {
    const onRefresh = vi.fn();
    window.addEventListener('kg:shortcut:refresh', onRefresh);
    render(<Harness />);
    pressKey({ key: 'r' });
    expect(onRefresh).not.toHaveBeenCalled();
    window.removeEventListener('kg:shortcut:refresh', onRefresh);
  });
});
