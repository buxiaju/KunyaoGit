// v0.4+ 全局快捷键 hook
// 在 App 根挂一次即可；input / textarea 内自动让位

import { useEffect } from 'react';
import { useCommandPalette } from './useCommandPalette';

function isMod(e: KeyboardEvent) {
  return e.ctrlKey || e.metaKey;
}

function isTypingTarget(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (t.isContentEditable) return true;
  return false;
}

export function useGlobalShortcuts() {
  const togglePalette = useCommandPalette((s) => s.togglePalette);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 1. Ctrl/Cmd + Shift + P → 打开命令面板（在任何地方都生效）
      if (isMod(e) && e.shiftKey && (e.key === 'P' || e.key === 'p')) {
        e.preventDefault();
        togglePalette();
        return;
      }

      // 2. Ctrl/Cmd + R → 刷新（不在 input 内）
      if (isMod(e) && !e.shiftKey && (e.key === 'r' || e.key === 'R')) {
        if (isTypingTarget(e)) return;
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('kg:shortcut:refresh'));
        return;
      }

      // 3. ? → cheatsheet（不在 input 内，需要 Shift）
      if (e.key === '?' && e.shiftKey && !isMod(e)) {
        if (isTypingTarget(e)) return;
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('kg:shortcut:cheatsheet'));
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePalette]);

  // 监听「点侧边栏按钮打开命令面板」事件
  useEffect(() => {
    const onOpenPalette = () => togglePalette();
    window.addEventListener('kg:shortcut:open-palette', onOpenPalette as EventListener);
    return () => window.removeEventListener('kg:shortcut:open-palette', onOpenPalette as EventListener);
  }, [togglePalette]);
}
