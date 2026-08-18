import { create } from 'zustand';
import type { AppSettings } from '../../shared/types';

interface SettingsState {
  settings: AppSettings;
  loaded: boolean;
  load: () => Promise<void>;
  save: (partial: Partial<AppSettings>) => Promise<void>;
  setAuth: (platform: 'github' | 'gitee', token: string, user?: string) => Promise<void>;
  clearAuth: (platform: 'github' | 'gitee') => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: { theme: 'dark', defaultCloneDir: '', diffView: 'split', auth: {} },
  loaded: false,
  load: async () => {
    const settings = await window.gitgui.settings.get();
    set({ settings, loaded: true });
  },
  save: async (partial) => {
    const updated = await window.gitgui.settings.set(partial);
    set({ settings: updated as AppSettings });
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
