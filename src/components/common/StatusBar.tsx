import { useEffect, useState } from 'react';
import { useRepoStore } from '../../stores/repo';
import { useI18n } from '../../i18n';
import { GitBranch, ArrowUp, ArrowDown, CircleDot, FolderGit2 } from 'lucide-react';

/**
 * 底部状态栏（v0.4+）
 * 三段式：左 = 仓库 + 分支 + 同步；中 = 文件状态计数；右 = 应用版本
 * 始终挂载在 Layout 底部，订阅 useRepoStore 自动响应
 */
export default function StatusBar() {
  const current = useRepoStore((s) => s.current);
  const branches = useRepoStore((s) => s.branches);
  const status = useRepoStore((s) => s.status);
  const { t } = useI18n();
  const [appVersion, setAppVersion] = useState<string>('');

  // 异步加载应用版本（主进程 app.getVersion）
  useEffect(() => {
    let cancelled = false;
    window.gitgui.app
      .getVersion()
      .then((v) => {
        if (!cancelled) setAppVersion(v);
      })
      .catch(() => {
        if (!cancelled) setAppVersion('');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const currentBranch = branches.find((b) => b.current);
  const stagedCount = status.filter((s) => s.staged).length;
  const unstagedCount = status.filter((s) => !s.staged).length;
  const conflictedCount = status.filter((s) => s.status === 'conflicted').length;

  return (
    <div
      className="statusbar flex items-center justify-between px-3 text-[11px] text-gray-400 select-none border-t flex-shrink-0"
      role="status"
      aria-label={t('statusBar.label')}
    >
      {/* 左：仓库 + 分支 + 同步状态 */}
      <div className="flex items-center gap-3 min-w-0">
        {current ? (
          <>
            <div className="flex items-center gap-1.5 min-w-0">
              <FolderGit2 size={12} className="text-emerald-400 flex-shrink-0" />
              <span className="truncate font-medium text-gray-300" title={current.path}>
                {current.name}
              </span>
            </div>
            {currentBranch && (
              <div className="flex items-center gap-1 text-gray-400">
                <GitBranch size={11} />
                <span className="truncate max-w-[180px]" title={currentBranch.name}>
                  {currentBranch.name}
                </span>
                {currentBranch.ahead !== undefined && currentBranch.ahead > 0 && (
                  <span
                    className="flex items-center gap-0.5 text-emerald-400"
                    title={t('statusBar.aheadTip', { count: currentBranch.ahead })}
                  >
                    <ArrowUp size={10} />
                    {currentBranch.ahead}
                  </span>
                )}
                {currentBranch.behind !== undefined && currentBranch.behind > 0 && (
                  <span
                    className="flex items-center gap-0.5 text-amber-400"
                    title={t('statusBar.behindTip', { count: currentBranch.behind })}
                  >
                    <ArrowDown size={10} />
                    {currentBranch.behind}
                  </span>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center gap-1.5 text-gray-500">
            <CircleDot size={11} />
            <span>{t('statusBar.noRepo')}</span>
          </div>
        )}
      </div>

      {/* 中：文件状态计数 */}
      <div className="flex items-center gap-3">
        {current && (
          <>
            <span
              className={stagedCount > 0 ? 'text-emerald-400' : 'text-gray-500'}
              title={t('statusBar.stagedTip', { count: stagedCount })}
            >
              {t('statusBar.staged', { count: stagedCount })}
            </span>
            <span
              className={unstagedCount > 0 ? 'text-amber-400' : 'text-gray-500'}
              title={t('statusBar.unstagedTip', { count: unstagedCount })}
            >
              {t('statusBar.unstaged', { count: unstagedCount })}
            </span>
            {conflictedCount > 0 && (
              <span className="text-red-400" title={t('statusBar.conflictedTip', { count: conflictedCount })}>
                {t('statusBar.conflicted', { count: conflictedCount })}
              </span>
            )}
          </>
        )}
      </div>

      {/* 右：应用版本 */}
      <div className="flex items-center gap-2 text-gray-500">
        {appVersion && <span>KunyaoGit v{appVersion}</span>}
      </div>
    </div>
  );
}
