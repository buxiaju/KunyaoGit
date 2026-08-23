// v0.4+ 快捷键速查表（按 ? 打开）

import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n';
import { X, Keyboard } from 'lucide-react';

interface Shortcut {
  keys: string;
  descKey:
    | 'cheatsheet.openPalette'
    | 'cheatsheet.refresh'
    | 'cheatsheet.show'
    | 'cheatsheet.switchTab'
    | 'cheatsheet.commit';
}

const SHORTCUTS: Shortcut[] = [
  { keys: 'Ctrl+Shift+P', descKey: 'cheatsheet.openPalette' },
  { keys: 'Ctrl+R', descKey: 'cheatsheet.refresh' },
  { keys: '?', descKey: 'cheatsheet.show' },
  { keys: '1 / 2 / 3 / 4 / 5', descKey: 'cheatsheet.switchTab' },
  { keys: 'Ctrl+Enter', descKey: 'cheatsheet.commit' },
];

export function Cheatsheet() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onShow = () => setOpen(true);
    window.addEventListener('kg:shortcut:cheatsheet', onShow as EventListener);
    return () => window.removeEventListener('kg:shortcut:cheatsheet', onShow as EventListener);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div
        className="w-[440px] max-w-[92vw] rounded-lg border shadow-2xl overflow-hidden"
        style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2 font-medium">
            <Keyboard size={14} />
            {t('cheatsheet.title')}
          </div>
          <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-gray-300">
            <X size={14} />
          </button>
        </div>
        <div className="p-2">
          {SHORTCUTS.map((s) => (
            <div
              key={s.keys}
              className="flex items-center justify-between px-3 py-2 rounded hover:bg-gray-800/40"
            >
              <span className="text-sm text-gray-300">{t(`cheatsheet.${s.descKey.split('.')[1]}` as any)}</span>
              <kbd
                className="px-2 py-0.5 text-[11px] font-mono rounded border"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-tertiary)',
                }}
              >
                {s.keys}
              </kbd>
            </div>
          ))}
        </div>
        <div
          className="px-4 py-2 text-[10px] text-gray-500 border-t"
          style={{ borderColor: 'var(--border)' }}
        >
          {t('cheatsheet.hint')}
        </div>
      </div>
    </div>
  );
}

export default Cheatsheet;
