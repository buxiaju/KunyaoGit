import { useEffect, useRef, useState } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { useRepoStore } from '../../stores/repo';
import { useI18n } from '../../i18n';
import { useSettingsStore } from '../../stores/settings';
import { monacoThemeFor } from '../../hooks/useTheme';
import { Save, Loader2, FileCode, RefreshCw, History, User } from 'lucide-react';
import { toast } from '../common/Toast';
import FileHistoryPanel from './FileHistoryPanel';

function detectLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    json: 'json', html: 'html', css: 'css', scss: 'scss', less: 'less',
    md: 'markdown', py: 'python', go: 'go', rs: 'rust', java: 'java',
    c: 'c', cpp: 'cpp', h: 'cpp', hpp: 'cpp', cs: 'csharp', rb: 'ruby',
    php: 'php', sh: 'shell', yaml: 'yaml', yml: 'yaml', xml: 'xml',
    sql: 'sql', toml: 'ini', ini: 'ini', vue: 'html', svelte: 'html',
  };
  return map[ext] || 'plaintext';
}

export default function EditorPane() {
  const { current, selectedFile, fileContent, fileDirty, fileLoading, loadFile, saveFile, closeFile, refreshStatus } = useRepoStore();
  const { t } = useI18n();
  const theme = useSettingsStore((s) => s.settings.theme);
  const editorRef = useRef<any>(null);
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [blameInfo, setBlameInfo] = useState<{ line: number; hash: string; author: string; message: string; date: string } | null>(null);
  const [blameLoading, setBlameLoading] = useState(false);

  useEffect(() => {
    if (selectedFile && current) {
      loadFile(selectedFile);
    }
  }, [selectedFile, current, loadFile]);

  // v0.5+ 切换文件时拉 blame（一次性全量，映射 line → BlameLine）
  const blameMapRef = useRef<Map<number, { hash: string; author: string; message: string; date: string }>>(new Map());
  useEffect(() => {
    if (!selectedFile || !current) {
      blameMapRef.current.clear();
      setBlameInfo(null);
      return;
    }
    setBlameLoading(true);
    window.gitgui.git.blame(current.path, selectedFile)
      .then((r) => {
        if (!r.ok) return;
        const map = new Map<number, { hash: string; author: string; message: string; date: string }>();
        for (const b of r.data) {
          map.set(b.line, { hash: b.hash, author: b.author, message: b.message, date: b.date });
        }
        blameMapRef.current = map;
      })
      .finally(() => setBlameLoading(false));
  }, [selectedFile, current?.path]);

  // v0.5+ 点击 Monaco 行号 gutter 查 blame
  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    editor.onMouseDown((e) => {
      // gutter 类型：2 = glyph margin（行号左侧），3 = line numbers
      const target = e.target as any;
      if (target?.type === 2 || target?.type === 3) {
        const pos = e.target.position;
        if (pos && pos.lineNumber) {
          const info = blameMapRef.current.get(pos.lineNumber);
          if (info) {
            setBlameInfo({ line: pos.lineNumber, ...info });
          }
        }
      }
    });
  };

  // 主题切换时同步 Monaco 编辑器（不重建整个 Editor 实例，只调 setTheme）
  useEffect(() => {
    const apply = () => {
      if (editorRef.current) {
        const monaco = (editorRef.current as any).getModel()?.__$editorMonaco
          || (window as any).monaco;
        const t = monacoThemeFor(theme);
        if (monaco?.editor?.setTheme) monaco.editor.setTheme(t);
      }
    };
    window.addEventListener('kg-theme-change', apply);
    apply();
    return () => window.removeEventListener('kg-theme-change', apply);
  }, [theme]);

  if (!current) return null;

  if (!selectedFile) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 text-sm">
        <div className="text-center">
          <FileCode size={32} className="mx-auto mb-2 opacity-50" />
          <div>{t('files.selectFileHint')}</div>
        </div>
      </div>
    );
  }

  if (fileLoading) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 text-sm">
        <Loader2 size={16} className="animate-spin mr-2" /> {t('files.loading')}
      </div>
    );
  }

  const handleChange = (value: string | undefined) => {
    if (value == null) return;
    useRepoStore.getState().setFileContent(value);
  };

  const doSave = async () => {
    if (!fileDirty || !selectedFile) return;
    setSaving(true);
    try {
      const r = await saveFile(selectedFile);
      if (r.ok) {
        toast.success(t('files.saved'));
        // 保存后刷新 git 状态，让「变更」tab 立即看到修改
        await refreshStatus();
      } else toast.error(t('files.saveFailed', { error: r.error || '' }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-1.5 border-b border-gray-800 flex items-center justify-between text-sm bg-gray-900/50">
        <div className="flex items-center gap-2 min-w-0">
          <FileCode size={14} className="text-primary-400 flex-shrink-0" />
          <span className="truncate font-mono text-xs">{selectedFile}</span>
          {fileDirty && <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" title={t('files.unsaved')} />}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setHistoryOpen(true)}
            className="btn-ghost p-1"
            title={t('fileHistory.open')}
          >
            <History size={13} />
          </button>
          <button onClick={() => selectedFile && loadFile(selectedFile)} className="btn-ghost p-1" title={t('files.reload')}>
            <RefreshCw size={13} />
          </button>
          <button onClick={closeFile} className="btn-ghost p-1 text-xs" title={t('files.close')}>
            ×
          </button>
          <button onClick={doSave} disabled={!fileDirty || saving} className="btn-primary text-xs">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            {t('files.save')}
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        {fileContent !== null && (
          <Editor
            height="100%"
            path={selectedFile}
            language={detectLanguage(selectedFile)}
            value={fileContent}
            theme={monacoThemeFor(theme)}
            onMount={handleMount}
            onChange={handleChange}
            options={{
              fontSize: 13,
              fontFamily: 'JetBrains Mono, Cascadia Code, Consolas, monospace',
              minimap: { enabled: true, scale: 1 },
              wordWrap: 'on',
              tabSize: 2,
              automaticLayout: true,
              scrollBeyondLastLine: false,
              renderLineHighlight: 'gutter',
              bracketPairColorization: { enabled: true },
              padding: { top: 8 },
            }}
          />
        )}
      </div>

      {/* v0.5+ Blame 提示（点击行号 gutter 触发） */}
      {blameInfo && (
        <div
          className="absolute bottom-12 right-4 z-10 max-w-md px-3 py-2 rounded border shadow-lg text-xs"
          style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-strong)' }}
          onClick={() => setBlameInfo(null)}
        >
          <div className="flex items-center gap-1.5 text-gray-500 mb-1">
            <User size={11} />
            <span className="font-mono text-emerald-400">{blameInfo.hash.slice(0, 7)}</span>
            <span>·</span>
            <span>{blameInfo.author}</span>
            <span>·</span>
            <span>{blameInfo.date.slice(0, 10)}</span>
            <span>·</span>
            <span>第 {blameInfo.line} 行</span>
          </div>
          <div className="text-gray-200 truncate">{blameInfo.message}</div>
          <div className="text-[10px] text-gray-500 mt-1">点击任意处关闭</div>
        </div>
      )}

      {blameLoading && (
        <div className="absolute bottom-12 right-4 z-10 text-xs text-gray-500 flex items-center gap-1">
          <Loader2 size={11} className="animate-spin" />
          {t('fileHistory.blameLoading')}
        </div>
      )}

      {/* v0.5+ 文件历史面板 */}
      <FileHistoryPanel file={selectedFile} open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </div>
  );
}
