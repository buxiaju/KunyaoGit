import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSettingsStore } from '../stores/settings';
import { useRepoStore } from '../stores/repo';
import { Github, Globe, Star, GitFork, ExternalLink, GitBranch, Lock, Unlock, AlertCircle, MessageSquare, GitPullRequest, Loader2, Plus, Trash2, X, Search } from 'lucide-react';
import { toast } from '../components/common/Toast';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { useI18n } from '../i18n';

export default function RemotePage() {
  const { t } = useI18n();
  const { platform } = useParams<{ platform: 'github' | 'gitee' }>();
  const { settings } = useSettingsStore();
  const openRepo = useRepoStore((s) => s.openRepo);
  const nav = useNavigate();
  const [repos, setRepos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [tab, setTab] = useState<'repos' | 'prs' | 'issues'>('repos');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPrivate, setNewPrivate] = useState(false);
  const [newAutoInit, setNewAutoInit] = useState(true);

  const auth = platform === 'github' ? settings.auth?.github : settings.auth?.gitee;
  const Icon = platform === 'github' ? Github : Globe;
  const name = platform === 'github' ? 'GitHub' : 'Gitee';

  useEffect(() => {
    if (auth) load();
  }, [auth, tab]);

  // 搜索仓库：输入防抖 300ms 后调用云端 Search API；清空恢复"我的仓库"列表
  const searchQueryRef = useRef('');
  searchQueryRef.current = searchQuery;
  useEffect(() => {
    if (!auth || tab !== 'repos') return;
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      const r = platform === 'github'
        ? await window.gitgui.github.searchRepos(q)
        : await window.gitgui.gitee.searchRepos(q);
      // 竞态保护：期间 query 已变化则丢弃本次结果
      if (searchQueryRef.current.trim() !== q) return;
      setSearching(false);
      if (r.ok) setSearchResults(r.data as any[]);
      else toast.error(t('remote.searchFailed', { error: r.error }));
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, auth, platform, tab]);

  const load = async () => {
    if (!auth) return;
    setLoading(true);
    try {
      if (tab === 'repos') {
        const r = platform === 'github'
          ? await window.gitgui.github.listRepos({ visibility: 'all' })
          : await window.gitgui.gitee.listRepos({ visibility: 'all' });
        if (r.ok) setRepos(r.data as any[]);
        else toast.error(r.error);
      }
    } finally {
      setLoading(false);
    }
  };

  const clone = async (cloneUrl: string) => {
    const r = await window.gitgui.repo.clone(cloneUrl, settings.defaultCloneDir || '');
    if (r.ok) {
      toast.success(t('remote.cloneSuccess', { path: r.data.path }));
      await openRepo(r.data.path);
      nav('/repo');
    } else {
      toast.error(t('remote.cloneFailed', { error: r.error }));
    }
  };

  const createRepo = async () => {
    if (!newName.trim()) {
      toast.warn(t('remote.nameRequired'));
      return;
    }
    if (!/^[A-Za-z0-9._-]+$/.test(newName.trim())) {
      toast.warn(t('remote.nameInvalid'));
      return;
    }
    setCreating(true);
    try {
      const params = {
        name: newName.trim(),
        description: newDesc.trim() || undefined,
        private: newPrivate,
        autoInit: newAutoInit,
      };
      const r = platform === 'github'
        ? await window.gitgui.github.createRepo(params)
        : await window.gitgui.gitee.createRepo(params);
      if (r.ok) {
        toast.success(t('remote.createSuccess', { name: newName }));
        setShowCreate(false);
        setNewName('');
        setNewDesc('');
        setNewPrivate(false);
        setNewAutoInit(true);
        await load();
      } else {
        toast.error(t('remote.createFailed', { error: r.error }));
      }
    } finally {
      setCreating(false);
    }
  };

  const deleteRepo = async (owner: string, repo: string) => {
    const displayName = `${owner}/${repo}`;
    if (!confirm(t('remote.deleteConfirm1', { name: displayName }))) return;
    if (!confirm(t('remote.deleteConfirm2', { name: displayName }))) return;
    const r = platform === 'github'
      ? await window.gitgui.github.deleteRepo(owner, repo)
      : await window.gitgui.gitee.deleteRepo(owner, repo);
    if (r.ok) {
      toast.success(t('remote.deleteSuccess', { name: displayName }));
      await load();
    } else {
      toast.error(t('remote.deleteFailed', { error: r.error }));
    }
  };

  if (!auth) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-md">
          <Icon size={40} className="mx-auto mb-3 opacity-50" />
          <div className="text-lg font-medium mb-1">{t('remote.notConfigured', { platform: name })}</div>
          <div className="text-sm text-gray-500 mb-4">{t('remote.notConfiguredHint', { platform: name })}</div>
          <button onClick={() => nav('/settings')} className="btn-primary">
            {t('remote.goToSettings')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
        <Icon size={18} />
        <span className="font-semibold">{name}</span>
        <span className="text-xs text-gray-500">@{auth.user}</span>
        {/* 搜索仓库（云端 Search API） */}
        <div className="flex-1 flex justify-center px-2">
          <div className="relative w-full max-w-md">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              className="input pl-8 pr-7 text-xs"
              placeholder={t('remote.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                title={t('common.cancel')}
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary text-xs">
          <Plus size={12} /> {t('remote.newRepo')}
        </button>
        <button onClick={load} className="btn-ghost text-xs">
          {t('remote.refresh')}
        </button>
      </div>

      {showCreate && (
        <div className="border-b border-gray-800 bg-gray-900/50 p-3 space-y-2">
          <div className="text-sm font-medium">{t('remote.createTitle', { platform: name })}</div>
          <div className="grid grid-cols-2 gap-2">
            <input
              className="input"
              placeholder={t('remote.namePlaceholder')}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !creating && createRepo()}
              autoFocus
            />
            <input
              className="input"
              placeholder={t('remote.descPlaceholder')}
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-4 text-sm">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={newPrivate} onChange={(e) => setNewPrivate(e.target.checked)} />
              {t('remote.privateRepo')}
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={newAutoInit} onChange={(e) => setNewAutoInit(e.target.checked)} />
              {t('remote.initReadme')}
            </label>
            <div className="flex-1" />
            <button onClick={() => setShowCreate(false)} className="btn-ghost text-xs">{t('remote.cancel')}</button>
            <button onClick={createRepo} disabled={creating} className="btn-primary text-xs">
              {creating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              {t('remote.create')}
            </button>
          </div>
        </div>
      )}

      <div className="px-3 py-1.5 border-b border-gray-800 flex items-center gap-1">
        <button onClick={() => setTab('repos')} className={tab === 'repos' ? 'tab-active tab' : 'tab'}>
          {t('remote.tabRepos')}
        </button>
        <button onClick={() => setTab('prs')} className={tab === 'prs' ? 'tab-active tab' : 'tab'}>
          {t('remote.tabPrs')}
        </button>
        <button onClick={() => setTab('issues')} className={tab === 'issues' ? 'tab-active tab' : 'tab'}>
          {t('remote.tabIssues')}
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {loading || searching ? (
          <div className="flex items-center justify-center text-gray-500 text-sm py-10">
            <Loader2 size={16} className="animate-spin mr-2" /> {t('remote.loading')}
          </div>
        ) : tab === 'repos' ? (
          <div className="max-w-5xl">
            {searchQuery.trim() && (
              <div className="text-xs text-gray-500 mb-3 flex items-center gap-1.5">
                <Search size={11} />
                {t('remote.searchResultFor', { query: searchQuery.trim() })}
                <span className="text-gray-600">
                  {t('remote.resultCount', { count: searchResults?.length ?? 0 })}
                </span>
              </div>
            )}
            {(searchResults ?? repos).length === 0 ? (
              <div className="text-center text-gray-500 text-sm py-10">
                {searchQuery.trim() ? t('remote.searchEmpty') : t('remote.empty')}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(searchResults ?? repos).map((r) => (
                  <RepoCard
                    key={r.id}
                    repo={r}
                    platform={platform!}
                    currentUser={auth?.user}
                    onClone={() => clone(r.clone_url)}
                    onOpen={() => {
                      const fullName = r.full_name || r.name || '';
                      const [owner, repoName] = fullName.split('/');
                      if (owner && repoName) nav(`/remote/${platform}/${owner}/${repoName}`);
                    }}
                    onDelete={() => {
                      const fullName = r.full_name || r.name || '';
                      const [owner, repoName] = fullName.split('/');
                      if (owner && repoName) deleteRepo(owner, repoName);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        ) : tab === 'prs' ? (
          <div className="text-center text-gray-500 text-sm py-10">{t('remote.viewPrsHint')}</div>
        ) : (
          <div className="text-center text-gray-500 text-sm py-10">{t('remote.viewIssuesHint')}</div>
        )}
      </div>
    </div>
  );
}

function RepoCard({ repo, platform, onClone, onOpen, onDelete, currentUser }: { repo: any; platform: string; onClone: () => void; onOpen: () => void; onDelete?: () => void; currentUser?: string }) {
  const { t } = useI18n();
  const fullName = repo.full_name || repo.name || '';
  const ownerRaw = repo.owner?.login || fullName.split('/')[0] || '';
  const owner = ownerRaw.toLowerCase();
  const isMine = currentUser && owner === currentUser.toLowerCase();
  // 默认对所有仓库都显示删除按钮（fork/协作者仓库 API 会拒绝，错误信息更直接）
  const showDelete = !!onDelete;
  return (
    <div className="panel p-3 hover:border-primary-500/40">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onOpen}>
          <div className="flex items-center gap-1.5">
            {repo.private ? <Lock size={12} className="text-amber-400" /> : <Unlock size={12} className="text-gray-500" />}
            <span className="font-medium text-sm text-primary-400 hover:underline truncate">
              {repo.full_name || repo.name}
            </span>
            <ExternalLink
              size={11}
              className="text-gray-500 cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                window.gitgui.app.openExternal(repo.html_url);
              }}
            />
          </div>
          {repo.description && (
            <div className="text-xs text-gray-400 mt-1 line-clamp-2">{repo.description}</div>
          )}
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
            {repo.language && <span>{repo.language}</span>}
            <span className="flex items-center gap-0.5"><Star size={10} /> {repo.stargazers_count}</span>
            <span className="flex items-center gap-0.5"><GitFork size={10} /> {repo.forks_count}</span>
            {repo.default_branch && (
              <span className="flex items-center gap-0.5"><GitBranch size={10} /> {repo.default_branch}</span>
            )}
            {repo.updated_at && (
              <span>{formatDistanceToNow(new Date(repo.updated_at), { locale: zhCN, addSuffix: true })}</span>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1.5 ml-2">
          <button onClick={onOpen} className="btn-secondary text-xs">{t('remote.view')}</button>
          <button onClick={onClone} className="btn-secondary text-xs">{t('remote.clone')}</button>
          {showDelete && (
            <button onClick={onDelete} className="btn-ghost text-xs text-red-400 hover:bg-red-900/30" title={isMine ? t('remote.deleteMineHint') : t('remote.deleteOtherHint')}>
              <Trash2 size={11} /> {t('remote.delete')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
