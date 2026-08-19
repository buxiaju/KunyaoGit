import { useState } from 'react';
import { useRepoStore } from '../../stores/repo';
import { useI18n } from '../../i18n';
import { Plus, Trash2, ExternalLink, Github, Globe } from 'lucide-react';
import { toast } from '../common/Toast';

export default function RemotePanel() {
  const { current, remotes, refreshRemotes } = useRepoStore();
  const { t } = useI18n();
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('origin');
  const [url, setUrl] = useState('');

  if (!current) return null;

  const add = async () => {
    if (!name.trim() || !url.trim()) return;
    const r = await window.gitgui.git.remoteAdd(current.path, name.trim(), url.trim());
    if (r.ok) {
      setShowAdd(false);
      setUrl('');
      await refreshRemotes();
      toast.success(t('repo.remoteAdded'));
    } else {
      toast.error(t('repo.remoteAddFailed', { error: r.error }));
    }
  };

  const remove = async (n: string) => {
    if (!confirm(t('repo.deleteRemoteConfirm', { name: n }))) return;
    const r = await window.gitgui.git.remoteRemove(current.path, n);
    if (r.ok) {
      await refreshRemotes();
      toast.success(t('repo.deleted'));
    } else {
      toast.error(t('repo.deleteFailed', { error: r.error }));
    }
  };

  return (
    <div className="h-full overflow-auto p-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-medium">{t('repo.remoteTitle')}</h2>
          <button onClick={() => setShowAdd(!showAdd)} className="btn-secondary text-xs">
            <Plus size={12} /> {t('repo.addRemote')}
          </button>
        </div>

        {showAdd && (
          <div className="panel p-3 mb-3 space-y-2">
            <input
              className="input"
              placeholder={t('repo.remoteNamePlaceholderHint')}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className="input"
              placeholder={t('repo.remoteUrlPlaceholderHint')}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <div className="flex gap-2">
              <button onClick={add} className="btn-primary">{t('repo.add')}</button>
              <button onClick={() => setShowAdd(false)} className="btn-ghost">{t('common.cancel')}</button>
            </div>
          </div>
        )}

        <div className="panel divide-y divide-gray-800">
          {remotes.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-500">{t('repo.noRemoteConfigured')}</div>
          ) : (
            remotes.map((r) => {
              const Icon = r.type === 'github' ? Github : r.type === 'gitee' ? Globe : Globe;
              return (
                <div key={r.name} className="flex items-center gap-2 px-3 py-2">
                  <Icon size={14} className={r.type === 'github' ? 'text-gray-300' : r.type === 'gitee' ? 'text-red-400' : 'text-gray-500'} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{r.name}</div>
                    <div className="text-xs text-gray-500 truncate" title={r.url}>{r.url}</div>
                  </div>
                  <button
                    onClick={() => window.gitgui.app.openExternal(r.url.replace(/\.git$/, ''))}
                    className="btn-ghost p-1"
                    title={t('repo.openInBrowser')}
                  >
                    <ExternalLink size={13} />
                  </button>
                  <button onClick={() => remove(r.name)} className="btn-ghost p-1 hover:text-red-400" title={t('repo.delete')}>
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
