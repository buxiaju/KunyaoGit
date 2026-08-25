// v0.6+ Release 详情侧边抽屉
// 完整信息 + Markdown body + assets 完整管理（下载/删除/上传新附件）+ 编辑 / 发布

import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n';
import { useRepoStore } from '../../stores/repo';
import { toast } from '../common/Toast';
import MarkdownBody from './MarkdownBody';
import type { ReleaseInfo, ReleaseAsset } from '../../../shared/types';
import {
  X, Tag, Package, Download, Trash2, Upload, Loader2, Edit2, Save,
  Send, ExternalLink, ChevronRight, Pencil
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import clsx from 'clsx';

interface Props {
  release: ReleaseInfo | null;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}

export default function ReleaseDetailDrawer({ release, open, onClose, onChanged }: Props) {
  const { t } = useI18n();
  const { current } = useRepoStore();
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editPrerelease, setEditPrerelease] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  // 打开时同步编辑态
  useEffect(() => {
    if (open && release) {
      setEditName(release.name);
      setEditBody(release.body);
      setEditPrerelease(release.prerelease);
      setEditing(false);
    }
  }, [open, release?.tag, release?.platform]);

  // Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy && !uploading) {
        if (editing) setEditing(false);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, busy, uploading, editing, onClose]);

  if (!open || !release) return null;
  const platform = release.platform;

  const saveEdit = async () => {
    if (!current) return;
    setBusy(true);
    const r = await window.gitgui.release.update({
      repoPath: current.path,
      tag: release.tag,
      name: editName.trim() || release.name,
      body: editBody,
      prerelease: editPrerelease,
      platform,
    });
    setBusy(false);
    if (r.ok) {
      toast.success(t('releases.updateSuccess'));
      setEditing(false);
      onChanged();
    } else {
      toast.error(t('releases.updateFailed', { error: r.error }));
    }
  };

  const publishDraft = async () => {
    if (!current) return;
    setBusy(true);
    const r = await window.gitgui.release.publish(current.path, release.tag, platform);
    setBusy(false);
    if (r.ok) {
      toast.success(t('releases.publishSuccess'));
      onChanged();
    } else {
      toast.error(t('releases.publishFailed', { error: r.error }));
    }
  };

  const removeAsset = async (asset: ReleaseAsset) => {
    if (!current) return;
    if (!confirm(t('releases.deleteAssetConfirm', { name: asset.name }))) return;
    setBusy(true);
    const r = await window.gitgui.release.deleteAsset({
      repoPath: current.path,
      tag: release.tag,
      assetId: asset.id,
      platform,
    });
    setBusy(false);
    if (r.ok) {
      toast.success(t('releases.deleteAssetSuccess'));
      onChanged();
    } else {
      toast.error(t('releases.deleteAssetFailed', { error: r.error }));
    }
  };

  const uploadNew = async () => {
    if (!current) return;
    const r = await window.gitgui.dialog.showOpen({
      title: t('releases.selectFiles'),
      properties: ['openFile'],
    });
    if (r.canceled || r.filePaths.length === 0) return;
    setUploading(true);
    let okCount = 0;
    for (const fp of r.filePaths) {
      const ur = await window.gitgui.release.uploadAsset({
        repoPath: current.path,
        tag: release.tag,
        filePath: fp,
        platform,
      });
      if (ur.ok) okCount += 1;
      else toast.warn(t('releases.uploadAssetFailed', { name: fp.split(/[\\/]/).pop() || fp, error: ur.error }));
    }
    setUploading(false);
    if (okCount > 0) {
      toast.success(t('releases.uploadAssetSuccess', { count: okCount }));
      onChanged();
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy && !uploading) onClose();
      }}
    >
      <div
        className="w-[640px] max-w-[92vw] h-full flex flex-col border-l shadow-2xl"
        style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border)' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="px-4 py-3 border-b flex items-start gap-2 flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <Tag size={14} className="text-primary-400 mt-0.5" />
          <div className="flex-1 min-w-0">
            {editing ? (
              <input
                className="input text-sm"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder={t('releases.nameInputPlaceholder')}
              />
            ) : (
              <div className="text-sm font-medium truncate">{release.name}</div>
            )}
            <div className="text-[11px] text-gray-500 font-mono mt-0.5">{release.tag}</div>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              {release.draft && (
                <span className="text-[10px] px-1.5 rounded bg-gray-700 text-gray-300">
                  {t('releases.draft')}
                </span>
              )}
              {release.prerelease && (
                <span className="text-[10px] px-1.5 rounded bg-amber-900/50 text-amber-300">
                  {t('releases.prerelease')}
                </span>
              )}
              <span className="text-[10px] px-1.5 rounded bg-gray-800 text-gray-400">
                {release.platform}
              </span>
              {(release.publishedAt || release.createdAt) && (
                <span className="text-[10px] text-gray-500">
                  {formatDistanceToNow(new Date(release.publishedAt || release.createdAt), {
                    locale: zhCN,
                    addSuffix: true,
                  })}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} disabled={busy || uploading} className="text-gray-500 hover:text-gray-300">
            <X size={14} />
          </button>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* body */}
          <div>
            <div className="text-[11px] text-gray-500 uppercase tracking-wider mb-1.5">
              {t('releases.body')}
            </div>
            {editing ? (
              <textarea
                className="input min-h-[200px] font-mono text-xs"
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                placeholder={t('releases.bodyInputPlaceholder')}
              />
            ) : release.body ? (
              <div className="panel p-3">
                <MarkdownBody source={release.body} />
              </div>
            ) : (
              <div className="text-xs text-gray-500 italic">{t('releases.bodyEmpty')}</div>
            )}
            {editing && (
              <label className="flex items-center gap-1.5 text-xs mt-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editPrerelease}
                  onChange={(e) => setEditPrerelease(e.target.checked)}
                />
                {t('releases.isPrerelease')}
              </label>
            )}
          </div>

          {/* assets */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[11px] text-gray-500 uppercase tracking-wider flex items-center gap-1">
                <Package size={11} />
                {t('releases.assets')} ({release.assets.length})
              </div>
              <button
                onClick={uploadNew}
                disabled={busy || uploading}
                className="btn-ghost text-xs"
              >
                {uploading ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
                {t('releases.uploadAsset')}
              </button>
            </div>
            {release.assets.length === 0 ? (
              <div className="text-xs text-gray-500 italic panel p-3 text-center">
                {t('releases.noAssets')}
              </div>
            ) : (
              <div className="panel divide-y" style={{ borderColor: 'var(--border)' }}>
                {release.assets.map((a) => (
                  <div
                    key={a.id}
                    className={clsx(
                      'flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-800/40 group',
                      busy && 'opacity-60'
                    )}
                  >
                    <Package size={11} className="text-gray-500 flex-shrink-0" />
                    <span className="flex-1 truncate font-mono" title={a.name}>{a.name}</span>
                    <span className="text-[10px] text-gray-500">{formatBytes(a.size)}</span>
                    <span className="text-[10px] text-gray-500 w-16 text-right">
                      {t('releases.downloads', { count: a.downloadCount })}
                    </span>
                    <button
                      onClick={() => window.gitgui.app.shellOpen(a.downloadUrl)}
                      className="btn-ghost p-1"
                      title={t('releases.download')}
                    >
                      <Download size={11} />
                    </button>
                    <button
                      onClick={() => removeAsset(a)}
                      disabled={busy}
                      className="btn-ghost p-1 hover:text-red-400"
                      title={t('common.delete')}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 底部操作栏 */}
        <div
          className="px-4 py-3 border-t flex items-center justify-end gap-2 flex-shrink-0"
          style={{ borderColor: 'var(--border)' }}
        >
          {editing ? (
            <>
              <button onClick={() => setEditing(false)} disabled={busy} className="btn-ghost text-xs">
                {t('common.cancel')}
              </button>
              <button onClick={saveEdit} disabled={busy} className="btn-primary text-xs">
                {busy ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                {t('releases.saveChanges')}
              </button>
            </>
          ) : (
            <>
              {release.draft && (
                <button onClick={publishDraft} disabled={busy} className="btn-ghost text-xs text-primary-300">
                  <Send size={11} />
                  {t('releases.publishDraft')}
                </button>
              )}
              <button onClick={() => setEditing(true)} disabled={busy} className="btn-ghost text-xs">
                <Pencil size={11} />
                {t('releases.edit')}
              </button>
            </>
          )}
        </div>
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
