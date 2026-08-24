// v0.4+ 命令面板状态（独立的 zustand store）
// v0.5+ 加 mode 字段：'command' | 'file'，支持 Ctrl+Shift+P / Ctrl+P 两种入口

import { create } from 'zustand';

export type PaletteMode = 'command' | 'file';

interface CommandPaletteState {
  open: boolean;
  mode: PaletteMode;
  openPalette: (mode?: PaletteMode) => void;
  closePalette: () => void;
  togglePalette: (mode?: PaletteMode) => void;
}

export const useCommandPalette = create<CommandPaletteState>((set, get) => ({
  open: false,
  mode: 'command',
  openPalette: (mode) => set({ open: true, mode: mode ?? get().mode }),
  closePalette: () => set({ open: false }),
  togglePalette: (mode) => {
    const cur = get();
    // 同一 mode 二次按：关闭；不同 mode：切换
    if (cur.open && (mode === undefined || mode === cur.mode)) {
      set({ open: false });
    } else {
      set({ open: true, mode: mode ?? cur.mode });
    }
  },
}));
