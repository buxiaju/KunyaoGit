import { useEffect, useRef, useState } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { useRepoStore } from '../../stores/repo';
import { useI18n } from '../../i18n';
import { Save, Loader2, FileCode, RefreshCw } from 'lucide-react';
import { toast } from '../common/Toast';

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
  const { current, selectedFile, fileContent, fileDirty, fileLoading, loadFile, saveFile, closeFile } = useRepoStore();
  const { t } = useI18n();
  const editorRef = useRef<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (selectedFile && current) {
      loadFile(selectedFile);
    }
  }, [selectedFile, current, loadFile]);

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

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor;
  };

  const handleChange = (value: string | undefined) => {
    if (value == null) return;
    useRepoStore.getState().setFileContent(value);
  };

  const doSave = async () => {
    if (!fileDirty || !selectedFile) return;
    setSaving(true);
    try {
      const r = await saveFile(selectedFile);
      if (r.ok) toast.success(t('files.saved'));
      else toast.error(t('files.saveFailed', { error: r.error || '' }));
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
            theme="vs-dark"
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
    </div>
  );
}
