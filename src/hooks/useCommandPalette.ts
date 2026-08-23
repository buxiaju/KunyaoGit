// v0.4+ 命令面板状态（独立的 zustand store）

import { create } from 'zustand';

interface CommandPaletteState {
  open: boolean;
  openPalette: () => void;
  closePalette: () => void;
  togglePalette: () => void;
}

export const useCommandPalette = create<CommandPaletteState>((set, get) => ({
  open: false,
  openPalette: () => set({ open: true }),
  closePalette: () => set({ open: false }),
  togglePalette: () => set({ open: !get().open }),
}));
