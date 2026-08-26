import { create } from 'zustand';
import type { AppSettings } from '../../shared/types';

const DEFAULTS: AppSettings = {
  theme: 'dark',
  language: 'zh',
  defaultCloneDir: '',
  diffView: 'split',
  auth: {},
  // v0.6+ SSH 推送支持
  sshKeyPath: '',
  preferredProtocol: 'auto',
};

/** 判断主进程返回值是否是可用的设置对象。 */
function isUsableSettings(v: unknown): v is AppSettings {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

interface SettingsState {
  settings: AppSettings;
  loaded: boolean;
  load: () => Promise<void>;
  save: (partial: Partial<AppSettings>) => Promise<void>;
  setAuth: (platform: 'github' | 'gitee', token: string, user?: string) => Promise<void>;
  clearAuth: (platform: 'github' | 'gitee') => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: { ...DEFAULTS },
  loaded: false,
  // 健壮性加固 P1：
  // 原本 load/save 都是裸 await，IPC 一旦 reject 就是一条静默的 unhandledrejection。
  // 两个具体后果：
  //   1. load 失败时 `loaded` 永远停在 false —— 依赖它的界面永久卡在 loading；
  //   2. save 的返回值被直接 `as AppSettings` 塞进 state，主进程返回异常值时
  //      settings 会变成 undefined，之后每一处 `settings.theme` 都会抛错，
  //      表现为整个应用白屏。
  load: async () => {
    try {
      const settings = await window.gitgui.settings.get();
      if (isUsableSettings(settings)) {
        set({ settings: { ...DEFAULTS, ...settings }, loaded: true });
      } else {
        // 返回值不可用：保留默认设置，但仍然放行界面
        console.warn('[settings] 主进程返回的设置无效，使用默认值');
        set({ loaded: true });
      }
    } catch (e) {
      // 关键：失败也必须置 loaded，否则界面永远等不到结果
      console.error(`[settings] 读取设置失败，使用默认值：${(e as Error).message}`);
      set({ loaded: true });
    }
  },
  save: async (partial) => {
    try {
      const updated = await window.gitgui.settings.set(partial);
      if (isUsableSettings(updated)) {
        set({ settings: { ...DEFAULTS, ...updated } });
      } else {
        // 主进程返回异常值时，用本地合并结果兜底，绝不让 settings 变成 undefined
        set({ settings: { ...get().settings, ...partial } });
      }
    } catch (e) {
      console.error(`[settings] 保存设置失败：${(e as Error).message}`);
      // 往上抛，让 globalErrorHandler 给用户一个可见的失败提示，
      // 而不是让用户以为已经保存成功
      throw e;
    }
  },
  setAuth: async (platform, token, user) => {
    const auth = { ...get().settings.auth, [platform]: { token, user } };
    await get().save({ auth });
  },
  clearAuth: async (platform) => {
    const auth = { ...get().settings.auth };
    delete auth[platform];
    await get().save({ auth });
  },
}));
