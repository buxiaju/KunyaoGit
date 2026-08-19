import { useRepoStore } from '../../stores/repo';
import { useSettingsStore } from '../../stores/settings';
import { useI18n } from '../../i18n';
import { Loader2, FileCode, ArrowLeftRight } from 'lucide-react';
import { useState } from 'react';

export default function DiffViewer() {
  const { current, currentDiff, selectedFile } = useRepoStore();
  const { settings } = useSettingsStore();
  const { t } = useI18n();

  if (!current) return null;

  if (!selectedFile) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 text-sm">
        <div className="text-center">
          <FileCode size={32} className="mx-auto mb-2 opacity-50" />
          <div>{t('diff.selectFileHint')}</div>
        </div>
      </div>
    );
  }

  if (!currentDiff) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 text-sm">
        <Loader2 size={20} className="animate-spin mr-2" /> {t('diff.loading')}
      </div>
    );
  }

  if (currentDiff.isBinary) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 text-sm">
        {t('diff.binaryFile')}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-4 py-2 border-b border-gray-800 flex items-center justify-between flex-shrink-0">
        <div className="text-sm">
          <span className="text-primary-400">{selectedFile}</span>
          {currentDiff.oldPath && currentDiff.oldPath !== selectedFile && (
            <span className="text-gray-500 ml-2">← {currentDiff.oldPath}</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>
            +{currentDiff.hunks.reduce((s, h) => s + h.lines.filter((l) => l.type === 'add').length, 0)} / -
            {currentDiff.hunks.reduce((s, h) => s + h.lines.filter((l) => l.type === 'del').length, 0)}
          </span>
        </div>
      </div>
      <div className="flex-1 overflow-auto font-mono text-xs">
        {currentDiff.hunks.map((h, i) => (
          <Hunk key={i} hunk={h} split={settings.diffView === 'split'} />
        ))}
      </div>
    </div>
  );
}

function Hunk({ hunk, split }: { hunk: any; split: boolean }) {
  if (split) {
    return <SplitHunk hunk={hunk} />;
  }
  return (
    <div>
      <div className="px-3 py-0.5 bg-blue-900/30 text-blue-300 text-[11px] sticky top-0">
        @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
      </div>
      {hunk.lines.map((l: any, i: number) => (
        <div
          key={i}
          className={`px-3 whitespace-pre ${
            l.type === 'add' ? 'bg-emerald-900/25 text-emerald-100' :
            l.type === 'del' ? 'bg-red-900/25 text-red-100' :
            'text-gray-300'
          }`}
        >
          <span className="inline-block w-4 text-gray-600 select-none">
            {l.type === 'add' ? '+' : l.type === 'del' ? '-' : ' '}
          </span>
          {l.content || ' '}
        </div>
      ))}
    </div>
  );
}

function SplitHunk({ hunk }: { hunk: any }) {
  // 构造左右两列
  const left: any[] = [];
  const right: any[] = [];
  for (const l of hunk.lines) {
    if (l.type === 'context') {
      left.push({ ...l, side: 'l' });
      right.push({ ...l, side: 'r' });
    } else if (l.type === 'del') {
      left.push({ ...l, side: 'l' });
      right.push({ type: 'empty' });
    } else if (l.type === 'add') {
      left.push({ type: 'empty' });
      right.push({ ...l, side: 'r' });
    }
  }
  return (
    <div>
      <div className="px-3 py-0.5 bg-blue-900/30 text-blue-300 text-[11px] sticky top-0">
        @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
      </div>
      <div className="grid grid-cols-2">
        <div className="border-r border-gray-800">
          {left.map((l, i) => (
            <div
              key={i}
              className={`px-3 whitespace-pre ${
                l.type === 'del' ? 'bg-red-900/25 text-red-100' :
                l.type === 'empty' ? 'bg-gray-800/30' :
                'text-gray-300'
              }`}
            >
              <span className="inline-block w-10 text-gray-600 select-none">
                {l.oldLine || ''}
              </span>
              {l.content || ' '}
            </div>
          ))}
        </div>
        <div>
          {right.map((l, i) => (
            <div
              key={i}
              className={`px-3 whitespace-pre ${
                l.type === 'add' ? 'bg-emerald-900/25 text-emerald-100' :
                l.type === 'empty' ? 'bg-gray-800/30' :
                'text-gray-300'
              }`}
            >
              <span className="inline-block w-10 text-gray-600 select-none">
                {l.newLine || ''}
              </span>
              {l.content || ' '}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
