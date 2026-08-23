import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRepoStore } from '../stores/repo';
import { useI18n } from '../i18n';
import CommitHistory from '../components/repo/CommitHistory';
import FileTree from '../components/repo/FileTree';
import DiffViewer from '../components/repo/DiffViewer';
import EditorPane from '../components/repo/EditorPane';
import BranchPanel from '../components/repo/BranchPanel';
import ChangesPanel from '../components/repo/ChangesPanel';
import RemotePanel from '../components/repo/RemotePanel';
import { ArrowLeft, RefreshCw, GitBranch, GitPullRequest, Plus, Upload, X, ChevronDown, Github, Globe, Loader2 } from 'lucide-react';
import { toast } from '../components/common/Toast';

type Tab = 'changes' | 'history' | 'branches' | 'remote' | 'files';

export default function RepoPage() {
  const { current, refreshAll, status, branches, refreshFileTree, refreshStatus, remotes } = useRepoStore();
  const { t } = useI18n();
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>('changes');
  const [refreshing, setRefreshing] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pushMenuOpen, setPushMenuOpen] = useState(false);
  const [pushingTo, setPushingTo] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pushMenuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭 Push 下拉
  useEffect(() => {
    if (!pushMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (pushMenuRef.current && !pushMenuRef.current.contains(e.target as Node)) setPushMenuOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [pushMenuOpen]);

  useEffect(() => {
    if (!current) nav('/');
  }, [current, nav]);

  if (!current) return null;

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshAll();
      toast.success(t('repo.refreshed'));
    } finally {
      setRefreshing(false);
    }
  };

  const handleImportFiles = async (files: FileList | File[]) => {
    if (!current) return;
    let imported = 0;
    for (const f of Array.from(files)) {
      // 保留子目录结构（取 relative path）
      // @ts-ignore - webkitRelativePath 非标准
      const rel = f.webkitRelativePath || f.name;
      const target = `${current.path}/${rel}`.replace(/\\/g, '/');
      try {
        const dir = target.substring(0, target.lastIndexOf('/'));
        if (dir && dir !== current.path) {
          await window.gitgui.fs.mkdirp(dir);
        }
        const ab = await f.arrayBuffer();
        const bytes = new Uint8Array(ab);
        await window.gitgui.fs.writeBinary(target, Array.from(bytes));
        await window.gitgui.git.stage(current.path, [rel]);
        imported++;
      } catch (e) {
        toast.error(t('repo.importFailed', { name: f.name, error: (e as Error).message }));
      }
    }
    if (imported > 0) {
      toast.success(t('repo.imported', { count: imported }));
      await refreshStatus();
      await refreshFileTree();
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) {
      handleImportFiles(e.dataTransfer.files);
    }
  };

  const handleFetch = async () => {
    const r = await window.gitgui.git.fetch(current.path);
    if (r.ok) {
      await refreshAll();
      toast.success(t('repo.fetched'));
    } else {
      toast.error(t('repo.fetchFailed', { error: r.error }));
    }
  };

  const handlePull = async () => {
    const r = await window.gitgui.git.pull(current.path);
    if (r.ok) {
      await refreshAll();
      toast.success(t('repo.pullSuccess'));
    } else {
      toast.error(t('repo.pullFailed', { error: r.error }));
    }
  };

  const handlePush = async () => {
    const r = await window.gitgui.git.push(current.path);
    if (r.ok) {
      await refreshAll();
      toast.success(t('repo.pushSuccess'));
    } else {
      toast.error(t('repo.pushFailed', { error: r.error }));
    }
  };

  // 推送到指定 remote（GitHub / Gitee / ...）
  const handlePushTo = async (remote: { name: string; url: string; type: 'github' | 'gitee' | 'other' }) => {
    if (!current) return;
    setPushMenuOpen(false);
    setPushingTo(remote.name);
    try {
      const branch = branches.find((b) => b.current)?.name;
      const r = await window.gitgui.git.push(current.path, {
        remote: remote.name,
        branch,
        setUpstream: true,
      });
      if (r.ok) {
        await refreshAll();
        toast.success(t('repo.pushSuccessTo', { remote: remote.name }));
      } else {
        toast.error(t('repo.pushFailedTo', { remote: remote.name, error: r.error }));
      }
    } finally {
      setPushingTo(null);
    }
  };

  const currentBranch = branches.find((b) => b.current);
  const stagedCount = status.filter((s) => s.staged).length;
  const changedCount = status.length;

  return (
    <div
      className="h-full flex flex-col relative"
      onDragOver={(e) => { e.preventDefault(); if (!dragging) setDragging(true); }}
      onDragLeave={(e) => {
        e.preventDefault();
        // 只在离开整个区域时取消
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={handleDrop}
    >
      {/* 仓库头部 */}
      <div className="px-4 py-2.5 border-b border-gray-800 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => nav('/')} className="btn-ghost p-1" title={t('repo.back')}>
            <ArrowLeft size={16} />
          </button>
          <div className="min-w-0">
            <div className="font-medium truncate">{current.name}</div>
            <div className="text-xs text-gray-500 truncate">{current.path}</div>
          </div>
          {currentBranch && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400 ml-2">
              <GitBranch size={12} />
              {currentBranch.name}
              {currentBranch.ahead !== undefined && currentBranch.ahead > 0 && (
                <span className="text-emerald-400">↑{currentBranch.ahead}</span>
              )}
              {currentBranch.behind !== undefined && currentBranch.behind > 0 && (
                <span className="text-amber-400">↓{currentBranch.behind}</span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => fileInputRef.current?.click()} className="btn-ghost" title={t('repo.importHint')}>
            <Upload size={14} /> {t('repo.import')}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            // @ts-ignore
            webkitdirectory=""
            className="hidden"
            onChange={(e) => {
              if (e.target.files) handleImportFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <button onClick={handleRefresh} disabled={refreshing} className="btn-ghost">
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button onClick={handleFetch} className="btn-ghost">
            <GitPullRequest size={14} /> Fetch
          </button>
          <button onClick={handlePull} className="btn-secondary">{t('repo.pull')}</button>
          {/* Push：主按钮推默认 upstream，下拉选择指定 remote（GitHub / Gitee） */}
          <div className="relative" ref={pushMenuRef}>
            <div className="flex">
              <button onClick={handlePush} className="btn-primary rounded-r-none" title={t('repo.pushHint')}>
                {pushingTo ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                {t('repo.push')}
              </button>
              <button
                onClick={() => setPushMenuOpen(!pushMenuOpen)}
                className="btn-primary rounded-l-none border-l border-primary-700/60 px-1.5"
                title={t('repo.pushToHint')}
              >
                <ChevronDown size={12} />
              </button>
            </div>
            {pushMenuOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 min-w-[220px] rounded-md border border-gray-700 bg-gray-900 shadow-xl py-1">
                <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-gray-500">{t('repo.pushToLabel')}</div>
                {remotes.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-gray-500">{t('repo.noRemoteConfigured')}</div>
                ) : (
                  remotes.map((r) => {
                    const Icon = r.type === 'github' ? Github : r.type === 'gitee' ? Globe : GitBranch;
                    return (
                      <button
                        key={r.name}
                        onClick={() => handlePushTo(r)}
                        disabled={pushingTo !== null}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-800 disabled:opacity-50"
                      >
                        <Icon size={13} className={r.type === 'github' ? 'text-gray-300' : r.type === 'gitee' ? 'text-red-400' : 'text-gray-500'} />
                        <span className="flex-1 truncate">{t('repo.pushToName', { name: r.name })}</span>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tab 栏 */}
      <div className="px-3 py-1.5 border-b border-gray-800 flex items-center gap-1 flex-shrink-0">
        <TabButton active={tab === 'changes'} onClick={() => setTab('changes')}>
          {t('repo.tabChanges')} {changedCount > 0 && <span className="ml-1 px-1.5 rounded bg-primary-600/30 text-primary-300 text-xs">{changedCount}</span>}
        </TabButton>
        <TabButton active={tab === 'history'} onClick={() => setTab('history')}>{t('repo.tabHistory')}</TabButton>
        <TabButton active={tab === 'branches'} onClick={() => setTab('branches')}>{t('repo.tabBranches')}</TabButton>
        <TabButton active={tab === 'remote'} onClick={() => setTab('remote')}>{t('repo.tabRemote')}</TabButton>
        <TabButton active={tab === 'files'} onClick={() => setTab('files')}>{t('repo.tabFiles')}</TabButton>
      </div>

      {/* Tab 内容 */}
      <div className="flex-1 overflow-hidden">
        {tab === 'changes' && <ChangesLayout />}
        {tab === 'history' && <CommitHistory />}
        {tab === 'branches' && <BranchPanel />}
        {tab === 'remote' && <RemotePanel />}
        {tab === 'files' && <FileTreeView />}
      </div>

      {/* 拖拽覆盖层 */}
      {dragging && (
        <div className="absolute inset-0 z-50 bg-primary-900/30 border-2 border-dashed border-primary-400 flex items-center justify-center pointer-events-none">
          <div className="bg-gray-900/90 rounded-lg p-6 text-center">
            <Upload size={40} className="mx-auto mb-2 text-primary-400" />
            <div className="text-lg font-medium text-primary-200">{t('repo.dropRelease')}</div>
            <div className="text-xs text-gray-400 mt-1">{t('repo.dropDesc')}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-sm rounded transition-colors flex items-center ${
        active ? 'bg-gray-700/60 text-white' : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800/60'
      }`}
    >
      {children}
    </button>
  );
}

function ChangesLayout() {
  return (
    <div className="h-full grid grid-cols-[320px_1fr] overflow-hidden">
      <ChangesPanel />
      <DiffViewer />
    </div>
  );
}

function FileTreeView() {
  return (
    <div className="h-full grid grid-cols-[280px_1fr] overflow-hidden">
      <FileTree />
      <EditorPane />
    </div>
  );
}
