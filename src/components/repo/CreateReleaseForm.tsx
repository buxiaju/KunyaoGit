// v0.6+ Release 创建表单
// 嵌入在 ReleasesPage 顶部（不是 modal），包含：tag / name / body / draft / prerelease / 附件
// 提交流程：先 create release，再逐个 uploadAsset；任一失败回滚提示但保留已成功项

import { useState } from 'react';
import { useI18n } from '../../i18n';
import { useRepoStore } from '../../stores/repo';
import { toast } from '../common/Toast';
import { FileText, Loader2, Paperclip, X, Plus } from 'lucide-react';

interface Props {
  platform: 'github' | 'gitee';
  onCreated: () => void;
  onCancel: () => void;
}

interface PendingFile {
  filePath: string;
  name: string;
  size: number;
}

export default function CreateReleaseForm({ platform, onCreated, onCancel }: Props) {
  const { t } = useI18n();
  const { current } = useRepoStore();
  const [tag, setTag] = useState('');
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [draft, setDraft] = useState(false);
  const [prerelease, setPrerelease] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [files, setFiles] = useState<PendingFile[]>([]);

  const isGitee = platform === 'gitee';
  const totalBytes = files.reduce((s, f) => s + f.size, 0);

  const generateChangelog = async () => {
    if (!current) return;
    setGenerating(true);
    try {
      const r = await window.gitgui.release.changelog({ repoPath: current.path });
      if (r.ok) {
        setBody(r.data);
        toast.success(t('releases.changelogGenerated'));
      } else {
        toast.error(t('releases.changelogFailed', { error: r.error }));
      }
    } finally {
      setGenerating(false);
    }
  };

  const addFiles = async () => {
    const r = await window.gitgui.dialog.showOpen({
      title: t('releases.selectFiles'),
      properties: ['openFile', 'multiSelections'],
    });
    if (r.canceled || r.filePaths.length === 0) return;
    const newFiles: PendingFile[] = r.filePaths.map((p) => ({
      filePath: p,
      name: p.split(/[\\/]/).pop() || p,
      size: 0, // size 在主进程上传时拿，UI 上不强求
    }));
    setFiles((prev) => [...prev, ...newFiles]);
  };

  const removeFile = (i: number) => {
    setFiles((prev) => prev.filter((_, idx) => idx !== i));
  };

  const submit = async () => {
    if (!current) return;
    if (!tag.trim() || !name.trim()) {
      toast.warn(t('releases.tagAndNameRequired'));
      return;
    }
    setSubmitting(true);
    try {
      // 1. 创建 release
      const cr = await window.gitgui.release.create({
        repoPath: current.path,
        tag: tag.trim(),
        name: name.trim(),
        body,
        draft: isGitee ? false : draft,
        prerelease,
        platform,
      });
      if (!cr.ok) {
        toast.error(t('releases.createFailed', { error: cr.error }));
        return;
      }
      // 2. 逐个上传附件
      let uploadedCount = 0;
      for (const f of files) {
        const ur = await window.gitgui.release.uploadAsset({
          repoPath: current.path,
          tag: tag.trim(),
          filePath: f.filePath,
          platform,
        });
        if (ur.ok) uploadedCount += 1;
        else toast.warn(t('releases.uploadAssetFailed', { name: f.name, error: ur.error }));
      }
      if (uploadedCount === files.length) {
        toast.success(t('releases.createSuccessWithAssets', { count: uploadedCount }));
      } else {
        toast.success(t('releases.createSuccessPartial', { ok: uploadedCount, total: files.length }));
      }
      onCreated();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="border-b border-gray-800 bg-gray-900/50 p-4 space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        <input
          className="input"
          placeholder={t('releases.tagInputPlaceholder')}
          value={tag}
          onChange={(e) => setTag(e.target.value)}
        />
        <input
          className="input"
          placeholder={t('releases.nameInputPlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-sm">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={draft}
              onChange={(e) => setDraft(e.target.checked)}
              disabled={isGitee}
            />
            {t('releases.isDraft')}
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={prerelease}
              onChange={(e) => setPrerelease(e.target.checked)}
            />
            {t('releases.isPrerelease')}
          </label>
        </div>
        <button onClick={generateChangelog} disabled={generating} className="btn-ghost text-xs">
          {generating ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
          {t('releases.generateChangelog')}
        </button>
      </div>
      <textarea
        className="input min-h-[140px] font-mono text-xs"
        placeholder={t('releases.bodyInputPlaceholder')}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />

      {/* 附件区 */}
      <div className="panel p-2 space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Paperclip size={11} />
            {t('releases.attachments')} ({files.length})
            {files.length > 0 && (
              <span className="text-gray-500 ml-1">· {formatBytes(totalBytes)}</span>
            )}
          </div>
          <button onClick={addFiles} disabled={submitting} className="btn-ghost text-xs">
            <Plus size={11} />
            {t('releases.addAttachment')}
          </button>
        </div>
        {isGitee && files.some((f) => f.size === 0 ? false : f.size > 100 * 1024 * 1024) && (
          <div className="text-[10px] text-amber-300 bg-amber-900/20 border border-amber-700/40 rounded px-2 py-1">
            {t('releases.giteeSizeLimit')}
          </div>
        )}
        {files.length === 0 ? (
          <div className="text-[11px] text-gray-500 px-1 py-0.5">{t('releases.noAttachments')}</div>
        ) : (
          <div className="space-y-0.5">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-xs px-1.5 py-1 hover:bg-gray-800/40 rounded">
                <Paperclip size={10} className="text-gray-500 flex-shrink-0" />
                <span className="flex-1 truncate font-mono">{f.name}</span>
                <span className="text-[10px] text-gray-500">{f.size ? formatBytes(f.size) : ''}</span>
                <button
                  onClick={() => removeFile(i)}
                  disabled={submitting}
                  className="text-gray-500 hover:text-red-400"
                >
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button onClick={submit} disabled={submitting} className="btn-primary text-xs">
          {submitting ? <Loader2 size={12} className="animate-spin" /> : null}
          {t('releases.create')}
        </button>
        <button onClick={onCancel} disabled={submitting} className="btn-ghost text-xs">
          {t('releases.cancel')}
        </button>
      </div>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
