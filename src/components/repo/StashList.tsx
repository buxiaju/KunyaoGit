// v0.4+ Stash 队列管理面板
// 集成在 ChangesPanel 顶部，可折叠
// 提供 Apply / Pop / Show Diff / Drop 四个操作

import { useEffect, useState } from 'react';
import { useRepoStore } from '../../stores/repo';
import { useI18n } from '../../i18n';
import type { StashEntry, FileDiff } from '../../../shared/types';
import { toast } from '../common/Toast';
import { Archive, ChevronDown, ChevronRight, GitMerge, Trash2, FileText, RotateCcw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import clsx from 'clsx';

export default function StashList() {
  const current = useRepoStore((s) => s.current);
  const refreshStatus = useRepoStore((s) => s.refreshStatus);
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [entries, setEntries] = useState<StashEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null); // busy 的 stash ref
  const [showDiff, setShowDiff] = useState<{ ref: string; diff: FileDiff[] } | null>(null);
  const [savingMessage, setSavingMessage] = useState('');
  const [showSave, setShowSave] = useState(false);

  // 加载 stash 列表
  const load = async () => {
    if (!current) return;
    setLoading(true);
    try {
      const r = await window.gitgui.git.stashList(current.path);
      if (r.ok) setEntries(r.data);
      else toast.error(t('stash.loadFailed', { error: r.error }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (current) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.path]);

  const handleStash = async () => {
    if (!current) return;
    setBusy('__save__');
    const r = await window.gitgui.git.stash(current.path, savingMessage.trim() || undefined);
    setBusy(null);
    setShowSave(false);
    setSavingMessage('');
    if (r.ok) {
      toast.success(t('stash.saved'));
      await refreshStatus();
      await load();
    } else {
      toast.error(t('stash.saveFailed', { error: r.error }));
    }
  };

  const apply = async (ref: string) => {
    if (!current) return;
    setBusy(ref);
    const r = await window.gitgui.git.stashApply(current.path, ref);
    setBusy(null);
    if (r.ok) {
      toast.success(t('stash.applied', { ref }));
      await refreshStatus();
    } else {
      toast.error(t('stash.applyFailed', { error: r.error }));
    }
  };

  const pop = async (ref: string) => {
    if (!current) return;
    setBusy(ref);
    // pop = apply + drop，组合实现避免再加新 IPC
    const r1 = await window.gitgui.git.stashApply(current.path, ref);
    if (!r1.ok) {
      setBusy(null);
      toast.error(t('stash.popFailed', { error: r1.error }));
      return;
    }
    const r2 = await window.gitgui.git.stashDrop(current.path, ref);
    setBusy(null);
    if (r2.ok) {
      toast.success(t('stash.popped', { ref }));
      await refreshStatus();
      await load();
    } else {
      // 已 apply 但 drop 失败：告知用户 stash 可能还在
      toast.warn(t('stash.poppedButDropFailed', { ref, error: r2.error }));
      await refreshStatus();
      await load();
    }
  };

  const drop = async (ref: string) => {
    if (!current) return;
    if (!confirm(t('stash.dropConfirm', { ref }))) return;
    setBusy(ref);
    const r = await window.gitgui.git.stashDrop(current.path, ref);
    setBusy(null);
    if (r.ok) {
      toast.success(t('stash.dropped', { ref }));
      await load();
    } else {
      toast.error(t('stash.dropFailed', { error: r.error }));
    }
  };

  const viewDiff = async (ref: string) => {
    if (!current) return;
    setBusy(ref);
    const r = await window.gitgui.git.stashShow(current.path, ref);
    setBusy(null);
    if (r.ok) {
      setShowDiff({ ref, diff: r.data });
    } else {
      toast.error(t('stash.showFailed', { error: r.error }));
    }
  };

  if (!current) return null;

  return (
    <div className="border-b border-gray-800">
      {/* 标题栏 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-800/40"
      >
        {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <Archive size={11} />
        <span className="font-medium">{t('stash.title')}</span>
        <span className="text-gray-500">({entries.length})</span>
        <div className="flex-1" />
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowSave(true);
            setExpanded(true);
          }}
          className="text-[10px] text-primary-400 hover:text-primary-300"
        >
          + {t('stash.save')}
        </button>
      </button>

      {/* 保存 stash 表单 */}
      {showSave && (
        <div className="px-3 py-2 border-t border-gray-800 flex gap-1.5">
          <input
            className="input text-xs"
            placeholder={t('stash.savePlaceholder')}
            value={savingMessage}
            onChange={(e) => setSavingMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleStash()}
            autoFocus
          />
          <button onClick={handleStash} disabled={busy === '__save__'} className="btn-primary text-[10px] px-2 py-0.5">
            OK
          </button>
          <button onClick={() => setShowSave(false)} className="btn-ghost text-[10px] px-2 py-0.5">
            ×
          </button>
        </div>
      )}

      {/* 列表 */}
      {expanded && (
        <div>
          {loading ? (
            <div className="px-3 py-2 text-[11px] text-gray-500">{t('common.loading')}</div>
          ) : entries.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-gray-500">{t('stash.empty')}</div>
          ) : (
            entries.map((e) => (
              <div
                key={e.ref}
                className={clsx(
                  'px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-gray-800/40 group',
                  busy === e.ref && 'opacity-60'
                )}
              >
                <span className="font-mono text-[10px] text-primary-400">{e.ref}</span>
                {e.branch && <span className="text-[10px] text-gray-500">@{e.branch}</span>}
                <span className="flex-1 truncate" title={e.message}>
                  {e.message}
                </span>
                <span className="text-[10px] text-gray-500">
                  {formatDistanceToNow(new Date(e.date), { locale: zhCN, addSuffix: true })}
                </span>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                  <button
                    onClick={() => viewDiff(e.ref)}
                    className="btn-ghost p-0.5"
                    title={t('stash.viewDiff')}
                  >
                    <FileText size={11} />
                  </button>
                  <button
                    onClick={() => apply(e.ref)}
                    className="btn-ghost p-0.5"
                    title={t('stash.apply')}
                    disabled={busy === e.ref}
                  >
                    <RotateCcw size={11} />
                  </button>
                  <button
                    onClick={() => pop(e.ref)}
                    className="btn-ghost p-0.5"
                    title={t('stash.pop')}
                    disabled={busy === e.ref}
                  >
                    <GitMerge size={11} />
                  </button>
                  <button
                    onClick={() => drop(e.ref)}
                    className="btn-ghost p-0.5 hover:text-red-400"
                    title={t('stash.drop')}
                    disabled={busy === e.ref}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* 简易 diff 浮层（v0.4 占位，文本模式） */}
      {showDiff && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-8"
          onClick={() => setShowDiff(null)}
        >
          <div
            className="w-full max-w-4xl max-h-[80vh] overflow-auto rounded-lg border shadow-2xl"
            style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="text-sm font-medium">
                {t('stash.diffTitle', { ref: showDiff.ref })}
              </div>
              <button onClick={() => setShowDiff(null)} className="text-gray-500 hover:text-gray-300">
                ×
              </button>
            </div>
            <div className="p-3 text-xs font-mono">
              {showDiff.diff.length === 0 ? (
                <div className="text-gray-500">{t('stash.empty')}</div>
              ) : (
                showDiff.diff.map((d) => (
                  <div key={d.path} className="mb-3">
                    <div className="text-primary-400 mb-1">{d.path}</div>
                    {d.isBinary ? (
                      <div className="text-gray-500">binary</div>
                    ) : (
                      d.hunks.flatMap((h) =>
                        h.lines.map((l, i) => (
                          <div
                            key={i}
                            className={clsx(
                              l.type === 'add' && 'text-emerald-300 bg-emerald-900/20',
                              l.type === 'del' && 'text-red-300 bg-red-900/20',
                              l.type === 'context' && 'text-gray-400'
                            )}
                          >
                            <span className="text-gray-600 inline-block w-12 text-right pr-2">
                              {l.type === 'add' ? '+' : l.type === 'del' ? '-' : ' '}
                            </span>
                            {l.content}
                          </div>
                        ))
                      )
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
