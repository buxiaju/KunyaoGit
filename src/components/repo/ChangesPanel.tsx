import { useEffect, useRef, useState } from 'react';
import { useRepoStore } from '../../stores/repo';
import { useI18n } from '../../i18n';
import { CheckSquare, Square, RotateCcw, Plus, Minus, FileText, Edit2, Trash2, AlertCircle, Copy, Upload, ChevronDown, Github, Globe, GitBranch, Loader2 } from 'lucide-react';
import { toast } from '../common/Toast';
import StashList from './StashList';

const STATUS_META = {
  added: { label: '新增', color: 'text-git-add', icon: Plus, bg: 'bg-emerald-900/20' },
  modified: { label: '修改', color: 'text-git-modify', icon: Edit2, bg: 'bg-amber-900/20' },
  deleted: { label: '删除', color: 'text-git-delete', icon: Minus, bg: 'bg-red-900/20' },
  renamed: { label: '重命名', color: 'text-git-rename', icon: Copy, bg: 'bg-purple-900/20' },
  untracked: { label: '未跟踪', color: 'text-gray-400', icon: FileText, bg: 'bg-gray-800/40' },
  conflicted: { label: '冲突', color: 'text-red-400', icon: AlertCircle, bg: 'bg-red-900/30' },
} as const;

export default function ChangesPanel() {
  const { current, status, refreshStatus, selectFile, selectedFile, remotes } = useRepoStore();
  const { t } = useI18n();
  const [commitMsg, setCommitMsg] = useState('');
  const [pushMenuOpen, setPushMenuOpen] = useState(false);
  const [pushingRemote, setPushingRemote] = useState<string | null>(null);
  const pushMenuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭 Push 下拉
  useEffect(() => {
    if (!pushMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (pushMenuRef.current && !pushMenuRef.current.contains(e.target as Node)) setPushMenuOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [pushMenuOpen]);

  if (!current) return null;

  const staged = status.filter((s) => s.staged);
  const unstaged = status.filter((s) => !s.staged);

  const toggleStage = async (file: string, currentlyStaged: boolean) => {
    const fn = currentlyStaged ? 'unstage' : 'stage';
    const r = await window.gitgui.git[fn](current.path, [file]);
    if (r.ok) await refreshStatus();
    else toast.error(t('repo.stageActionFailed', { action: fn, error: r.error }));
  };

  const stageAll = async () => {
    const r = await window.gitgui.git.stage(current.path, unstaged.map((s) => s.path));
    if (r.ok) await refreshStatus();
  };

  const unstageAll = async () => {
    const r = await window.gitgui.git.unstage(current.path, staged.map((s) => s.path));
    if (r.ok) await refreshStatus();
  };

  const discard = async (file: string) => {
    if (!confirm(t('repo.discardFileConfirm', { name: file }))) return;
    const r = await window.gitgui.git.discard(current.path, [file]);
    if (r.ok) await refreshStatus();
    else toast.error(t('repo.discardFailed', { error: r.error }));
  };

  const resolveConflict = async (file: string, side: 'ours' | 'theirs') => {
    const r = await window.gitgui.git.resolveConflict(current.path, file, side);
    if (r.ok) {
      toast.success(side === 'ours' ? t('repo.resolvedOurs') : t('repo.resolvedTheirs'));
      await refreshStatus();
    } else {
      toast.error(t('repo.resolveFailed', { error: r.error }));
    }
  };

  const commit = async () => {
    if (!commitMsg.trim()) {
      toast.warn(t('repo.commitMsgRequired'));
      return;
    }
    if (staged.length === 0) {
      toast.warn(t('repo.noStagedFiles'));
      return;
    }
    const r = await window.gitgui.git.commit(current.path, commitMsg.trim());
    if (r.ok) {
      toast.success(t('repo.committed', { hash: r.data.hash.slice(0, 7) }));
      setCommitMsg('');
      await refreshStatus();
    } else {
      toast.error(t('repo.commitFailed', { error: r.error }));
      // 提交失败后强制刷新 git 状态，让 UI 与真实暂存区对齐（避免"显示有暂存但实际为空"的误导）
      await refreshStatus();
    }
  };

  const commitAndPush = async (remote?: { name: string; url: string; type: 'github' | 'gitee' | 'other' }) => {
    if (!commitMsg.trim()) {
      toast.warn(t('repo.commitMsgRequired'));
      return;
    }
    if (staged.length === 0) {
      toast.warn(t('repo.noStagedFiles'));
      return;
    }
    const r = await window.gitgui.git.commit(current.path, commitMsg.trim());
    if (!r.ok) {
      toast.error(t('repo.commitFailed', { error: r.error }));
      return;
    }
    toast.success(t('repo.committed', { hash: r.data.hash.slice(0, 7) }));
    setCommitMsg('');
    await refreshStatus();
    if (remote) setPushingRemote(remote.name);
    try {
      const branch = useRepoStore.getState().branches.find((b) => b.current)?.name;
      const p = remote
        ? await window.gitgui.git.push(current.path, { remote: remote.name, branch, setUpstream: true })
        : await window.gitgui.git.push(current.path);
      if (p.ok) {
        toast.success(remote ? t('repo.pushedToRemoteName', { remote: remote.name }) : t('repo.pushedToRemote'));
        await refreshStatus();
      } else {
        // v0.6+ SSH 推送支持：检测到网络问题时主动提示切换
        const { isNetworkError, switchOriginToSsh } = await import('../../lib/pushErrorHint');
        if (isNetworkError(p.error) && remote) {
          // 用 confirm 让用户主动确认（侵入操作必须显式授权）
          const ok = window.confirm(
            `${t('settings.pushFailedNetwork', { error: p.error.slice(0, 120) })}\n\n${t('settings.pushFailedNetworkHint')}`
          );
          if (ok) {
            const sw = await switchOriginToSsh(current.path, remote.name);
            if (sw.ok) {
              toast.success(`已切换 ${remote.name}: ${sw.oldUrl} → ${sw.newUrl}`);
              // 不自动重试 push（避免再次失败时用户体验混乱），让用户主动再点一次 push
            } else {
              toast.error(`切换 SSH 失败：${sw.error}`);
            }
          } else {
            toast.error(t('repo.pushFailed', { error: p.error }));
          }
        } else {
          toast.error(t('repo.pushFailed', { error: p.error }));
        }
      }
    } finally {
      setPushingRemote(null);
      setPushMenuOpen(false);
    }
  };

  return (
    <div className="h-full flex flex-col border-r border-gray-800 overflow-hidden">
      {/* v0.4+ Stash 队列面板 */}
      <StashList />
      <div className="flex-1 overflow-auto">
        {/* 已暂存 */}
        {staged.length > 0 && (
          <Section
            title={t('repo.stagedSection', { count: staged.length })}
            action={
              <button onClick={unstageAll} className="text-xs text-gray-400 hover:text-gray-200">
                {t('repo.unstageAll')}
              </button>
            }
          >
            {staged.map((s) => (
              <FileRow
                key={s.path}
                file={s}
                checked={true}
                onCheck={() => toggleStage(s.path, true)}
                onClick={() => selectFile(s.path)}
                onDiscard={() => discard(s.path)}
                active={selectedFile === s.path}
              />
            ))}
          </Section>
        )}

        {/* 未暂存 */}
        {unstaged.length > 0 && (
          <Section
            title={t('repo.unstagedSection', { count: unstaged.length })}
            action={
              <button onClick={stageAll} className="text-xs text-gray-400 hover:text-gray-200">
                {t('repo.stageAll')}
              </button>
            }
          >
            {unstaged.map((s) => (
              <FileRow
                key={s.path}
                file={s}
                checked={false}
                onCheck={() => toggleStage(s.path, false)}
                onClick={() => selectFile(s.path)}
                onDiscard={() => discard(s.path)}
                onResolveOurs={() => resolveConflict(s.path, 'ours')}
                onResolveTheirs={() => resolveConflict(s.path, 'theirs')}
                active={selectedFile === s.path}
              />
            ))}
          </Section>
        )}

        {status.length === 0 && (
          <div className="p-6 text-center text-sm text-gray-500">{t('repo.workingCleanEmpty')}</div>
        )}
      </div>

      {/* 提交区 */}
      <div className="border-t border-gray-800 p-3 flex-shrink-0">
        <textarea
          className="input min-h-[60px] resize-y"
          placeholder={t('repo.commitPlaceholder')}
          value={commitMsg}
          onChange={(e) => setCommitMsg(e.target.value)}
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-gray-500">{t('repo.filesStaged', { count: staged.length })}</span>
          <div className="flex items-center gap-1.5">
            <button onClick={commit} className="btn-secondary text-xs">{t('repo.commit')}</button>
            <div className="relative" ref={pushMenuRef}>
              <div className="flex">
                <button onClick={() => commitAndPush()} disabled={staged.length === 0 || pushingRemote !== null} className="btn-primary text-xs rounded-r-none">
                  {pushingRemote ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                  {t('repo.commitAndPush')}
                </button>
                <button
                  onClick={() => setPushMenuOpen(!pushMenuOpen)}
                  disabled={staged.length === 0 || pushingRemote !== null}
                  className="btn-primary text-xs rounded-l-none border-l border-primary-700/60 px-1"
                  title={t('repo.pushToHint')}
                >
                  <ChevronDown size={11} />
                </button>
              </div>
              {pushMenuOpen && (
                <div className="absolute right-0 bottom-full mb-1 z-50 min-w-[200px] rounded-md border border-gray-700 bg-gray-900 shadow-xl py-1">
                  <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-gray-500">{t('repo.commitPushToLabel')}</div>
                  {remotes.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-gray-500">{t('repo.noRemoteConfigured')}</div>
                  ) : (
                    remotes.map((r) => {
                      const Icon = r.type === 'github' ? Github : r.type === 'gitee' ? Globe : GitBranch;
                      return (
                        <button
                          key={r.name}
                          onClick={() => commitAndPush(r)}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-gray-800"
                        >
                          <Icon size={12} className={r.type === 'github' ? 'text-gray-300' : r.type === 'gitee' ? 'text-red-400' : 'text-gray-500'} />
                          <span className="flex-1 truncate">{t('repo.pushToName', { name: r.name })}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="px-3 py-1.5 text-xs text-gray-500 flex items-center justify-between bg-gray-900/50 sticky top-0">
        <span>{title}</span>
        {action}
      </div>
      <div>{children}</div>
    </div>
  );
}

function FileRow({
  file,
  checked,
  onCheck,
  onClick,
  onDiscard,
  onResolveOurs,
  onResolveTheirs,
  active,
}: {
  file: any;
  checked: boolean;
  onCheck: () => void;
  onClick: () => void;
  onDiscard: () => void;
  onResolveOurs?: () => void;
  onResolveTheirs?: () => void;
  active: boolean;
}) {
  const { t } = useI18n();
  const meta = STATUS_META[file.status as keyof typeof STATUS_META];
  const Icon = meta.icon;
  return (
    <div
      onClick={onClick}
      className={`group flex items-center gap-2 px-3 py-1.5 cursor-pointer text-sm ${
        active ? 'bg-primary-600/15' : 'hover:bg-gray-800/40'
      } ${meta.bg}`}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onCheck();
        }}
        className="text-gray-500 hover:text-gray-200 flex-shrink-0"
      >
        {checked ? <CheckSquare size={14} className="text-primary-400" /> : <Square size={14} />}
      </button>
      <Icon size={12} className={meta.color + ' flex-shrink-0'} />
      <span className="flex-1 truncate" title={file.path}>
        {file.path}
      </span>
      {file.status === 'conflicted' && onResolveOurs && onResolveTheirs && (
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onResolveOurs(); }}
            className="px-1.5 py-0.5 text-[10px] rounded bg-emerald-900/40 text-emerald-300 hover:bg-emerald-900/60"
            title={t('repo.keepOursTitle')}
          >
            ours
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onResolveTheirs(); }}
            className="px-1.5 py-0.5 text-[10px] rounded bg-blue-900/40 text-blue-300 hover:bg-blue-900/60"
            title={t('repo.keepTheirsTitle')}
          >
            theirs
          </button>
        </div>
      )}
      {!file.staged && file.status !== 'untracked' && file.status !== 'conflicted' && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDiscard();
          }}
          className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 flex-shrink-0"
        >
          <RotateCcw size={11} />
        </button>
      )}
    </div>
  );
}
