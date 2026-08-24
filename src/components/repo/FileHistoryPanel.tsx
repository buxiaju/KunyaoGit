// v0.5+ 文件历史面板
// 侧边抽屉（drawer）显示某文件的 commit 列表，点击展开 diff
// 复用 DiffViewer 渲染

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRepoStore } from '../../stores/repo';
import { useI18n } from '../../i18n';
import type { CommitInfo, FileDiff } from '../../../shared/types';
import { X, GitCommit, Loader2, ChevronDown, ChevronRight, FileText, XCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import clsx from 'clsx';

interface Props {
  file: string | null;
  open: boolean;
  onClose: () => void;
}

export default function FileHistoryPanel({ file, open, onClose }: Props) {
  const { current } = useRepoStore();
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [diffs, setDiffs] = useState<Record<string, FileDiff | null>>({});
  const [diffLoading, setDiffLoading] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 打开时拉历史
  useEffect(() => {
    if (!open || !file || !current) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);
    setCommits([]);
    setExpanded(null);
    setDiffs({});
    window.gitgui.git.fileLog(current.path, file, { maxCount: 50 })
      .then((r) => {
        if (ctrl.signal.aborted) return;
        if (r.ok) setCommits(r.data);
        else setError(r.error);
      })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    return () => ctrl.abort();
  }, [open, file, current?.path]);

  // 展开某 commit 时拉 diff
  const handleToggle = useCallback(async (hash: string) => {
    if (expanded === hash) {
      setExpanded(null);
      return;
    }
    setExpanded(hash);
    if (diffs[hash] !== undefined || !current || !file) return;
    setDiffLoading(hash);
    const r = await window.gitgui.git.fileDiff(current.path, file, { fromHash: hash });
    if (r.ok) {
      setDiffs((prev) => ({ ...prev, [hash]: r.data }));
    }
    setDiffLoading(null);
  }, [expanded, diffs, current, file]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-[560px] max-w-[90vw] h-full flex flex-col border-l shadow-2xl"
        style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border)' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="px-4 py-3 border-b flex items-center gap-2 flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <FileText size={14} className="text-primary-400" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{t('fileHistory.title')}</div>
            {file && <div className="text-xs text-gray-500 font-mono truncate">{file}</div>}
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
            <X size={14} />
          </button>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-500 flex items-center justify-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              {t('common.loading')}
            </div>
          ) : error ? (
            <div className="p-4 text-sm text-red-400 flex items-start gap-2">
              <XCircle size={14} className="mt-0.5" />
              <div className="flex-1">
                <div className="font-medium">{t('fileHistory.loadFailed')}</div>
                <div className="text-xs text-gray-500 mt-1">{error}</div>
              </div>
            </div>
          ) : commits.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">
              {t('fileHistory.empty')}
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {commits.map((c) => {
                const isExpanded = expanded === c.hash;
                const diff = diffs[c.hash];
                const isDiffLoading = diffLoading === c.hash;
                return (
                  <div key={c.hash}>
                    <button
                      onClick={() => handleToggle(c.hash)}
                      className="w-full px-3 py-2.5 flex items-start gap-2 text-left hover:bg-gray-800/40"
                    >
                      {isExpanded
                        ? <ChevronDown size={14} className="mt-0.5 text-gray-500 flex-shrink-0" />
                        : <ChevronRight size={14} className="mt-0.5 text-gray-500 flex-shrink-0" />}
                      <GitCommit size={13} className="mt-0.5 text-primary-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">{c.message.split('\n')[0]}</div>
                        <div className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-1.5">
                          <span className="font-mono text-emerald-400">{c.shortHash}</span>
                          <span>{c.author}</span>
                          <span>·</span>
                          <span>{formatDistanceToNow(new Date(c.date), { locale: zhCN, addSuffix: true })}</span>
                        </div>
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="px-3 pb-3 pl-9 text-xs">
                        {isDiffLoading ? (
                          <div className="flex items-center gap-1.5 text-gray-500 py-2">
                            <Loader2 size={12} className="animate-spin" />
                            {t('common.loading')}
                          </div>
                        ) : diff ? (
                          <div className="font-mono whitespace-pre-wrap break-all bg-gray-900/60 rounded p-2 max-h-96 overflow-y-auto">
                            {diff.hunks.length === 0 ? (
                              <div className="text-gray-500 text-center py-2">
                                {t('fileHistory.noChanges')}
                              </div>
                            ) : (
                              diff.hunks.flatMap((h) => h.lines).map((l, i) => (
                                <div
                                  key={i}
                                  className={clsx(
                                    'px-1',
                                    l.type === 'add' && 'text-emerald-300 bg-emerald-900/20',
                                    l.type === 'del' && 'text-red-300 bg-red-900/20',
                                    l.type === 'context' && 'text-gray-400'
                                  )}
                                >
                                  <span className="text-gray-600 inline-block w-3 mr-2 select-none">
                                    {l.type === 'add' ? '+' : l.type === 'del' ? '-' : ' '}
                                  </span>
                                  {l.content}
                                </div>
                              ))
                            )}
                          </div>
                        ) : (
                          <div className="text-gray-500 py-2">{t('fileHistory.diffEmpty')}</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
