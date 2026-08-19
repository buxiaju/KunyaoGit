import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Home, FolderGit2, Globe, Tag, Settings, Github, ExternalLink, Languages } from 'lucide-react';
import { useRepoStore } from '../../stores/repo';
import { useSettingsStore } from '../../stores/settings';
import { useI18n } from '../../i18n';

export default function Layout() {
  const current = useRepoStore((s) => s.current);
  const openRepoDialog = useRepoStore((s) => s.openRepoDialog);
  const settings = useSettingsStore((s) => s.settings);
  const nav = useNavigate();
  const { t, lang, setLang } = useI18n();

  const NAV = [
    { to: '/', icon: Home, label: t('layout.navHome') },
    { to: '/remote/github', icon: Github, label: t('layout.navGithub') },
    { to: '/remote/gitee', icon: Globe, label: t('layout.navGitee') },
    { to: '/releases', icon: Tag, label: t('layout.navReleases') },
    { to: '/settings', icon: Settings, label: t('layout.navSettings') },
  ];

  return (
    <div className="h-full flex bg-gray-900 text-gray-100">
      {/* 侧边栏 */}
      <aside className="w-56 border-r border-gray-800 flex flex-col">
        <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
          <FolderGit2 size={20} className="text-primary-400" />
          <span className="font-semibold">{t('layout.appName')}</span>
        </div>

        <div className="p-2">
          <button onClick={openRepoDialog} className="btn-primary w-full justify-center">
            {t('layout.openRepo')}
          </button>
        </div>

        {current && (
          <div className="px-3 py-2 border-b border-gray-800">
            <div className="text-xs text-gray-500">{t('layout.currentRepo')}</div>
            <div className="text-sm font-medium truncate" title={current.path}>{current.name}</div>
            {current.currentBranch && (
              <div className="text-xs text-gray-400 mt-0.5">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1.5" />
                {current.currentBranch}
              </div>
            )}
          </div>
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
        </div>
      </aside>

      {/* 主体 */}
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
