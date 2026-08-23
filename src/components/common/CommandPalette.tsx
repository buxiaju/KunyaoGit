// v0.4+ 命令面板（VS Code 式 Ctrl+Shift+P 模态）
// 始终挂载在 App 根；通过 useCommandPalette 控制 open 状态

import { useEffect, useMemo, useRef, useState } from 'react';
import { useCommandPalette } from '../../hooks/useCommandPalette';
import { useI18n } from '../../i18n';
import { filterCommands, type Command, type CommandCategory } from '../../config/commands';
import { Search, CornerDownLeft, X } from 'lucide-react';
import clsx from 'clsx';

const CATEGORY_ORDER: CommandCategory[] = ['git', 'navigation', 'view', 'settings'];
const CATEGORY_LABEL_KEY: Record<CommandCategory, string> = {
  git: 'command.categoryGit',
  navigation: 'command.categoryNavigation',
  view: 'command.categoryView',
  settings: 'command.categorySettings',
};

export function CommandPalette() {
  const { t } = useI18n();
  const open = useCommandPalette((s) => s.open);
  const closePalette = useCommandPalette((s) => s.closePalette);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // 计算过滤后的命令
  const filtered = useMemo(() => filterCommands(query), [query]);

  // 按 category 分组
  const grouped = useMemo(() => {
    const m = new Map<CommandCategory, Command[]>();
    for (const c of filtered) {
      if (!m.has(c.category)) m.set(c.category, []);
      m.get(c.category)!.push(c);
    }
    // 保持分类顺序 + 内部按 titleKey 字母序
    return CATEGORY_ORDER
      .filter((cat) => m.has(cat))
      .map((cat) => ({ category: cat, items: m.get(cat)! }));
  }, [filtered]);

  // 扁平索引（用于高亮上下移动）
  const flatList = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  // 打开时：重置 query + 高亮 + 聚焦
  useEffect(() => {
    if (open) {
      setQuery('');
      setHighlight(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // query 或 filtered 变化时 clamp 高亮
  useEffect(() => {
    if (highlight >= flatList.length) setHighlight(0);
  }, [flatList.length, highlight]);

  // Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closePalette();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight((h) => (flatList.length === 0 ? 0 : (h + 1) % flatList.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight((h) => (flatList.length === 0 ? 0 : (h - 1 + flatList.length) % flatList.length));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const c = flatList[highlight];
        if (c) {
          closePalette();
          // 异步执行避免影响关闭动画
          Promise.resolve().then(() => c.run());
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, flatList, highlight, closePalette]);

  if (!open) return null;

  // 计算高亮项的全局索引（用于 ArrowDown/Up 跨组）
  const getFlatIndex = (cmd: Command) => flatList.findIndex((c) => c.id === cmd.id);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/60"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closePalette();
      }}
    >
      <div
        className="w-[560px] max-w-[92vw] rounded-lg border shadow-2xl overflow-hidden"
        style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border)' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* 搜索框 */}
        <div className="flex items-center gap-2 px-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <Search size={14} className="text-gray-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('command.palettePlaceholder')}
            className="flex-1 bg-transparent py-2.5 text-sm outline-none"
            style={{ color: 'var(--text-primary)' }}
            autoComplete="off"
            spellCheck={false}
          />
          <button onClick={closePalette} className="text-gray-500 hover:text-gray-300">
            <X size={14} />
          </button>
        </div>

        {/* 命令列表 */}
        <div className="max-h-[60vh] overflow-y-auto py-1">
          {flatList.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-gray-500">
              {t('command.noResults')}
            </div>
          ) : (
            grouped.map((g) => (
              <div key={g.category} className="pb-1">
                <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-gray-500">
                  {t(CATEGORY_LABEL_KEY[g.category] as any)}
                </div>
                {g.items.map((c) => {
                  const flatIdx = getFlatIndex(c);
                  const active = flatIdx === highlight;
                  return (
                    <button
                      key={c.id}
                      onMouseEnter={() => setHighlight(flatIdx)}
                      onClick={() => {
                        closePalette();
                        Promise.resolve().then(() => c.run());
                      }}
                      className={clsx(
                        'w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm',
                        active ? 'bg-primary-600/30 text-primary-200' : 'text-gray-300'
                      )}
                    >
                      <span className="flex-1 truncate">
                        {c.hint ? t(c.titleKey as any) + ' — ' + t(c.hint as any) : t(c.titleKey as any)}
                      </span>
                      {c.shortcut && (
                        <span className="text-[10px] text-gray-500 font-mono">{c.shortcut}</span>
                      )}
                      {active && <CornerDownLeft size={11} className="text-primary-400" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* 底部状态 */}
        <div
          className="flex items-center justify-between px-3 py-1.5 text-[10px] text-gray-500 border-t"
          style={{ borderColor: 'var(--border)' }}
        >
          <span>{t('command.paletteHint')}</span>
          <span>↑↓ {t('command.navigate')} · ↵ {t('command.run')}</span>
        </div>
      </div>
    </div>
  );
}

export default CommandPalette;
