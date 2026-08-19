import { useState } from 'react';
import { useRepoStore } from '../../stores/repo';
import { useI18n } from '../../i18n';
import { GitBranch, Plus, Trash2, Check, GitMerge } from 'lucide-react';
import { toast } from '../common/Toast';

export default function BranchPanel() {
  const { current, branches, refreshBranches } = useRepoStore();
  const { t } = useI18n();
  const [newName, setNewName] = useState('');
  const [showNew, setShowNew] = useState(false);

  if (!current) return null;

  const local = branches.filter((b) => !b.remote);
  const remote = branches.filter((b) => b.remote);

  const checkout = async (name: string) => {
    const r = await window.gitgui.git.checkout(current.path, name);
    if (r.ok) {
      await refreshBranches();
      toast.success(t('repo.switchedTo', { name }));
    } else {
      toast.error(t('repo.switchFailed', { error: r.error }));
    }
  };

  const create = async () => {
    if (!newName.trim()) return;
    const r = await window.gitgui.git.createBranch(current.path, newName.trim());
    if (r.ok) {
      setNewName('');
      setShowNew(false);
      await refreshBranches();
      toast.success(t('repo.branchCreated', { name: newName }));
    } else {
      toast.error(t('repo.branchCreateFailed', { error: r.error }));
    }
  };

  const remove = async (name: string) => {
    if (!confirm(t('repo.deleteBranchConfirm', { name }))) return;
    const r = await window.gitgui.git.deleteBranch(current.path, name, true);
    if (r.ok) {
      await refreshBranches();
      toast.success(t('repo.deleted'));
    } else {
      toast.error(t('repo.deleteFailed', { error: r.error }));
    }
  };

  const merge = async (name: string) => {
    const r = await window.gitgui.git.merge(current.path, name);
    if (r.ok) {
      await refreshBranches();
      toast.success(t('repo.merged', { name }));
    } else {
      toast.error(t('repo.mergeFailed', { error: r.error }));
    }
  };

  return (
    <div className="h-full overflow-auto p-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-medium">{t('repo.branchLocal')}</h2>
          <button onClick={() => setShowNew(!showNew)} className="btn-secondary text-xs">
            <Plus size={12} /> {t('repo.newBranch')}
          </button>
        </div>

        {showNew && (
          <div className="panel p-3 mb-3 flex gap-2">
            <input
              className="input"
              placeholder={t('repo.newBranchNamePlaceholder')}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
              autoFocus
            />
            <button onClick={create} className="btn-primary">{t('repo.create')}</button>
          </div>
        )}

        <div className="panel divide-y divide-gray-800">
          {local.map((b) => (
            <div key={b.name} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-800/40">
              <GitBranch size={14} className={b.current ? 'text-emerald-400' : 'text-gray-500'} />
              <span className={`flex-1 text-sm ${b.current ? 'font-medium' : ''}`}>{b.name}</span>
              {b.ahead !== undefined && b.ahead > 0 && (
                <span className="text-xs text-emerald-400">↑{b.ahead}</span>
              )}
              {b.behind !== undefined && b.behind > 0 && (
                <span className="text-xs text-amber-400">↓{b.behind}</span>
              )}
              <div className="flex items-center gap-1">
                {!b.current && (
                  <>
                    <button onClick={() => checkout(b.name)} className="btn-ghost p-1" title={t('repo.switch')}>
                      <Check size={13} />
                    </button>
                    <button onClick={() => merge(b.name)} className="btn-ghost p-1" title={t('repo.mergeIntoCurrent')}>
                      <GitMerge size={13} />
                    </button>
                    <button onClick={() => remove(b.name)} className="btn-ghost p-1 hover:text-red-400" title={t('repo.delete')}>
                      <Trash2 size={13} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {remote.length > 0 && (
          <>
            <h2 className="text-lg font-medium mt-6 mb-3">{t('repo.branchRemote')}</h2>
            <div className="panel divide-y divide-gray-800">
              {remote.map((b) => (
                <div
                  key={b.name}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-gray-800/40 cursor-pointer"
                  onClick={() => {
                    const name = b.name.replace(/^[^/]+\//, '');
                    window.gitgui.git.checkout(current.path, name).then(async (r) => {
                      if (r.ok) {
                        await refreshBranches();
                        toast.success(t('repo.switchedTo', { name }));
                      } else {
                        toast.error(r.error);
                      }
                    });
                  }}
                >
                  <GitBranch size={14} className="text-purple-400" />
                  <span className="flex-1 text-sm">{b.name}</span>
                  <span className="text-xs text-gray-500">{t('repo.checkout')}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
