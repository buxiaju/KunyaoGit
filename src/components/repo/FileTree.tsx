import { useEffect, useRef, useState } from 'react';
import { useRepoStore } from '../../stores/repo';
import { useI18n } from '../../i18n';
import {
  FolderGit2, Folder, File as FileIcon, ChevronRight, ChevronDown,
  FilePlus2, FolderPlus, RefreshCw, Pencil, Trash2, FileCode2,
} from 'lucide-react';
import { toast } from '../common/Toast';

interface MenuState {
  x: number;
  y: number;
  node: any | null; // null = 空白处（仓库根）
}

export default function FileTree() {
  const { current, fileTree, selectedFile, selectFileForEdit, refreshFileTree, createFile, createFolder, deleteNode, renameNode } = useRepoStore();
  const { t } = useI18n();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击外部 / Esc 关闭右键菜单
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('click', close);
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', close);
    };
  }, [menu]);

  if (!current) return null;

  const targetDir = (node: any | null): string => {
    // 文件夹 → 其自身；文件 / 空白 → 所在目录
    if (!node) return '';
    if (node.type === 'folder') return node.path;
    const idx = node.path.lastIndexOf('/');
    return idx > 0 ? node.path.substring(0, idx) : '';
  };

  const promptNewFile = async (dir: string) => {
    const name = prompt(t('files.newFilePrompt'));
    if (!name) return;
    const rel = dir ? `${dir}/${name}` : name;
    const r = await createFile(rel, '');
    if (r.ok) toast.success(t('files.created', { name: rel }));
    else toast.error(t('files.createFailed', { error: r.error || '' }));
  };

  const promptNewFolder = async (dir: string) => {
    const name = prompt(t('files.newFolderPrompt'));
    if (!name) return;
    const rel = dir ? `${dir}/${name}` : name;
    const r = await createFolder(rel);
    if (r.ok) toast.success(t('files.folderCreated', { name: rel }));
    else toast.error(t('files.createFailed', { error: r.error || '' }));
  };

  const promptRename = async (node: any) => {
    const name = prompt(t('files.renamePrompt'), node.name);
    if (!name || name === node.name) return;
    const dir = targetDir(node);
    const newRel = dir ? `${dir}/${name}` : name;
    const r = await renameNode(node.path, newRel);
    if (r.ok) toast.success(t('files.renamed', { name: newRel }));
    else toast.error(t('files.renameFailed', { error: r.error || '' }));
  };

  const confirmDelete = async (node: any) => {
    if (!confirm(t('files.deleteConfirm', { name: node.path }))) return;
    const r = await deleteNode(node.path);
    if (r.ok) toast.success(t('files.deleted', { name: node.path }));
    else toast.error(t('files.deleteFailed', { error: r.error || '' }));
  };

  const openMenu = (e: React.MouseEvent, node: any | null) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, node });
  };

  const menuNode = menu?.node ?? null;
  const isFolderMenu = menuNode?.type === 'folder';

  return (
    <div className="h-full border-r border-gray-800 flex flex-col overflow-hidden">
      {/* 工具栏 */}
      <div className="px-2 py-1.5 border-b border-gray-800 bg-gray-900/50 flex items-center gap-1 sticky top-0">
        <span className="text-xs text-gray-500 flex-1 truncate">{t('files.browserTitle')}</span>
        <button
          onClick={() => promptNewFile('')}
          className="btn-ghost p-1"
          title={t('files.newFile')}
        >
          <FilePlus2 size={13} />
        </button>
        <button
          onClick={() => promptNewFolder('')}
          className="btn-ghost p-1"
          title={t('files.newFolder')}
        >
          <FolderPlus size={13} />
        </button>
        <button
          onClick={() => refreshFileTree()}
          className="btn-ghost p-1"
          title={t('files.refreshTree')}
        >
          <RefreshCw size={12} />
        </button>
      </div>

      {/* 文件树 */}
      <div className="flex-1 overflow-auto p-1 text-sm" onContextMenu={(e) => openMenu(e, null)}>
        {fileTree.length === 0 && (
          <div className="p-4 text-center text-xs text-gray-500">
            <FolderGit2 size={20} className="mx-auto mb-1 opacity-50" />
            <div>{t('files.emptyDir')}</div>
          </div>
        )}
        {fileTree.map((n) => (
          <TreeNode key={n.path} node={n} depth={0} selectedFile={selectedFile} onSelect={selectFileForEdit} onContextMenu={openMenu} />
        ))}
      </div>

      {/* 右键菜单 */}
      {menu && (
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[160px] rounded-md border border-gray-700 bg-gray-900 shadow-xl py-1 text-sm"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {menuNode && menuNode.type === 'file' && (
            <MenuItem icon={<FileCode2 size={13} />} label={t('files.openInEditor')}
              onClick={() => { selectFileForEdit(menuNode.path); setMenu(null); }} />
          )}
          {!menuNode || isFolderMenu ? (
            <>
              <MenuItem icon={<FilePlus2 size={13} />} label={t('files.newFile')}
                onClick={() => { promptNewFile(targetDir(menuNode)); setMenu(null); }} />
              <MenuItem icon={<FolderPlus size={13} />} label={t('files.newFolder')}
                onClick={() => { promptNewFolder(targetDir(menuNode)); setMenu(null); }} />
            </>
          ) : null}
          {menuNode && (
            <>
              <div className="my-1 border-t border-gray-700/60" />
              <MenuItem icon={<Pencil size={13} />} label={t('files.rename')}
                onClick={() => { promptRename(menuNode); setMenu(null); }} />
              <MenuItem icon={<Trash2 size={13} />} label={t('files.delete')} danger
                onClick={() => { confirmDelete(menuNode); setMenu(null); }} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-800 ${danger ? 'text-red-400 hover:text-red-300' : 'text-gray-200'}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function TreeNode({
  node,
  depth,
  selectedFile,
  onSelect,
  onContextMenu,
}: {
  node: any;
  depth: number;
  selectedFile: string | null;
  onSelect: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, node: any) => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  const isFolder = node.type === 'folder';
  const isSelected = selectedFile === node.path;

  if (isFolder) {
    return (
      <div>
        <div
          onClick={() => setOpen(!open)}
          onContextMenu={(e) => onContextMenu(e, node)}
          className="flex items-center gap-1 px-1 py-0.5 hover:bg-gray-800/40 cursor-pointer rounded group"
          style={{ paddingLeft: depth * 12 + 4 }}
          title={node.path}
        >
          {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          <Folder size={12} className="text-amber-400 flex-shrink-0" />
          <span className="truncate flex-1">{node.name}</span>
        </div>
        {open && node.children?.map((c: any) => (
          <TreeNode key={c.path} node={c} depth={depth + 1} selectedFile={selectedFile} onSelect={onSelect} onContextMenu={onContextMenu} />
        ))}
      </div>
    );
  }

  return (
    <div
      onClick={() => onSelect(node.path)}
      onContextMenu={(e) => onContextMenu(e, node)}
      className={`flex items-center gap-1 px-1 py-0.5 cursor-pointer rounded group ${
        isSelected ? 'bg-primary-600/20 text-primary-300' : 'hover:bg-gray-800/40'
      }`}
      style={{ paddingLeft: depth * 12 + 20 }}
      title={node.path}
    >
      <FileIcon size={12} className="text-gray-500 flex-shrink-0" />
      <span className="truncate flex-1">{node.name}</span>
    </div>
  );
}
