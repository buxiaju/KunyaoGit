/// <reference types="vitest/config" />
// v0.4+ Vitest 独立配置
//
// 为什么不复用 vite.config.ts：
//   vite.config.ts 里的 vite-plugin-electron/simple 会把 `node:path` 等内建模块
//   重写成 .vite-electron-renderer/*.mjs shim，那些 shim 内部用 CJS `require`，
//   在 Vitest 的 ESM 环境下会抛 "require is not defined in ES module scope"。
//   测试不需要 Electron 打包链路，所以这里只保留 react 插件 + 路径别名。

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@electron': path.resolve(__dirname, './electron'),
      '@shared': path.resolve(__dirname, './shared'),
      // electron-store 依赖 Electron 的 app.getPath()，测试里替换为内存 stub
      'electron-store': path.resolve(__dirname, './tests/stubs/electron-store.ts'),
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}', 'electron/services/**/*.ts'],
      exclude: ['src/main.tsx', 'src/**/*.d.ts'],
    },
  },
});
