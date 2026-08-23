// v0.4+ 创建 PR / MR 对话框
// 从远程 remote URL 解析 owner/repo/platform，调用对应平台的 createPR API

import { useEffect, useMemo, useState } from 'react';
import { useRepoStore } from '../../stores/repo';
import { useI18n } from '../../i18n';
import { parseRemoteUrl, type ParsedRemote } from '../../lib/parseRemote';
import { toast } from '../common/Toast';
import { X, GitPullRequest, ExternalLink, Loader2, Github, Globe } from 'lucide-react';
import type { RemoteInfo } from '../../../shared/types';

interface Props {
  open: boolean;
  headBranch: string;
  onClose: () => void;
}

export default function CreatePRDialog({ open, headBranch, onClose }: Props) {
  const { current, remotes, log, refreshLog } = useRepoStore();
  const { t } = useI18n();

  // 列出可用的 remote：过滤出 github / gitee
  const platformRemotes = useMemo(() => {
    return remotes.filter((r) => {
      const parsed = parseRemoteUrl(r.url);
      return parsed && (parsed.platform === 'github' || parsed.platform === 'gitee');
    });
  }, [remotes]);

  const [selectedRemoteName, setSelectedRemoteName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedRemote | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [base, setBase] = useState('');
  const [draft, setDraft] = useState(false);
  const [loadingDefault, setLoadingDefault] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);

  // 初始化：默认选第一个 platform remote
  useEffect(() => {
    if (open && platformRemotes.length > 0 && !selectedRemoteName) {
      setSelectedRemoteName(platformRemotes[0].name);
    }
    if (!open) {
      // 关闭时重置
      setSelectedRemoteName(null);
      setParsed(null);
      setTitle('');
      setBody('');
      setBase('');
      setDraft(false);
      setLoadingDefault(false);
      setSubmitting(false);
      setCreatedUrl(null);
    }
  }, [open, platformRemotes, selectedRemoteName]);

  // 选中的 remote 变化时，解析 + 拉默认分支
  useEffect(() => {
    if (!open || !selectedRemoteName) return;
    const remote = remotes.find((r) => r.name === selectedRemoteName);
    if (!remote) return;
    const p = parseRemoteUrl(remote.url);
    setParsed(p);
    if (!p) return;
    // 并行：拉默认分支 + 取最后一次 commit message 作为默认 title
    setLoadingDefault(true);
    const defaultBranchFn =
      p.platform === 'github' ? window.gitgui.github.getDefaultBranch : window.gitgui.gitee.getDefaultBranch;
    defaultBranchFn(p.owner, p.repo)
      .then((r) => {
        if (r.ok) {
          setBase(r.data);
        } else {
          // 拉默认分支失败时降级用 master / main
          setBase('master');
        }
      })
      .finally(() => setLoadingDefault(false));

    // 默认 title：取 log[0] 的 subject
    if (!title && log.length > 0) {
      setTitle(log[0].message.split('\n')[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedRemoteName]);

  // Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, submitting, onClose]);

  if (!open) return null;

  const noPlatformRemote = platformRemotes.length === 0;

  const handleSubmit = async () => {
    if (!parsed || !title.trim() || !base.trim()) return;
    setSubmitting(true);
    const params = {
      owner: parsed.owner,
      repo: parsed.repo,
      title: title.trim(),
      body: body.trim() || undefined,
      head: headBranch,
      base: base.trim(),
      draft: parsed.platform === 'github' ? draft : undefined,
    };
    const fn = parsed.platform === 'github' ? window.gitgui.github.createPR : window.gitgui.gitee.createPR;
    const r = await fn(params);
    setSubmitting(false);
    if (r.ok) {
      setCreatedUrl(r.data.htmlUrl);
      toast.success(t('createPR.success', { platform: parsed.platform === 'github' ? 'GitHub' : 'Gitee' }));
      await refreshLog();
    } else {
      toast.error(t('createPR.failed', { error: r.error }));
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div
        className="w-[560px] max-w-full rounded-lg border shadow-2xl overflow-hidden"
        style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border)' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2 font-medium">
            <GitPullRequest size={14} />
            {t('createPR.title')}
          </div>
          <button onClick={onClose} disabled={submitting} className="text-gray-500 hover:text-gray-300 disabled:opacity-30">
            <X size={14} />
          </button>
        </div>

        {createdUrl ? (
          // 成功页
          <div className="p-6 text-center space-y-3">
            <div className="text-emerald-400 text-sm font-medium">{t('createPR.successTitle')}</div>
            <div className="text-xs text-gray-500 break-all font-mono">{createdUrl}</div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => window.gitgui.app.shellOpen(createdUrl)}
                className="btn-primary text-xs"
              >
                <ExternalLink size={12} />
                {t('createPR.openInBrowser')}
              </button>
              <button onClick={onClose} className="btn-ghost text-xs">
                {t('common.close')}
              </button>
            </div>
          </div>
        ) : noPlatformRemote ? (
          <div className="p-6 text-sm text-gray-400 space-y-2">
            <div className="text-amber-400">{t('createPR.noPlatformRemote')}</div>
            <div className="text-xs">{t('createPR.noPlatformRemoteHint')}</div>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {/* 平台选择 */}
            <div>
              <label className="text-xs text-gray-500 block mb-1">{t('createPR.platform')}</label>
              <div className="flex gap-1.5">
                {platformRemotes.map((r) => {
                  const p = parseRemoteUrl(r.url);
                  if (!p) return null;
                  const Icon = p.platform === 'github' ? Github : Globe;
                  const active = r.name === selectedRemoteName;
                  return (
                    <button
                      key={r.name}
                      onClick={() => setSelectedRemoteName(r.name)}
                      className={`flex-1 flex items-center gap-2 px-3 py-2 rounded border text-sm ${
                        active
                          ? 'border-primary-500 bg-primary-900/30 text-primary-200'
                          : 'border-gray-700 hover:bg-gray-800/40 text-gray-300'
                      }`}
                    >
                      <Icon size={14} className={p.platform === 'github' ? 'text-gray-300' : 'text-red-400'} />
                      <div className="flex-1 text-left">
                        <div className="font-medium">{p.platform === 'github' ? 'GitHub' : 'Gitee'}</div>
                        <div className="text-[10px] text-gray-500">{p.owner}/{p.repo}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="text-xs text-gray-500 block mb-1">{t('createPR.prTitle')}</label>
              <input
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('createPR.titlePlaceholder')}
                autoFocus
              />
            </div>

            {/* Body */}
            <div>
              <label className="text-xs text-gray-500 block mb-1">{t('createPR.prBody')}</label>
              <textarea
                className="input min-h-[100px] resize-y"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={t('createPR.bodyPlaceholder')}
              />
            </div>

            {/* Base / Head */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">
                  {t('createPR.head')} <span className="text-primary-400">→</span>
                </label>
                <input className="input font-mono" value={headBranch} readOnly />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">{t('createPR.base')}</label>
                <div className="relative">
                  <input
                    className="input font-mono pr-8"
                    value={loadingDefault ? '...' : base}
                    onChange={(e) => setBase(e.target.value)}
                    placeholder={t('createPR.basePlaceholder')}
                  />
                  {loadingDefault && (
                    <Loader2 size={12} className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-gray-500" />
                  )}
                </div>
              </div>
            </div>

            {/* Draft (GitHub only) */}
            {parsed?.platform === 'github' && (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft}
                  onChange={(e) => setDraft(e.target.checked)}
                  className="rounded"
                />
                <span>{t('createPR.draft')}</span>
              </label>
            )}
          </div>
        )}

        {/* 底部按钮 */}
        {!createdUrl && !noPlatformRemote && (
          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
            <button onClick={onClose} disabled={submitting} className="btn-ghost text-xs">
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !title.trim() || !base.trim() || loadingDefault}
              className="btn-primary text-xs"
            >
              {submitting ? t('common.loading') : t('createPR.submit')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
