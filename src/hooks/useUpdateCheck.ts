// 启动后静默检查更新
// - 主进程已经做了 6h 节流（同样调用会直接返回缓存）
// - 有新版本且未被 dismiss 时，弹一个非阻塞提示
// - 失败/被 dismiss 静默吞掉，不打扰用户

import { useEffect } from 'react';
import { toast } from '../components/common/Toast';
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
        const choice = confirm(
          `KunyaoGit v${ver} 已发布（当前 v${r.currentVersion}）。\n\n点击"确定"打开 Release 页面下载，点击"取消"忽略此版本。`
        );
        if (choice) {
          window.gitgui.update.open(r.latest!.htmlUrl);
        }
        window.gitgui.update.dismiss(ver);
        sessionStorage.setItem(SESSION_KEY, ver);
        if (!choice) {
          toast.info(`已忽略 v${ver}。可在 设置 → 关于 中手动检查。`);
        }
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
