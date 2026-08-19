// Lightweight i18n: React Context + t() function with dot-notation keys
// Usage: const { t, lang, setLang } = useI18n();
//        t('settings.title')  →  "设置" / "Settings"

import { createContext, useContext, useMemo, useCallback, ReactNode } from 'react';
import { zh, TranslationDict } from './zh';
import { en } from './en';

export type Lang = 'zh' | 'en';

const dicts: Record<Lang, TranslationDict> = { zh, en };

// Flatten nested keys: { a: { b: 'c' } } → 'a.b' → 'c'
type FlattenKeys<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends Record<string, any>
    ? FlattenKeys<T[K], `${P}${K}.`>
    : `${P}${K}`;
}[keyof T & string];

export type I18nKey = FlattenKeys<TranslationDict>;

function getValue(obj: any, path: string): string {
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return path;
    cur = cur[p];
  }
  return typeof cur === 'string' ? cur : path;
}

interface I18nContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: I18nKey, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  lang,
  setLang,
  children,
}: {
  lang: Lang;
  setLang: (l: Lang) => void;
  children: ReactNode;
}) {
  const t = useCallback(
    (key: I18nKey, params?: Record<string, string | number>) => {
      let s = getValue(dicts[lang], key);
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
        }
      }
      return s;
    },
    [lang]
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
