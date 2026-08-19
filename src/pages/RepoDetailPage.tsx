import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSettingsStore } from '../stores/settings';
import { useRepoStore } from '../stores/repo';
import { useI18n } from '../i18n';
import { Github, Globe, ArrowLeft, GitPullRequest, MessageSquare, ExternalLink, Lock, Unlock, RefreshCw, Loader2, GitMerge, GitBranch, User, Calendar, Tag, Folder, File as FileIcon, FolderGit2, Save, Plus, Trash2, Edit2, ChevronRight, Upload, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { toast } from '../components/common/Toast';
import Editor from '@monaco-editor/react';
import type { PullRequestInfo, IssueInfo, RemoteFile, RemoteFileContent } from '../../shared/types';

type Tab = 'prs' | 'issues' | 'files';

export default function RepoDetailPage() {
  const { platform, owner, repo } = useParams<{ platform: 'github' | 'gitee'; owner: string; repo: string }>();
  const { settings } = useSettingsStore();
  const openRepo = useRepoStore((s) => s.openRepo);
  const { t } = useI18n();
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>('prs');
  const [prs, setPrs] = useState<PullRequestInfo[]>([]);
  const [issues, setIssues] = useState<IssueInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'open' | 'closed' | 'all'>('open');

  const Icon = platform === 'github' ? Github : Globe;
  const name = platform === 'github' ? 'GitHub' : 'Gitee';
  const auth = platform === 'github' ? settings.auth?.github : settings.auth?.gitee;

  useEffect(() => {
    if (auth) load();
  }, [auth, tab, filter]);

  const load = async () => {
    if (!auth || !owner || !repo) return;
    setLoading(true);
    try {
      if (tab === 'prs') {
        const r = platform === 'github'
          ? await window.gitgui.github.listPRs(owner, repo, filter)
          : await window.gitgui.gitee.listPRs(owner, repo, filter);
        if (r.ok) setPrs(r.data);
        else toast.error(r.error);
      } else {
        const r = platform === 'github'
          ? await window.gitgui.github.listIssues(owner, repo, filter)
          : await window.gitgui.gitee.listIssues(owner, repo, filter);
        if (r.ok) setIssues(r.data);
        else toast.error(r.error);
      }
    } finally {
      setLoading(false);
    }
  };

  const cloneAndOpen = async () => {
    const url = platform === 'github' ? `https://github.com/${owner}/${repo}.git` : `https://gitee.com/${owner}/${repo}.git`;
    const r = await window.gitgui.repo.clone(url, settings.defaultCloneDir || '');
    if (r.ok) {
      toast.success(t('repoDetail.cloneSuccess', { path: r.data.path }));
      await openRepo(r.data.path);
      nav('/');
    } else {
      toast.error(t('repoDetail.cloneFailed', { error: r.error }));
    }
  };

  if (!auth) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 text-sm">
        {t('repoDetail.configHint', { platform: name })}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2 mb-1">
          <button onClick={() => nav(`/remote/${platform}`)} className="btn-ghost p-1" title={t('repoDetail.back')}>
            <ArrowLeft size={16} />
          </button>
          <Icon size={16} />
          <span className="text-sm text-gray-400">{name}</span>
          <span className="text-sm text-gray-600">/</span>
          <span className="font-medium">{owner}</span>
          <span className="text-sm text-gray-600">/</span>
          <span className="font-semibold">{repo}</span>
          <div className="flex-1" />
          <button onClick={load} className="btn-ghost text-xs" title={t('repoDetail.refresh')}>
            <RefreshCw size={13} />
          </button>
          <a
            onClick={(e) => {
              e.preventDefault();
              const url = platform === 'github' ? `https://github.com/${owner}/${repo}` : `https://gitee.com/${owner}/${repo}`;
              window.gitgui.app.openExternal(url);
            }}
            href="#"
            className="btn-ghost text-xs"
          >
            <ExternalLink size={13} /> {t('repoDetail.openInBrowser')}
          </a>
          <button onClick={cloneAndOpen} className="btn-primary text-xs">
            {t('repoDetail.cloneTo')}
          </button>
        </div>
      </div>

      {/* Tabs + filter */}
      <div className="px-3 py-1.5 border-b border-gray-800 flex items-center gap-1">
        <button
          onClick={() => setTab('prs')}
          className={tab === 'prs' ? 'tab-active tab flex items-center gap-1' : 'tab flex items-center gap-1'}
        >
          <GitPullRequest size={13} /> PR {prs.length > 0 && <span className="text-xs text-gray-500">({prs.length})</span>}
        </button>
        <button
          onClick={() => setTab('issues')}
          className={tab === 'issues' ? 'tab-active tab flex items-center gap-1' : 'tab flex items-center gap-1'}
        >
          <MessageSquare size={13} /> Issue {issues.length > 0 && <span className="text-xs text-gray-500">({issues.length})</span>}
        </button>
        <button
          onClick={() => setTab('files')}
          className={tab === 'files' ? 'tab-active tab flex items-center gap-1' : 'tab flex items-center gap-1'}
        >
          <FolderGit2 size={13} /> {t('repoDetail.files')}
        </button>
        <div className="flex-1" />
        {tab !== 'files' && (
          <div className="flex items-center gap-0.5 text-xs">
            {(['open', 'closed', 'all'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2 py-0.5 rounded ${
                  filter === f ? 'bg-gray-700/60 text-white' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {f === 'open' ? t('repoDetail.open') : f === 'closed' ? t('repoDetail.closed') : t('repoDetail.all')}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto p-3">
        {loading ? (
          <div className="text-center py-10 text-gray-500 text-sm">
            <Loader2 size={16} className="animate-spin inline mr-2" />{t('repoDetail.loading')}
          </div>
        ) : tab === 'prs' ? (
          <PRList prs={prs} platform={platform!} owner={owner!} repo={repo!} />
        ) : tab === 'issues' ? (
          <IssueList issues={issues} platform={platform!} />
        ) : (
          <RemoteFileBrowser platform={platform!} owner={owner!} repo={repo!} />
        )}
      </div>
    </div>
  );
}

function PRList({ prs, platform, owner, repo }: { prs: PullRequestInfo[]; platform: string; owner: string; repo: string }) {
  const { t } = useI18n();
  if (prs.length === 0) {
    return <div className="text-center text-gray-500 text-sm py-10">{t('repoDetail.noPrs')}</div>;
  }
  return (
    <div className="max-w-4xl mx-auto space-y-2">
      {prs.map((pr) => (
        <div
          key={pr.number}
          className="panel p-3 hover:border-primary-500/40 cursor-pointer"
          onClick={() => {
            const url = platform === 'github' ? `https://github.com/${owner}/${repo}/pull/${pr.number}` : `https://gitee.com/${owner}/${repo}/pulls/${pr.number}`;
            window.gitgui.app.openExternal(url);
          }}
        >
          <div className="flex items-start gap-2">
            <div className="mt-0.5">
              {pr.state === 'merged' ? (
                <GitMerge size={16} className="text-purple-400" />
              ) : pr.state === 'open' ? (
                <GitPullRequest size={16} className="text-emerald-400" />
              ) : (
                <GitPullRequest size={16} className="text-red-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">{pr.title}</div>
              <div className="text-xs text-gray-500 mt-1 flex items-center gap-3 flex-wrap">
                <span>#{pr.number}</span>
                <span className="flex items-center gap-1">
                  <User size={10} /> {pr.author}
                </span>
                <span className="flex items-center gap-1">
                  <GitBranch size={10} /> {pr.head} → {pr.base}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar size={10} /> {formatDistanceToNow(new Date(pr.updatedAt), { locale: zhCN, addSuffix: true })}
                </span>
                {pr.state === 'merged' && <span className="text-purple-400">{t('repoDetail.merged')}</span>}
              </div>
            </div>
            <ExternalLink size={12} className="text-gray-500 mt-1 flex-shrink-0" />
          </div>
        </div>
      ))}
    </div>
  );
}

function IssueList({ issues, platform }: { issues: IssueInfo[]; platform: string }) {
  const { t } = useI18n();
  if (issues.length === 0) {
    return <div className="text-center text-gray-500 text-sm py-10">{t('repoDetail.noIssues')}</div>;
  }
  return (
    <div className="max-w-4xl mx-auto space-y-2">
      {issues.map((issue) => (
        <div
          key={issue.number}
          className="panel p-3 hover:border-primary-500/40 cursor-pointer"
          onClick={() => {
            const url = platform === 'github' ? `https://github.com/issues/${issue.number}` : `https://gitee.com/issues/${issue.number}`;
            window.gitgui.app.openExternal(issue.url || url);
          }}
        >
          <div className="flex items-start gap-2">
            <MessageSquare size={14} className={issue.state === 'open' ? 'text-emerald-400 mt-0.5' : 'text-gray-500 mt-0.5'} />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">{issue.title}</div>
              <div className="text-xs text-gray-500 mt-1 flex items-center gap-3 flex-wrap">
                <span>#{issue.number}</span>
                <span className="flex items-center gap-1">
                  <User size={10} /> {issue.author}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar size={10} /> {formatDistanceToNow(new Date(issue.createdAt), { locale: zhCN, addSuffix: true })}
                </span>
                {issue.labels?.map((l) => (
                  <span key={l} className="px-1.5 py-0.5 bg-gray-700/50 text-gray-300 rounded text-[10px]">
                    {l}
                  </span>
                ))}
              </div>
            </div>
            <ExternalLink size={12} className="text-gray-500 mt-1 flex-shrink-0" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ===== 远程文件浏览器 =====

function detectLang(path: string): string {
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

function RemoteFileBrowser({ platform, owner, repo }: { platform: 'github' | 'gitee'; owner: string; repo: string }) {
  const { t } = useI18n();
  const [cwd, setCwd] = useState('');
  const [files, setFiles] = useState<RemoteFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<RemoteFile | null>(null);
  const [content, setContent] = useState<RemoteFileContent | null>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [commitMsg, setCommitMsg] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  const list = async (path: string) => {
    setLoading(true);
    try {
      const r = platform === 'github'
        ? await window.gitgui.github.contentsList(owner, repo, path)
        : await window.gitgui.gitee.contentsList(owner, repo, path);
      if (r.ok) {
        setFiles(r.data);
        setCwd(path);
        setSelected(null);
        setContent(null);
        setReadError(null);
      } else {
        toast.error(r.error);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    list('');
  }, [owner, repo]);

  const open = async (file: RemoteFile) => {
    if (file.type === 'dir') {
      list(file.path);
      return;
    }
    console.log('[open]', file.path);
    setSelected(file);
    setEditing(false);
    setReadError(null);
    setReading(true);
    // 注意：不要在 await 前 setContent(null)，否则可能闪一下
    let result: any = null;
    let errMsg: string | null = null;
    try {
      const r = platform === 'github'
        ? await window.gitgui.github.contentsRead(owner, repo, file.path)
        : await window.gitgui.gitee.contentsRead(owner, repo, file.path);
      console.log('[open] result', r.ok, r.ok ? `contentLen=${r.data.content.length} isBinary=${r.data.isBinary}` : r.error);
      if (r.ok) {
        result = r.data;
      } else {
        errMsg = r.error;
      }
    } catch (e) {
      errMsg = (e as Error).message;
    }
    // 一次性原子更新
    if (errMsg) {
      setContent(null);
      setReadError(errMsg);
      setReading(false);
      toast.error(t('repoDetail.readFailedToast', { error: errMsg }));
    } else {
      setContent(result);
      setEditedContent(result.content);
      setReading(false);
    }
  };

  const save = async () => {
    if (!selected || !content) return;
    if (!commitMsg.trim()) {
      toast.warn(t('repoDetail.commitMsgRequired'));
      return;
    }
    setBusy(true);
    try {
      const params = {
        owner, repo,
        path: selected.path,
        content: editedContent,
        message: commitMsg.trim() + (content.sha ? ' (update)' : ' (create)'),
        sha: content.sha,
      };
      const r = platform === 'github'
        ? await window.gitgui.github.contentsWrite(params)
        : await window.gitgui.gitee.contentsWrite(params);
      if (r.ok) {
        toast.success(t('repoDetail.savedToRemote'));
        setEditing(false);
        setContent({ ...content, content: editedContent, sha: r.data.sha });
        setCommitMsg('');
        await list(cwd);
      } else {
        toast.error(t('repoDetail.saveFailed', { error: r.error }));
      }
    } finally {
      setBusy(false);
    }
  };

  const createNew = async () => {
    if (!newName.trim()) return;
    const path = (cwd ? cwd + '/' : '') + newName.trim();
    setBusy(true);
    try {
      const params = {
        owner, repo, path,
        content: '',
        message: 'Create ' + newName.trim(),
      };
      const r = platform === 'github'
        ? await window.gitgui.github.contentsWrite(params)
        : await window.gitgui.gitee.contentsWrite(params);
      if (r.ok) {
        toast.success(t('repoDetail.created'));
        setShowNew(false);
        setNewName('');
        await list(cwd);
        // 自动打开新文件
        setTimeout(() => open({ name: newName.trim(), path, type: 'file', size: 0, sha: r.data.sha, url: '' }), 200);
      } else {
        toast.error(t('repoDetail.createFailed', { error: r.error }));
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!selected || !content) return;
    if (!confirm(t('repoDetail.deleteConfirm', { path: selected.path }))) return;
    if (!commitMsg.trim()) {
      toast.warn(t('repoDetail.commitMsgRequired'));
      return;
    }
    setBusy(true);
    try {
      const params = {
        owner, repo,
        path: selected.path,
        sha: content.sha,
        message: commitMsg.trim() + ' (delete)',
      };
      const r = platform === 'github'
        ? await window.gitgui.github.contentsDelete(params)
        : await window.gitgui.gitee.contentsDelete(params);
      if (r.ok) {
        toast.success(t('repoDetail.deleted'));
        setSelected(null);
        setContent(null);
        setCommitMsg('');
        await list(cwd);
      } else {
        toast.error(t('repoDetail.deleteFailed', { error: r.error }));
      }
    } finally {
      setBusy(false);
    }
  };

  const goUp = () => {
    if (!cwd) return;
    const parts = cwd.split('/');
    parts.pop();
    list(parts.join('/'));
  };

  const parts = cwd ? cwd.split('/') : [];

  return (
    <div className="grid grid-cols-[320px_1fr] gap-3 h-full">
      {/* 文件列表 */}
      <div className="panel flex flex-col overflow-hidden">
        <div className="px-3 py-2 border-b border-gray-800 flex items-center justify-between text-sm">
          <div className="flex items-center gap-1 text-xs text-gray-400 min-w-0 flex-1">
            <button onClick={() => list('')} className="hover:text-gray-200">{t('repoDetail.root')}</button>
            {parts.map((p, i) => (
              <span key={i} className="flex items-center gap-1">
                <ChevronRight size={10} />
                <button onClick={() => list(parts.slice(0, i + 1).join('/'))} className="hover:text-gray-200">{p}</button>
              </span>
            ))}
          </div>
          <button
            onClick={() => setShowNew(true)}
            className="btn-ghost p-1"
            title={t('repoDetail.newFile')}
          >
            <Plus size={13} />
          </button>
        </div>

        {showNew && (
          <div className="px-3 py-2 border-b border-gray-800 flex items-center gap-1.5 bg-gray-900/40">
            <input
              className="input flex-1 text-xs"
              placeholder={t('repoDetail.newFilePlaceholder')}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createNew()}
              autoFocus
            />
            <button onClick={createNew} disabled={busy} className="btn-primary text-xs">{t('repoDetail.create')}</button>
            <button onClick={() => { setShowNew(false); setNewName(''); }} className="btn-ghost p-1"><X size={12} /></button>
          </div>
        )}

        <div className="flex-1 overflow-auto p-1 text-sm">
          {loading ? (
            <div className="p-4 text-center text-gray-500 text-xs">
              <Loader2 size={14} className="animate-spin inline mr-1" />{t('repoDetail.loading')}
            </div>
          ) : files.length === 0 ? (
            <div className="p-4 text-center text-gray-500 text-xs">{t('repoDetail.emptyDir')}</div>
          ) : (
            <>
              {cwd && (
                <div onClick={goUp} className="flex items-center gap-1.5 px-2 py-1 hover:bg-gray-800/40 cursor-pointer rounded text-gray-400">
                  <Folder size={12} /> ..
                </div>
              )}
              {files
                .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1))
                .map((f) => (
                  <div
                    key={f.path}
                    onClick={() => open(f)}
                    className={`flex items-center gap-1.5 px-2 py-1 cursor-pointer rounded ${
                      selected?.path === f.path ? 'bg-primary-600/20 text-primary-200' : 'hover:bg-gray-800/40'
                    }`}
                  >
                    {f.type === 'dir' ? <Folder size={12} className="text-amber-400" /> : <FileIcon size={12} className="text-gray-500" />}
                    <span className="flex-1 truncate">{f.name}</span>
                    {f.type === 'file' && f.size > 0 && <span className="text-[10px] text-gray-600">{formatSize(f.size)}</span>}
                  </div>
                ))}
            </>
          )}
        </div>
      </div>

      {/* 文件内容 / 编辑器 */}
      <div className="panel flex flex-col overflow-hidden">
        {!selected ? (
          <div className="h-full flex items-center justify-center text-gray-500 text-sm">
            <div className="text-center">
              <FolderGit2 size={32} className="mx-auto mb-2 opacity-50" />
              <div>{t('repoDetail.selectFileHint')}</div>
            </div>
          </div>
        ) : content?.isBinary ? (
          <div className="h-full flex items-center justify-center text-gray-500 text-sm">{t('repoDetail.binaryNoEdit')}</div>
        ) : readError ? (
          <div className="h-full flex items-center justify-center text-red-400 text-sm px-6 text-center">
            <div>
              <div className="mb-1 font-medium">{t('repoDetail.readFailedTitle')}</div>
              <div className="text-xs text-red-300/80">{readError}</div>
            </div>
          </div>
        ) : reading ? (
          <div className="h-full flex items-center justify-center text-gray-500 text-sm">
            <Loader2 size={14} className="animate-spin mr-2" /> {t('repoDetail.loading')}
          </div>
        ) : !content ? (
          <div className="h-full flex items-center justify-center text-gray-500 text-sm">{t('repoDetail.noContent')}</div>
        ) : (
          <>
            <div className="px-3 py-2 border-b border-gray-800 flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <FileIcon size={14} className="text-primary-400 flex-shrink-0" />
                <span className="truncate font-mono text-xs">{selected.path}</span>
                {editing && <span className="w-2 h-2 rounded-full bg-amber-400" />}
              </div>
              <div className="flex items-center gap-1">
                {!editing ? (
                  <button onClick={() => setEditing(true)} className="btn-ghost text-xs">
                    <Edit2 size={12} /> {t('repoDetail.edit')}
                  </button>
                ) : (
                  <button onClick={() => { setEditing(false); setEditedContent(content.content); }} className="btn-ghost text-xs">
                    {t('repoDetail.cancel')}
                  </button>
                )}
                <button onClick={remove} className="btn-ghost p-1 text-red-400" title={t('repoDetail.deleteHint')}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0">
              <Editor
                height="100%"
                path={selected.path}
                language={detectLang(selected.path)}
                value={editing ? editedContent : content.content}
                theme="vs-dark"
                onChange={(v) => editing && setEditedContent(v || '')}
                options={{
                  readOnly: !editing,
                  fontSize: 13,
                  fontFamily: 'JetBrains Mono, Cascadia Code, Consolas, monospace',
                  minimap: { enabled: true, scale: 1 },
                  wordWrap: 'on',
                  tabSize: 2,
                  automaticLayout: true,
                  scrollBeyondLastLine: false,
                  padding: { top: 8 },
                }}
              />
            </div>

            {editing && (
              <div className="border-t border-gray-800 p-2 flex items-center gap-2 bg-gray-900/60">
                <input
                  className="input flex-1 text-xs"
                  placeholder={t('repoDetail.commitPlaceholderRequired')}
                  value={commitMsg}
                  onChange={(e) => setCommitMsg(e.target.value)}
                />
                <button onClick={save} disabled={busy} className="btn-primary text-xs">
                  {busy ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                  {t('repoDetail.saveToRemote')}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
