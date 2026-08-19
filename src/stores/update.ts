// 更新对话框全局状态（模仿 Toast 的 store+组件模式）
// 流程：show(info) → 用户点"立即下载并安装" → startDownload() 带进度
//       → 下载完成自动 install()（主进程启动安装包后退出应用）

import { create } from 'zustand';
import type { AppUpdateInfo, DownloadProgress } from '../../shared/types';

type Phase = 'prompt' | 'downloading' | 'done' | 'error';

interface UpdateState {
  visible: boolean;
  info: AppUpdateInfo | null;
  phase: Phase;
  progress: DownloadProgress | null;
  filePath: string | null;
  error: string | null;
  show: (info: AppUpdateInfo) => void;
  hide: () => void;
  startDownload: () => Promise<void>;
  cancelDownload: () => Promise<void>;
  install: () => Promise<void>;
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  visible: false,
  info: null,
  phase: 'prompt',
  progress: null,
  filePath: null,
  error: null,

  show: (info) =>
    set({ visible: true, info, phase: 'prompt', progress: null, filePath: null, error: null }),

  hide: () => {
    const { phase } = get();
    // 下载中关闭 = 取消下载
    if (phase === 'downloading') {
      get().cancelDownload();
    }
    set({ visible: false });
  },

  startDownload: async () => {
    const info = get().info;
    if (!info?.latest) return;
    const version = info.latest.version;
    set({ phase: 'downloading', progress: null, filePath: null, error: null });

    let downloadedPath = '';
    try {
      const r = (await window.gitgui.update.download(version, (p) => {
        set({ progress: p });
        if (p.filePath) downloadedPath = p.filePath;
        if (p.phase === 'done') {
          set({ phase: 'done', filePath: p.filePath || downloadedPath });
        } else if (p.phase === 'error') {
          set({ phase: 'error', error: p.message || '下载失败' });
        } else if (p.phase === 'cancelled') {
          set({ phase: 'prompt', error: null });
        }
      })) as { filePath?: string; cancelled?: boolean; source?: string } | undefined;

      if (r?.filePath) downloadedPath = r.filePath;
      if (r?.cancelled) {
        set({ phase: 'prompt' });
        return;
      }
      // 下载成功 → 自动启动安装程序
      set({ phase: 'done', filePath: downloadedPath });
      setTimeout(() => {
        void get().install();
      }, 800);
    } catch (e: any) {
      set({ phase: 'error', error: e?.message || '下载失败' });
    }
  },

  cancelDownload: async () => {
    try {
      await window.gitgui.update.cancelDownload();
    } catch {}
  },

  install: async () => {
    const fp = get().filePath;
    if (!fp) return;
    try {
      await window.gitgui.update.install(fp);
      // 主进程 1.5s 后退出应用，这里通常执行不到
    } catch (e: any) {
      set({ phase: 'error', error: e?.message || '启动安装程序失败' });
    }
  },
}));
