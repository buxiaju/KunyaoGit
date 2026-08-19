import { useEffect, useState } from 'react';
import { useRepoStore } from '../stores/repo';
import { useSettingsStore } from '../stores/settings';
import { useI18n } from '../i18n';
import { FolderGit2, GitBranch, Plus, X, ExternalLink, Copy, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { toast } from '../components/common/Toast';

export default function HomePage() {
  const { t } = useI18n();
  const { recents, loadRecents, openRepo, openRepoDialog, removeRecent, current } = useRepoStore();
  const settings = useSettingsStore((s) => s.settings);
  const [cloneUrl, setCloneUrl] = useState('');
  const [cloning, setCloning] = useState(false);
  const [showClone, setShowClone] = useState(false);

  useEffect(() => {
    loadRecents();
  }, [loadRecents]);

  const handleClone = async () => {
    if (!cloneUrl.trim()) return;
    setCloning(true);
    try {
      const dest = settings.defaultCloneDir || await pickDir();
      if (!dest) {
        setCloning(false);
        return;
      }
      const r = await window.gitgui.repo.clone(cloneUrl.trim(), dest);
      if (r.ok) {
        toast.success(`克隆成功：${r.data.path}`);
        setCloneUrl('');
        setShowClone(false);
        await loadRecents();
        await openRepo(r.data.path);
      } else {
        toast.error(`克隆失败：${r.error}`);
      }
    } finally {
      setCloning(false);
    }
  };

  const pickDir = async (): Promise<string | null> => {
    // 简化：直接用 openDialog 选择目标目录
    const r = await window.gitgui.repo.openDialog();
    return r;
  };

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-5xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">{t('home.welcome')}</h1>
            <p className="text-sm text-gray-400 mt-1">{t('home.subtitle')}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowClone(true)} className="btn-secondary">
              <Copy size={14} /> {t('home.cloneRepo')}
            </button>
            <button onClick={openRepoDialog} className="btn-primary">
              <Plus size={14} /> {t('home.openLocal')}
            </button>
          </div>
        </div>

        {showClone && (
          <div className="panel p-4 mb-6">
            <div className="text-sm font-medium mb-2">从 URL 克隆</div>
            <div className="flex gap-2">
              <input
                className="input"
                placeholder={t('home.cloneUrlPlaceholder')}
                value={cloneUrl}
                onChange={(e) => setCloneUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleClone()}
                autoFocus
              />
              <button onClick={handleClone} disabled={cloning} className="btn-primary">
                {cloning ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />}
                {t('home.cloneBtn')}
              </button>
              <button onClick={() => setShowClone(false)} className="btn-ghost">
                取消
              </button>
            </div>
            {!settings.defaultCloneDir && (
              <div className="text-xs text-gray-500 mt-2">{t('home.cloneNoDir')}</div>
            )}
          </div>
        )}

        <div>
          <h2 className="text-lg font-medium mb-3">{t('home.recent')}</h2>
          {recents.length === 0 ? (
            <div className="panel p-8 text-center text-gray-500">
              <FolderGit2 size={40} className="mx-auto mb-3 opacity-50" />
              <div>{t('home.recentEmpty')}</div>
              <div className="text-xs mt-1">点击上方【打开本地仓库】或【克隆仓库】开始</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {recents.map((r) => (
                <div
                  key={r.path}
                  className={`panel p-3 hover:border-primary-500/40 transition-colors group cursor-pointer ${
                    current?.path === r.path ? 'border-primary-500/60' : ''
                  }`}
                  onClick={() => openRepo(r.path)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <FolderGit2 size={16} className="text-primary-400 flex-shrink-0" />
                        <div className="font-medium truncate">{r.name}</div>
                      </div>
                      <div className="text-xs text-gray-500 truncate mt-0.5" title={r.path}>
                        {r.path}
                      </div>
                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                        {r.currentBranch && (
                          <span className="flex items-center gap-1">
                            <GitBranch size={11} /> {r.currentBranch}
                          </span>
                        )}
                        <span>{formatDistanceToNow(r.lastOpenedAt, { locale: zhCN, addSuffix: true })}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          window.gitgui.app.openPath(r.path);
                        }}
                        className="btn-ghost p-1"
                        title="在文件管理器中打开"
                      >
                        <ExternalLink size={13} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeRecent(r.path);
                        }}
                        className="btn-ghost p-1 hover:text-red-400"
                        title="从列表移除"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
