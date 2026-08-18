import type { GitGuiApi } from '../electron/preload';

declare global {
  interface Window {
    gitgui: GitGuiApi;
  }
}

export {};
