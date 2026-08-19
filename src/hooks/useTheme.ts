// 主题管理 hook
// - 跟 settings.theme 同步
// - 写 <html data-theme="...">，CSS 变量自动切换
// - 通知 Monaco 编辑器（订阅 / notify）
// - 切换时调用 settings.save 持久化

import { useEffect } from 'react';
import { useSettingsStore } from '../stores/settings';
import type { Theme } from '../../shared/types';

export const THEME_LIST: { value: Theme; labelZh: string; labelEn: string; swatch: { bg: string; fg: string; primary: string } }[] = [
  {
    value: 'dark',
    labelZh: '暗色',
    labelEn: 'Dark',
    swatch: { bg: '#111827', fg: '#f3f4f6', primary: '#10b981' },
  },
  {
    value: 'ocean',
    labelZh: '深蓝',
    labelEn: 'Deep Blue',
    swatch: { bg: '#082f49', fg: '#f0f9ff', primary: '#3b82f6' },
  },
  {
    value: 'light',
    labelZh: '亮色',
    labelEn: 'Light',
    swatch: { bg: '#ffffff', fg: '#111827', primary: '#10b981' },
  },
];

/** 同步给 Monaco 编辑器用的主题 id */
export function monacoThemeFor(theme: Theme): 'vs-dark' | 'vs' {
  return theme === 'light' ? 'vs' : 'vs-dark';
}

/** 把 <html> 的 data-theme 设为指定主题（同时广播给 Monaco 监听者） */
export function applyThemeToDOM(theme: Theme) {
  const html = document.documentElement;
  html.setAttribute('data-theme', theme);
  // 通知 Monaco（通过 CustomEvent，EditorPane/RepoDetailPage 监听）
  window.dispatchEvent(new CustomEvent<Theme>('kg-theme-change', { detail: theme }));
}

/**
 * 在 App 根挂一次：监听 settings.theme 变化，自动写 <html>
 */
export function useThemeSync() {
  const theme = useSettingsStore((s) => s.settings.theme);
  const loaded = useSettingsStore((s) => s.loaded);

  useEffect(() => {
    if (!loaded) return;
    applyThemeToDOM(theme);
  }, [theme, loaded]);
}

/** 切换主题（带持久化） */
export async function setTheme(theme: Theme) {
  applyThemeToDOM(theme); // 立即生效，不等异步持久化
  await useSettingsStore.getState().save({ theme });
}
