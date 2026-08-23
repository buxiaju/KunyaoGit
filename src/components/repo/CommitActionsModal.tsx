// v0.4+ 通用确认弹窗（Cherry-pick / Revert / 未来的 force-push 等危险操作）
// 接收 title / message / confirmLabel / onConfirm / danger

import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n';
import { X, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';

interface Props {
  open: boolean;
  title: string;
  description?: string;
  details?: { label: string; value: string }[];
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

export function CommitActionsModal({
  open,
  title,
  description,
  details = [],
  confirmLabel,
  cancelLabel,
  danger = false,
  loading = false,
  onConfirm,
  onClose,
}: Props) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
      else if (e.key === 'Enter' && !busy) handleConfirm();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, busy]);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="w-[480px] max-w-full rounded-lg border shadow-2xl overflow-hidden"
        style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border)' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-2 font-medium">
            {danger && <AlertTriangle size={14} className="text-red-400" />}
            {title}
          </div>
          <button onClick={onClose} disabled={busy} className="text-gray-500 hover:text-gray-300 disabled:opacity-30">
            <X size={14} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {description && <div className="text-sm text-gray-300 whitespace-pre-wrap">{description}</div>}

          {details.length > 0 && (
            <div className="panel p-3 space-y-1.5">
              {details.map((d, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="text-gray-500 w-20 flex-shrink-0">{d.label}</span>
                  <span className="font-mono text-primary-300 truncate flex-1" title={d.value}>
                    {d.value}
                  </span>
                </div>
              ))}
            </div>
          )}

          {danger && (
            <div className="text-xs text-amber-300 bg-amber-900/20 border border-amber-700/40 rounded p-2">
              {t('commitActions.dangerHint')}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <button onClick={onClose} disabled={busy} className="btn-ghost text-xs">
            {cancelLabel || t('common.cancel')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={busy || loading}
            className={clsx('text-xs', danger ? 'btn-danger' : 'btn-primary')}
          >
            {busy || loading ? t('common.loading') : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CommitActionsModal;
