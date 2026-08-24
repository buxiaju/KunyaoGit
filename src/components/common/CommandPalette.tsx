// v0.4+ 命令面板（VS Code 式 Ctrl+Shift+P 模态）
// v0.5+ 加 file 模式：Ctrl+P 跳转到工作区文件
// 始终挂载在 App 根；通过 useCommandPalette 控制 open 状态

import { useEffect, useMemo, useRef, useState } from 'react';
import { useCommandPalette } from '../../hooks/useCommandPalette';
import { useI18n } from '../../i18n';
import { useRepoStore } from '../../stores/repo';
import { filterCommands, type Command, type CommandCategory } from '../../config/commands';
import { fuzzySearch } from '../../lib/fuzzyMatch';
import { Search, CornerDownLeft, X, FileText, Hash } from 'lucide-react';
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
  const mode = useCommandPalette((s) => s.mode);
  const closePalette = useCommandPalette((s) => s.closePalette);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [files, setFiles] = useState<{ path: string }[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const current = useRepoStore((s) => s.current);
  const selectFileForEdit = useRepoStore((s) => s.selectFileForEdit);

  // file 模式加载文件列表
  useEffect(() => {
    if (open && mode === 'file' && current) {
      setFilesLoading(true);
      window.gitgui.git.listFiles(current.path, { maxCount: 5000 })
        .then((r) => { if (r.ok) setFiles(r.data); })
        .finally(() => setFilesLoading(false));
    }
  }, [open, mode, current?.path]);

  // 计算过滤后的命令
  const filteredCommands = useMemo(() => filterCommands(query), [query]);

  // 按 category 分组
  const groupedCommands = useMemo(() => {
    const m = new Map<CommandCategory, Command[]>();
    for (const c of filteredCommands) {
      if (!m.has(c.category)) m.set(c.category, []);
      m.get(c.category)!.push(c);
    }
    return CATEGORY_ORDER
      .filter((cat) => m.has(cat))
      .map((cat) => ({ category: cat, items: m.get(cat)! }));
  }, [filteredCommands]);

  // file 模式模糊搜索
  const filteredFiles = useMemo(() => {
    if (mode !== 'file') return [];
    return fuzzySearch(query, files, (f) => f.path, 50);
  }, [query, files, mode]);

  const flatList = useMemo(() => {
    if (mode === 'file') return filteredFiles.map((f) => ({ kind: 'file' as const, item: f.item, result: f.result }));
    return groupedCommands.flatMap((g) => g.items.map((c) => ({ kind: 'command' as const, item: c, result: null })));
  }, [mode, filteredFiles, groupedCommands]);

  // 打开时：重置 query + 高亮 + 聚焦
  useEffect(() => {
    if (open) {
      setQuery('');
      setHighlight(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // query 或 flatList 长度变化时 clamp 高亮
  useEffect(() => {
    if (highlight >= flatList.length) setHighlight(0);
  }, [flatList.length, highlight]);

  // Esc 关闭 + 上下导航 + Enter 执行
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
        const cur = flatList[highlight];
        if (!cur) return;
        closePalette();
        if (cur.kind === 'command') {
          Promise.resolve().then(() => cur.item.run());
        } else {
          // file: 跳转到该文件（用 store action + 触发「文件」tab + 路由同步）
          const filePath = cur.item.path;
          if (current) {
            selectFileForEdit(filePath);
            // 切到「文件」tab：派发与 RepoPage 约定的事件
            window.location.hash = '#/repo';
            window.dispatchEvent(new CustomEvent('kg:navigate:tab', { detail: 'files' }));
          }
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, flatList, highlight, closePalette, current, selectFileForEdit]);

  if (!open) return null;

  const renderHighlightedText = (text: string, indices: number[]) => {
    if (!indices || indices.length === 0) return text;
    const set = new Set(indices);
    const parts: { ch: string; hit: boolean }[] = [];
    for (let i = 0; i < text.length; i++) {
      parts.push({ ch: text[i], hit: set.has(i) });
    }
    return parts.map((p, i) => (
      <span key={i} className={p.hit ? 'text-primary-300 font-semibold' : ''}>{p.ch}</span>
    ));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/60"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closePalette();
      }}
    >
      <div
        className="w-[640px] max-w-[92vw] rounded-lg border shadow-2xl overflow-hidden"
        style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border)' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* 搜索框 + mode 提示 */}
        <div className="flex items-center gap-2 px-3 border-b" style={{ borderColor: 'var(--border)' }}>
          {mode === 'file' ? <FileText size={14} className="text-gray-400" /> : <Search size={14} className="text-gray-400" />}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={mode === 'file' ? t('command.filePlaceholder') : t('command.palettePlaceholder')}
            className="flex-1 bg-transparent py-2.5 text-sm outline-none"
            style={{ color: 'var(--text-primary)' }}
            autoComplete="off"
            spellCheck={false}
          />
          <span className="text-[10px] text-gray-500 font-mono">
            {mode === 'file' ? <><Hash size={10} className="inline mr-0.5" />文件</> : <>命令</>}
          </span>
          <button onClick={closePalette} className="text-gray-500 hover:text-gray-300">
            <X size={14} />
          </button>
        </div>

        {/* 列表 */}
        <div className="max-h-[60vh] overflow-y-auto py-1">
          {flatList.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-gray-500">
              {filesLoading ? t('common.loading') : t('command.noResults')}
            </div>
          ) : mode === 'file' ? (
            // 文件列表
            filteredFiles.map((f, idx) => {
              const active = idx === highlight;
              return (
                <button
                  key={f.item.path}
                  onMouseEnter={() => setHighlight(idx)}
                  onClick={() => {
                    closePalette();
                    if (current) {
                      selectFileForEdit(f.item.path);
                      window.location.hash = '#/repo';
                      window.dispatchEvent(new CustomEvent('kg:navigate:tab', { detail: 'files' }));
                    }
                  }}
                  className={clsx(
                    'w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm',
                    active ? 'bg-primary-600/30 text-primary-200' : 'text-gray-300',
                  )}
                >
                  <FileText size={12} className="text-gray-500 shrink-0" />
                  <span className="flex-1 truncate font-mono text-xs">
                    {renderHighlightedText(f.item.path, f.result.matchedIndices)}
                  </span>
                  {active && <CornerDownLeft size={11} className="text-primary-400" />}
                </button>
              );
            })
          ) : (
            // 命令列表（v0.4 既有）
            groupedCommands.map((g) => (
              <div key={g.category} className="pb-1">
                <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-gray-500">
                  {t(CATEGORY_LABEL_KEY[g.category] as any)}
                </div>
                {g.items.map((c) => {
                  const flatIdx = flatList.findIndex((x) => x.kind === 'command' && x.item.id === c.id);
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
                        active ? 'bg-primary-600/30 text-primary-200' : 'text-gray-300',
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
          <span>{mode === 'file' ? t('command.fileHint') : t('command.paletteHint')}</span>
          <span>↑↓ {t('command.navigate')} · ↵ {t('command.run')}</span>
        </div>
      </div>
    </div>
  );
}

export default CommandPalette;
