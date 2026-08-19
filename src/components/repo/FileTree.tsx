import { useState } from 'react';
import { useRepoStore } from '../../stores/repo';
import { useI18n } from '../../i18n';
import { FolderGit2, Folder, File as FileIcon, ChevronRight, ChevronDown } from 'lucide-react';

export default function FileTree() {
  const { fileTree, selectedFile, selectFileForEdit } = useRepoStore();
  const { t } = useI18n();

  return (
    <div className="h-full border-r border-gray-800 overflow-auto">
      <div className="px-3 py-2 text-xs text-gray-500 border-b border-gray-800 bg-gray-900/50 sticky top-0">
        {t('files.browserTitle')}
      </div>
      <div className="p-1 text-sm">
        {fileTree.map((n) => (
          <TreeNode key={n.path} node={n} depth={0} selectedFile={selectedFile} onSelect={selectFileForEdit} />
        ))}
      </div>
    </div>
  );
}

function TreeNode({
  node,
  depth,
  selectedFile,
  onSelect,
}: {
  node: any;
  depth: number;
  selectedFile: string | null;
  onSelect: (path: string) => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  const isFolder = node.type === 'folder';
  const isSelected = selectedFile === node.path;

  if (isFolder) {
    return (
      <div>
        <div
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1 px-1 py-0.5 hover:bg-gray-800/40 cursor-pointer rounded"
          style={{ paddingLeft: depth * 12 + 4 }}
        >
          {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          <Folder size={12} className="text-amber-400" />
          <span>{node.name}</span>
        </div>
        {open && node.children?.map((c: any) => (
          <TreeNode key={c.path} node={c} depth={depth + 1} selectedFile={selectedFile} onSelect={onSelect} />
        ))}
      </div>
    );
  }

  return (
    <div
      onClick={() => onSelect(node.path)}
      className={`flex items-center gap-1 px-1 py-0.5 cursor-pointer rounded ${
        isSelected ? 'bg-primary-600/20 text-primary-300' : 'hover:bg-gray-800/40'
      }`}
      style={{ paddingLeft: depth * 12 + 20 }}
    >
      <FileIcon size={12} className="text-gray-500" />
      <span className="truncate">{node.name}</span>
    </div>
  );
}
