// v0.4+ 提交历史：每行加 hover 工具条（Cherry-pick / Revert / Copy hash）

import { useState } from 'react';
import { useRepoStore } from '../../stores/repo';
import { useI18n } from '../../i18n';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { GitCommit, Tag, GitFork, Undo2, Copy, FileSearch } from 'lucide-react';
import { toast } from '../common/Toast';
import CommitActionsModal from './CommitActionsModal';
import type { CommitInfo } from '../../../shared/types';

type ActionKind = 'cherryPick' | 'revert' | null;

export default function CommitHistory() {
  const log = useRepoStore((s) => s.log);
  const refreshAll = useRepoStore((s) => s.refreshAll);
  const { t } = useI18n();
  const [active, setActive] = useState<{ kind: ActionKind; commit: CommitInfo | null }>({ kind: null, commit: null });

  // 复制 hash 到剪贴板
  const copyHash = async (hash: string) => {
    try {
      await navigator.clipboard.writeText(hash);
      toast.success(t('commitActions.copied', { hash: hash.slice(0, 7) }));
    } catch {
      toast.error(t('commitActions.copyFailed'));
    }
  };

  // 执行 cherry-pick / revert
  const handleConfirm = async () => {
    if (!active.commit) return;
    const c = useRepoStore.getState().current;
    if (!c) return;
    if (active.kind === 'cherryPick') {
      const r = await window.gitgui.git.cherryPick(c.path, active.commit.hash);
      if (r.ok) {
        const newHash = r.data.hash ? ` (${r.data.hash.slice(0, 7)})` : '';
        toast.success(t('commitActions.cherryPickSuccess', { hash: active.commit.shortHash, newHash }));
        await refreshAll();
      } else {
        // 错误中可能含"conflict"
        if (/conflict/i.test(r.error)) {
          toast.warn(t('commitActions.cherryPickConflict', { hash: active.commit.shortHash }));
        } else {
          toast.error(t('commitActions.cherryPickFailed', { hash: active.commit.shortHash, error: r.error }));
        }
        await refreshAll();
      }
    } else if (active.kind === 'revert') {
      const r = await window.gitgui.git.revert(c.path, active.commit.hash);
      if (r.ok) {
        const newHash = r.data.hash ? ` (${r.data.hash.slice(0, 7)})` : '';
        toast.success(t('commitActions.revertSuccess', { hash: active.commit.shortHash, newHash }));
        await refreshAll();
      } else {
        if (/conflict/i.test(r.error)) {
          toast.warn(t('commitActions.revertConflict', { hash: active.commit.shortHash }));
        } else {
          toast.error(t('commitActions.revertFailed', { hash: active.commit.shortHash, error: r.error }));
        }
        await refreshAll();
      }
    }
    setActive({ kind: null, commit: null });
  };

  if (log.length === 0) {
    return <div className="h-full flex items-center justify-center text-gray-500 text-sm">{t('history.empty')}</div>;
  }

  return (
    <>
      <div className="h-full overflow-auto p-4">
        <div className="max-w-3xl mx-auto">
          {log.map((c, i) => (
            <div key={c.hash} className="flex gap-3 group">
              {/* 时间线 */}
              <div className="flex flex-col items-center pt-1">
                <div className="w-2.5 h-2.5 rounded-full bg-primary-500 ring-2 ring-gray-900" />
                {i < log.length - 1 && <div className="w-px flex-1 bg-gray-700 my-1" />}
              </div>
              {/* 内容 */}
              <div className="flex-1 pb-5">
                <div className="flex items-start gap-2">
                  <div className="text-sm font-medium break-words flex-1">
                    {c.message.split('\n')[0]}
                  </div>
                  {/* v0.4+ hover 工具条 */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => copyHash(c.hash)}
                      className="btn-ghost p-1"
                      title={t('commitActions.copyHash')}
                    >
                      <Copy size={12} />
                    </button>
                    <button
                      onClick={() => setActive({ kind: 'cherryPick', commit: c })}
                      className="btn-ghost p-1"
                      title={t('commitActions.cherryPick')}
                    >
                      <GitFork size={12} />
                    </button>
                    <button
                      onClick={() => setActive({ kind: 'revert', commit: c })}
                      className="btn-ghost p-1 hover:text-red-400"
                      title={t('commitActions.revert')}
                    >
                      <Undo2 size={12} />
                    </button>
                  </div>
                </div>
                <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                  <span className="text-primary-400 font-mono">{c.shortHash}</span>
                  <span>{c.author}</span>
                  <span>{formatDistanceToNow(new Date(c.date), { locale: zhCN, addSuffix: true })}</span>
                  {c.refs?.filter((r) => r.includes('tag:') || r.includes('HEAD')).map((r) => (
                    <span key={r} className="px-1.5 py-0.5 bg-amber-900/40 text-amber-300 rounded text-[10px] flex items-center gap-1">
                      <Tag size={9} /> {r.replace('tag: ', '')}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cherry-pick / Revert 确认弹窗 */}
      <CommitActionsModal
        open={active.kind !== null && active.commit !== null}
        title={
          active.kind === 'cherryPick'
            ? t('commitActions.cherryPickTitle')
            : t('commitActions.revertTitle')
        }
        description={
          active.kind === 'cherryPick'
            ? t('commitActions.cherryPickDesc', {
                hash: active.commit?.shortHash || '',
                subject: active.commit?.message.split('\n')[0] || '',
              })
            : t('commitActions.revertDesc', {
                hash: active.commit?.shortHash || '',
                subject: active.commit?.message.split('\n')[0] || '',
              })
        }
        details={[
          { label: t('commitActions.commitHash'), value: active.commit?.hash || '' },
          { label: t('commitActions.author'), value: active.commit?.author || '' },
        ]}
        confirmLabel={
          active.kind === 'cherryPick'
            ? t('commitActions.cherryPick')
            : t('commitActions.revert')
        }
        danger={active.kind === 'revert'}
        onConfirm={handleConfirm}
        onClose={() => setActive({ kind: null, commit: null })}
      />
    </>
  );
}
