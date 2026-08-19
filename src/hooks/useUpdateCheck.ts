// 启动后静默检查更新
// - 主进程 6h 节流；有新版本且未被 dismiss 时，弹出 UpdateDialog（带应用内下载）
// - 弹出即标记该版本 dismiss，避免同一会话/下次启动重复弹
// - 失败静默吞掉，不打扰用户

import { useEffect } from 'react';
import { useUpdateStore } from '../stores/update';
import type { AppUpdateInfo } from '../../shared/types';

const SESSION_KEY = 'kunyao_update_dismissed_session';

export function useUpdateCheck() {
  useEffect(() => {
    let cancelled = false;
    // 启动 1.5s 后再检查，给主进程 IPC 留出时间
    const t = setTimeout(async () => {
      if (cancelled) return;
      try {
        const r = (await window.gitgui.update.checkSilent()) as AppUpdateInfo & { dismissed?: boolean };
        if (cancelled) return;
        if (!r?.hasUpdate || !r.latest) return;
        if (r.dismissed) return;
        const localDismissed = sessionStorage.getItem(SESSION_KEY);
        if (localDismissed === r.latest.version) return;

        const ver = r.latest.version;
        // 弹出更新对话框（由 useUpdateStore + UpdateDialog 处理下载安装）
        useUpdateStore.getState().show(r);
        // 标记忽略，避免重复弹（用户仍可在 设置 → 关于 手动检查）
        window.gitgui.update.dismiss(ver).catch(() => {});
        sessionStorage.setItem(SESSION_KEY, ver);
      } catch {
        // 静默
      }
    }, 1500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);
}
