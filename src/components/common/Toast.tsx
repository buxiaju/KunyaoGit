import { create } from 'zustand';
import { useEffect } from 'react';
import { CheckCircle2, XCircle, AlertCircle, Info, X } from 'lucide-react';
import { nanoid } from 'nanoid';

type ToastType = 'success' | 'error' | 'warn' | 'info';
interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastStore {
  items: ToastItem[];
  push: (type: ToastType, message: string) => void;
  remove: (id: string) => void;
}

const useToastStore = create<ToastStore>((set) => ({
  items: [],
  push: (type, message) => {
    const id = nanoid();
    set((s) => ({ items: [...s.items, { id, type, message }] }));
    setTimeout(() => {
      set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
    }, 4000);
  },
  remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
}));

export const toast = {
  success: (m: string) => useToastStore.getState().push('success', m),
  error: (m: string) => useToastStore.getState().push('error', m),
  warn: (m: string) => useToastStore.getState().push('warn', m),
  info: (m: string) => useToastStore.getState().push('info', m),
};

const ICONS: Record<ToastType, any> = {
  success: CheckCircle2,
  error: XCircle,
  warn: AlertCircle,
  info: Info,
};

const STYLES: Record<ToastType, string> = {
  success: 'border-emerald-700/60 bg-emerald-900/70 text-emerald-100',
  error: 'border-red-700/60 bg-red-900/70 text-red-100',
  warn: 'border-amber-700/60 bg-amber-900/70 text-amber-100',
  info: 'border-sky-700/60 bg-sky-900/70 text-sky-100',
};

export function Toaster() {
  const items = useToastStore((s) => s.items);
  const remove = useToastStore((s) => s.remove);

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {items.map((t) => {
        const Icon = ICONS[t.type];
        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-2 px-3 py-2 rounded-md border shadow-lg max-w-sm ${STYLES[t.type]}`}
          >
            <Icon size={16} className="mt-0.5 flex-shrink-0" />
            <div className="text-sm flex-1 break-all">{t.message}</div>
            <button onClick={() => remove(t.id)} className="opacity-60 hover:opacity-100">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
