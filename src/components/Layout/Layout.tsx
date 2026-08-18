import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Home, FolderGit2, Globe, Tag, Settings, Github, ExternalLink } from 'lucide-react';
import { useRepoStore } from '../../stores/repo';
import { useSettingsStore } from '../../stores/settings';

const NAV = [
  { to: '/', icon: Home, label: '首页' },
  { to: '/remote/github', icon: Github, label: 'GitHub' },
  { to: '/remote/gitee', icon: Globe, label: 'Gitee' },
  { to: '/releases', icon: Tag, label: 'Release' },
  { to: '/settings', icon: Settings, label: '设置' },
];

export default function Layout() {
  const current = useRepoStore((s) => s.current);
  const openRepoDialog = useRepoStore((s) => s.openRepoDialog);
  const settings = useSettingsStore((s) => s.settings);
  const nav = useNavigate();

  return (
    <div className="h-full flex bg-gray-900 text-gray-100">
      {/* 侧边栏 */}
      <aside className="w-56 border-r border-gray-800 flex flex-col">
        <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
          <FolderGit2 size={20} className="text-primary-400" />
          <span className="font-semibold">KunyaoGit</span>
        </div>

        <div className="p-2">
          <button onClick={openRepoDialog} className="btn-primary w-full justify-center">
            打开仓库
          </button>
        </div>

        {current && (
          <div className="px-3 py-2 border-b border-gray-800">
            <div className="text-xs text-gray-500">当前仓库</div>
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
          <button
            onClick={() => window.gitgui.app.openExternal('https://github.com')}
            className="text-gray-500 hover:text-gray-300 flex items-center gap-1"
          >
            帮助 <ExternalLink size={10} />
          </button>
        </div>
      </aside>

      {/* 主体 */}
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
