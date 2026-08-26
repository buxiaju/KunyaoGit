// v0.4+ 命令面板命令注册表
// 命令在执行时通过 zustand 的 getState() 访问 store，避开 React 组件订阅

import { useRepoStore } from '../stores/repo';
import { useSettingsStore } from '../stores/settings';
import { useCommandPalette } from '../hooks/useCommandPalette';
import { toast } from '../components/common/Toast';
import type { I18nKey } from '../i18n';
import type { Lang } from '../i18n';

export type CommandCategory = 'git' | 'navigation' | 'view' | 'settings';

export interface Command {
  id: string;
  titleKey: I18nKey;     // i18n key（命令显示名）
  category: CommandCategory;
  shortcut?: string;       // 展示用（如 'Ctrl+Shift+P'）
  hint?: string;           // 副标题 / 说明
  when?: () => boolean;    // 是否在当前上下文启用
  run: () => void | Promise<void>;
}

// 工具：根据仓库状态判断
const hasRepo = () => !!useRepoStore.getState().current;
const hasRemote = () => useRepoStore.getState().remotes.length > 0;

export const commands: Command[] = [
  // ============ Git 操作 ============
  {
    id: 'git.fetch',
    titleKey: 'command.fetch',
    category: 'git',
    when: hasRepo,
    run: async () => {
      const c = useRepoStore.getState().current;
      if (!c) return;
      const r = await window.gitgui.git.fetch(c.path);
      if (r.ok) {
        await useRepoStore.getState().refreshAll();
        toast.success('已 fetch');
      } else {
        toast.error(`Fetch 失败：${r.error}`);
      }
    },
  },
  {
    id: 'git.pull',
    titleKey: 'command.pull',
    category: 'git',
    when: hasRepo,
    run: async () => {
      const c = useRepoStore.getState().current;
      if (!c) return;
      const r = await window.gitgui.git.pull(c.path);
      if (r.ok) {
        await useRepoStore.getState().refreshAll();
        toast.success('拉取成功');
      } else {
        toast.error(`拉取失败：${r.error}`);
      }
    },
  },
  {
    id: 'git.push',
    titleKey: 'command.push',
    category: 'git',
    when: () => hasRepo() && hasRemote(),
    run: async () => {
      const c = useRepoStore.getState().current;
      if (!c) return;
      const r = await window.gitgui.git.push(c.path);
      if (r.ok) {
        await useRepoStore.getState().refreshAll();
        toast.success('推送成功');
      } else {
        toast.error(`推送失败：${r.error}`);
      }
    },
  },
  {
    id: 'git.refresh',
    titleKey: 'command.refresh',
    category: 'git',
    shortcut: 'Ctrl+R',
    when: hasRepo,
    run: () => useRepoStore.getState().refreshAll(),
  },
  {
    id: 'git.stash',
    titleKey: 'command.stash',
    category: 'git',
    when: hasRepo,
    run: async () => {
      const c = useRepoStore.getState().current;
      if (!c) return;
      const r = await window.gitgui.git.stash(c.path);
      if (r.ok) {
        await useRepoStore.getState().refreshStatus();
        toast.success('已 stash');
      } else {
        toast.error(`Stash 失败：${r.error}`);
      }
    },
  },
  {
    id: 'git.openChanges',
    titleKey: 'command.openChanges',
    category: 'git',
    when: hasRepo,
    run: () => {
      window.location.hash = '#/repo';
      // 派发事件让 RepoPage 切到 changes tab
      setTimeout(() => window.dispatchEvent(new CustomEvent('kg:navigate:tab', { detail: 'changes' })), 0);
    },
  },

  // ============ 导航 ============
  {
    id: 'nav.home',
    titleKey: 'layout.navHome',
    category: 'navigation',
    run: () => {
      window.location.hash = '#/';
    },
  },
  {
    id: 'nav.repo',
    titleKey: 'command.enterRepo',
    category: 'navigation',
    when: hasRepo,
    run: () => {
      window.location.hash = '#/repo';
    },
  },
  {
    id: 'nav.github',
    titleKey: 'layout.navGithub',
    category: 'navigation',
    run: () => {
      window.location.hash = '#/remote/github';
    },
  },
  {
    id: 'nav.gitee',
    titleKey: 'layout.navGitee',
    category: 'navigation',
    run: () => {
      window.location.hash = '#/remote/gitee';
    },
  },
  {
    id: 'nav.releases',
    titleKey: 'layout.navReleases',
    category: 'navigation',
    when: hasRepo,
    run: () => {
      window.location.hash = '#/releases';
    },
  },
  {
    id: 'nav.settings',
    titleKey: 'layout.navSettings',
    category: 'navigation',
    run: () => {
      window.location.hash = '#/settings';
    },
  },
  {
    id: 'nav.openRepo',
    titleKey: 'command.openRepo',
    category: 'navigation',
    run: () => useRepoStore.getState().openRepoDialog(),
  },

  // ============ 视图 ============
  {
    id: 'view.theme.dark',
    titleKey: 'command.themeDark',
    category: 'view',
    run: () => useSettingsStore.getState().save({ theme: 'dark' }),
  },
  {
    id: 'view.theme.ocean',
    titleKey: 'command.themeOcean',
    category: 'view',
    run: () => useSettingsStore.getState().save({ theme: 'ocean' }),
  },
  {
    id: 'view.theme.light',
    titleKey: 'command.themeLight',
    category: 'view',
    run: () => useSettingsStore.getState().save({ theme: 'light' }),
  },
  {
    id: 'view.lang.zh',
    titleKey: 'command.langZh',
    category: 'view',
    run: () => useSettingsStore.getState().save({ language: 'zh' as Lang }),
  },
  {
    id: 'view.lang.en',
    titleKey: 'command.langEn',
    category: 'view',
    run: () => useSettingsStore.getState().save({ language: 'en' as Lang }),
  },

  // ============ 设置 / 帮助 ============
  {
    id: 'settings.checkUpdate',
    titleKey: 'settings.checkUpdate',
    category: 'settings',
    run: () => {
      // 设置页监听此事件触发检查
      window.dispatchEvent(new CustomEvent('kg:command:check-update'));
    },
  },
  {
    id: 'settings.openDataDir',
    titleKey: 'command.openDataDir',
    category: 'settings',
    run: async () => {
      // 通过 shell.openPath 打开应用数据目录
      // 主进程收到 @userData 后会展开为 app.getPath('userData')
      await window.gitgui.app.openPath('@userData');
    },
  },
];

/**
 * 过滤可用命令：先按 when 过滤，再按 query 匹配 titleKey
 */
export function filterCommands(query: string): Command[] {
  const q = query.trim().toLowerCase();
  return commands.filter((c) => {
    if (c.when && !c.when()) return false;
    if (!q) return true;
    // 简单匹配：titleKey 的最后一段（key 的 leaf）
    const leaf = c.titleKey.split('.').pop()!.toLowerCase();
    return leaf.includes(q) || c.id.toLowerCase().includes(q);
  });
}
