import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Home, FolderGit2, Globe, Tag, Settings, Github, ExternalLink, Languages, ChevronRight, Keyboard, Command } from 'lucide-react';
import { useRepoStore } from '../../stores/repo';
import { useSettingsStore } from '../../stores/settings';
import { useI18n } from '../../i18n';
import StatusBar from '../common/StatusBar';

export default function Layout() {
  const current = useRepoStore((s) => s.current);
  const openRepoDialog = useRepoStore((s) => s.openRepoDialog);
  const settings = useSettingsStore((s) => s.settings);
  const nav = useNavigate();
  const { t, lang, setLang } = useI18n();

  // 打开仓库成功后进入仓库页面
  const handleOpenRepo = async () => {
    await openRepoDialog();
    if (useRepoStore.getState().current) nav('/repo');
  };

  const NAV = [
    { to: '/', icon: Home, label: t('layout.navHome') },
    { to: '/remote/github', icon: Github, label: t('layout.navGithub') },
    { to: '/remote/gitee', icon: Globe, label: t('layout.navGitee') },
    { to: '/releases', icon: Tag, label: t('layout.navReleases') },
    { to: '/settings', icon: Settings, label: t('layout.navSettings') },
  ];

  return (
    <div className="h-full flex flex-col bg-gray-900 text-gray-100">
      {/* 主体 + 侧边栏（水平排列） */}
      <div className="flex-1 flex overflow-hidden">
      {/* 侧边栏 */}
      <aside className="w-56 border-r border-gray-800 flex flex-col">
        <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
          <FolderGit2 size={20} className="text-primary-400" />
          <span className="font-semibold">{t('layout.appName')}</span>
        </div>

        <div className="p-2">
          <button onClick={handleOpenRepo} className="btn-primary w-full justify-center">
            {t('layout.openRepo')}
          </button>
        </div>

        {current && (
          <button
            onClick={() => nav('/repo')}
            className="w-full px-3 py-2 border-b border-gray-800 text-left hover:bg-gray-800/60 transition-colors group"
            title={t('layout.enterRepo')}
          >
            <div className="text-xs text-gray-500 flex items-center justify-between">
              {t('layout.currentRepo')}
              <ChevronRight size={12} className="text-gray-600 group-hover:text-primary-400" />
            </div>
            <div className="text-sm font-medium truncate">{current.name}</div>
            {current.currentBranch && (
              <div className="text-xs text-gray-400 mt-0.5">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1.5" />
                {current.currentBranch}
              </div>
            )}
          </button>
        )}

        <nav className="flex-1 p-2 space-y-0.5">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${
                  isActive
                    ? 'bg-primary-600/20 text-primary-300'
                    : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800/60'
                }`
              }
            >
              <n.icon size={15} />
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-gray-800 text-xs text-gray-500 space-y-1">
          {settings.auth?.github?.user && (
            <div className="flex items-center gap-1.5">
              <Github size={12} />
              <span>@{settings.auth.github.user}</span>
            </div>
          )}
          {settings.auth?.gitee?.user && (
            <div className="flex items-center gap-1.5">
              <Globe size={12} />
              <span>@{settings.auth.gitee.user}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <button
              onClick={() => window.gitgui.app.openExternal('https://github.com')}
              className="text-gray-500 hover:text-gray-300 flex items-center gap-1"
            >
              {t('layout.help')} <ExternalLink size={10} />
            </button>
            <button
              onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
              className="text-gray-500 hover:text-gray-300 flex items-center gap-1"
              title={t('settings.languageHint')}
            >
              <Languages size={12} />
              {lang === 'zh' ? 'EN' : '中文'}
            </button>
          </div>
          {/* v0.4+ 快捷键入口：常驻显示，提示用户 */}
          <div className="flex items-center gap-1 pt-1 border-t border-gray-800/50">
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('kg:shortcut:cheatsheet'))}
              className="flex-1 flex items-center gap-1.5 px-1.5 py-1 rounded text-gray-500 hover:text-gray-200 hover:bg-gray-800/60 transition-colors"
              title={t('layout.shortcutsHint')}
            >
              <Keyboard size={11} />
              <span>{t('layout.shortcuts')}</span>
              <kbd className="ml-auto px-1 py-0.5 text-[9px] font-mono rounded border border-gray-700 text-gray-500">
                ?
              </kbd>
            </button>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('kg:shortcut:open-palette'))}
              className="flex-1 flex items-center gap-1.5 px-1.5 py-1 rounded text-gray-500 hover:text-gray-200 hover:bg-gray-800/60 transition-colors"
              title={t('layout.commandPaletteHint')}
            >
              <Command size={11} />
              <span>{t('layout.commands')}</span>
              <kbd className="ml-auto px-1 py-0.5 text-[9px] font-mono rounded border border-gray-700 text-gray-500">
                ⇧P
              </kbd>
            </button>
          </div>
        </div>
      </aside>

      {/* 主体 */}
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
      </div>

      {/* 底部状态栏（v0.4+） */}
      <StatusBar />
    </div>
  );
}
