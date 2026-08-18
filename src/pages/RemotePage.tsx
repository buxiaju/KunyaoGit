import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSettingsStore } from '../stores/settings';
import { useRepoStore } from '../stores/repo';
import { Github, Globe, Star, GitFork, ExternalLink, GitBranch, Lock, Unlock, AlertCircle, MessageSquare, GitPullRequest, Loader2, Plus, Trash2, X } from 'lucide-react';
import { toast } from '../components/common/Toast';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';

export default function RemotePage() {
  const { platform } = useParams<{ platform: 'github' | 'gitee' }>();
  const { settings } = useSettingsStore();
  const openRepo = useRepoStore((s) => s.openRepo);
  const nav = useNavigate();
  const [repos, setRepos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
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
      toast.success(`已克隆：${r.data.path}`);
      await openRepo(r.data.path);
      nav('/');
    } else {
      toast.error('克隆失败：' + r.error);
    }
  };

  const createRepo = async () => {
    if (!newName.trim()) {
      toast.warn('请输入仓库名');
      return;
    }
    if (!/^[A-Za-z0-9._-]+$/.test(newName.trim())) {
      toast.warn('仓库名只能包含字母、数字、._-');
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
        toast.success(`已创建仓库：${newName}`);
        setShowCreate(false);
        setNewName('');
        setNewDesc('');
        setNewPrivate(false);
        setNewAutoInit(true);
        await load();
      } else {
        toast.error('创建失败：' + r.error);
      }
    } finally {
      setCreating(false);
    }
  };

  const deleteRepo = async (owner: string, repo: string) => {
    const displayName = `${owner}/${repo}`;
    if (!confirm(`⚠️ 确定要永久删除远程仓库 ${displayName} 吗？\n\n此操作不可恢复！`)) return;
    if (!confirm(`再次确认：删除 ${displayName} 后无法恢复，确认继续？`)) return;
    const r = platform === 'github'
      ? await window.gitgui.github.deleteRepo(owner, repo)
      : await window.gitgui.gitee.deleteRepo(owner, repo);
    if (r.ok) {
      toast.success(`已删除：${displayName}`);
      await load();
    } else {
      toast.error('删除失败：' + r.error);
    }
  };

  if (!auth) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-md">
          <Icon size={40} className="mx-auto mb-3 opacity-50" />
          <div className="text-lg font-medium mb-1">未配置 {name} 认证</div>
          <div className="text-sm text-gray-500 mb-4">请到【设置】页面添加 {name} 访问令牌</div>
          <button onClick={() => nav('/settings')} className="btn-primary">
            前往设置
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
        <div className="flex-1" />
        <button onClick={() => setShowCreate(true)} className="btn-primary text-xs">
          <Plus size={12} /> 新建仓库
        </button>
        <button onClick={load} className="btn-ghost text-xs">
          刷新
        </button>
      </div>

      {showCreate && (
        <div className="border-b border-gray-800 bg-gray-900/50 p-3 space-y-2">
          <div className="text-sm font-medium">在 {name} 上创建新仓库</div>
          <div className="grid grid-cols-2 gap-2">
            <input
              className="input"
              placeholder="仓库名（英文、数字、._-）"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !creating && createRepo()}
              autoFocus
            />
            <input
              className="input"
              placeholder="描述（可选）"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-4 text-sm">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={newPrivate} onChange={(e) => setNewPrivate(e.target.checked)} />
              私有仓库
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={newAutoInit} onChange={(e) => setNewAutoInit(e.target.checked)} />
              初始化 README
            </label>
            <div className="flex-1" />
            <button onClick={() => setShowCreate(false)} className="btn-ghost text-xs">取消</button>
            <button onClick={createRepo} disabled={creating} className="btn-primary text-xs">
              {creating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              创建
            </button>
          </div>
        </div>
      )}

      <div className="px-3 py-1.5 border-b border-gray-800 flex items-center gap-1">
        <button onClick={() => setTab('repos')} className={tab === 'repos' ? 'tab-active tab' : 'tab'}>
          仓库
        </button>
        <button onClick={() => setTab('prs')} className={tab === 'prs' ? 'tab-active tab' : 'tab'}>
          PR
        </button>
        <button onClick={() => setTab('issues')} className={tab === 'issues' ? 'tab-active tab' : 'tab'}>
          Issue
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center text-gray-500 text-sm py-10">
            <Loader2 size={16} className="animate-spin mr-2" /> 加载中...
          </div>
        ) : tab === 'repos' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-5xl">
            {repos.map((r) => (
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
        ) : tab === 'prs' ? (
          <div className="text-center text-gray-500 text-sm py-10">点击仓库卡片查看 PR</div>
        ) : (
          <div className="text-center text-gray-500 text-sm py-10">点击仓库卡片查看 Issue</div>
        )}
      </div>
    </div>
  );
}

function RepoCard({ repo, platform, onClone, onOpen, onDelete, currentUser }: { repo: any; platform: string; onClone: () => void; onOpen: () => void; onDelete?: () => void; currentUser?: string }) {
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
          <button onClick={onOpen} className="btn-secondary text-xs">查看</button>
          <button onClick={onClone} className="btn-secondary text-xs">克隆</button>
          {showDelete && (
            <button onClick={onDelete} className="btn-ghost text-xs text-red-400 hover:bg-red-900/30" title={isMine ? '删除你的仓库' : `尝试删除（如果不是你的会报错）`}>
              <Trash2 size={11} /> 删除
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
