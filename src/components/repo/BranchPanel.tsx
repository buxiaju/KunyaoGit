import { useState } from 'react';
import { useRepoStore } from '../../stores/repo';
import { GitBranch, Plus, Trash2, Check, GitMerge } from 'lucide-react';
import { toast } from '../common/Toast';

export default function BranchPanel() {
  const { current, branches, refreshBranches } = useRepoStore();
  const [newName, setNewName] = useState('');
  const [showNew, setShowNew] = useState(false);

  if (!current) return null;

  const local = branches.filter((b) => !b.remote);
  const remote = branches.filter((b) => b.remote);

  const checkout = async (name: string) => {
    const r = await window.gitgui.git.checkout(current.path, name);
    if (r.ok) {
      await refreshBranches();
      toast.success(`已切换到 ${name}`);
    } else {
      toast.error('切换失败：' + r.error);
    }
  };

  const create = async () => {
    if (!newName.trim()) return;
    const r = await window.gitgui.git.createBranch(current.path, newName.trim());
    if (r.ok) {
      setNewName('');
      setShowNew(false);
      await refreshBranches();
      toast.success(`已创建分支 ${newName}`);
    } else {
      toast.error('创建失败：' + r.error);
    }
  };

  const remove = async (name: string) => {
    if (!confirm(`确定删除分支 ${name}？`)) return;
    const r = await window.gitgui.git.deleteBranch(current.path, name, true);
    if (r.ok) {
      await refreshBranches();
      toast.success('已删除');
    } else {
      toast.error('删除失败：' + r.error);
    }
  };

  const merge = async (name: string) => {
    const r = await window.gitgui.git.merge(current.path, name);
    if (r.ok) {
      await refreshBranches();
      toast.success(`已合并 ${name}`);
    } else {
      toast.error('合并失败：' + r.error);
    }
  };

  return (
    <div className="h-full overflow-auto p-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-medium">本地分支</h2>
          <button onClick={() => setShowNew(!showNew)} className="btn-secondary text-xs">
            <Plus size={12} /> 新建分支
          </button>
        </div>

        {showNew && (
          <div className="panel p-3 mb-3 flex gap-2">
            <input
              className="input"
              placeholder="新分支名"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
              autoFocus
            />
            <button onClick={create} className="btn-primary">创建</button>
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
                    <button onClick={() => checkout(b.name)} className="btn-ghost p-1" title="切换">
                      <Check size={13} />
                    </button>
                    <button onClick={() => merge(b.name)} className="btn-ghost p-1" title="合并到当前分支">
                      <GitMerge size={13} />
                    </button>
                    <button onClick={() => remove(b.name)} className="btn-ghost p-1 hover:text-red-400" title="删除">
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
            <h2 className="text-lg font-medium mt-6 mb-3">远程分支</h2>
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
                        toast.success('已切换到 ' + name);
                      } else {
                        toast.error(r.error);
                      }
                    });
                  }}
                >
                  <GitBranch size={14} className="text-purple-400" />
                  <span className="flex-1 text-sm">{b.name}</span>
                  <span className="text-xs text-gray-500">检出</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
