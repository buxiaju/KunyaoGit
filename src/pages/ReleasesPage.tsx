import { useEffect, useState } from 'react';
import { useRepoStore } from '../stores/repo';
import { Tag, Plus, Trash2, ExternalLink, Edit2, FileText, Loader2, Github, Globe } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { toast } from '../components/common/Toast';
import { useSettingsStore } from '../stores/settings';
import { useI18n } from '../i18n';

export default function ReleasesPage() {
  const { t } = useI18n();
  const { current } = useRepoStore();
  const { settings } = useSettingsStore();
  const [platform, setPlatform] = useState<'github' | 'gitee'>('github');
  const [releases, setReleases] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [tag, setTag] = useState('');
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [draft, setDraft] = useState(false);
  const [prerelease, setPrerelease] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (current) load();
  }, [current, platform]);

  const load = async () => {
    if (!current) return;
    const auth = platform === 'github' ? settings.auth?.github : settings.auth?.gitee;
    if (!auth) {
      setReleases([]);
      return;
    }
    setLoading(true);
    try {
      const r = await window.gitgui.release.list(current.path, platform);
      if (r.ok) setReleases(r.data);
      else toast.error(r.error);
    } finally {
      setLoading(false);
    }
  };

  const generateChangelog = async () => {
    if (!current) return;
    setGenerating(true);
    try {
      const r = await window.gitgui.release.changelog({ repoPath: current.path });
      if (r.ok) {
        setBody(r.data);
        toast.success(t('releases.changelogGenerated'));
      } else {
        toast.error(t('releases.changelogFailed', { error: r.error }));
      }
    } finally {
      setGenerating(false);
    }
  };

  const create = async () => {
    if (!current) return;
    if (!tag.trim() || !name.trim()) {
      toast.warn(t('releases.tagAndNameRequired'));
      return;
    }
    const r = await window.gitgui.release.create({
      repoPath: current.path,
      tag: tag.trim(),
      name: name.trim(),
      body: body,
      draft,
      prerelease,
      platform,
    });
    if (r.ok) {
      toast.success(t('releases.createSuccess'));
      setShowCreate(false);
      setTag('');
      setName('');
      setBody('');
      setDraft(false);
      setPrerelease(false);
      await load();
    } else {
      toast.error(t('releases.createFailed', { error: r.error }));
    }
  };

  const remove = async (tagName: string) => {
    if (!current) return;
    if (!confirm(t('releases.deleteConfirm', { name: tagName }))) return;
    const r = await window.gitgui.release.delete(current.path, tagName, platform);
    if (r.ok) {
      toast.success(t('releases.deleteSuccess'));
      await load();
    } else {
      toast.error(t('releases.deleteFailed', { error: r.error }));
    }
  };

  if (!current) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 text-sm">
        {t('releases.noRepo')}
      </div>
    );
  }

  const currentAuth = platform === 'github' ? settings.auth?.github : settings.auth?.gitee;

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t('releases.title')}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{current.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 panel p-0.5">
            <button
              onClick={() => setPlatform('github')}
              className={`px-2 py-1 rounded text-xs flex items-center gap-1 ${
                platform === 'github' ? 'bg-primary-600/30 text-primary-200' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <Github size={12} /> GitHub
            </button>
            <button
              onClick={() => setPlatform('gitee')}
              className={`px-2 py-1 rounded text-xs flex items-center gap-1 ${
                platform === 'gitee' ? 'bg-red-600/30 text-red-200' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <Globe size={12} /> Gitee
            </button>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            disabled={!currentAuth}
            className="btn-primary disabled:opacity-50"
          >
            <Plus size={14} /> {t('releases.newRelease')}
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="border-b border-gray-800 bg-gray-900/50 p-4 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input className="input" placeholder={t('releases.tagInputPlaceholder')} value={tag} onChange={(e) => setTag(e.target.value)} />
            <input className="input" placeholder={t('releases.nameInputPlaceholder')} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-sm">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} disabled={platform === 'gitee'} /> {t('releases.isDraft')}
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={prerelease} onChange={(e) => setPrerelease(e.target.checked)} /> {t('releases.isPrerelease')}
              </label>
            </div>
            <button onClick={generateChangelog} disabled={generating} className="btn-ghost text-xs">
              {generating ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
              {t('releases.generateChangelog')}
            </button>
          </div>
          <textarea
            className="input min-h-[140px] font-mono text-xs"
            placeholder={t('releases.bodyInputPlaceholder')}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="flex gap-2">
            <button onClick={create} className="btn-primary">{t('releases.create')}</button>
            <button onClick={() => setShowCreate(false)} className="btn-ghost">{t('releases.cancel')}</button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto p-4">
        {!currentAuth ? (
          <div className="text-center text-gray-500 text-sm py-10">{t('releases.notConfigured', { platform: platform === 'github' ? 'GitHub' : 'Gitee' })}</div>
        ) : loading ? (
          <div className="text-center py-10 text-gray-500 text-sm">
            <Loader2 size={16} className="animate-spin inline mr-2" />{t('releases.loading')}
          </div>
        ) : releases.length === 0 ? (
          <div className="text-center text-gray-500 text-sm py-10">{t('releases.empty')}</div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-3">
            {releases.map((r) => (
              <div key={`${r.platform}-${r.tag}`} className="panel p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Tag size={14} className="text-primary-400" />
                      <span className="font-medium">{r.name}</span>
                      <span className="text-xs text-gray-500 font-mono">{r.tag}</span>
                      {r.draft && <span className="text-xs px-1.5 rounded bg-gray-700 text-gray-300">{t('releases.draft')}</span>}
                      {r.prerelease && <span className="text-xs px-1.5 rounded bg-amber-900/50 text-amber-300">{t('releases.prerelease')}</span>}
                      <span className="text-xs px-1.5 rounded bg-gray-800 text-gray-400">{r.platform}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {t('releases.publishedAt', { date: r.publishedAt && formatDistanceToNow(new Date(r.publishedAt), { locale: zhCN, addSuffix: true }) })}
                      {r.assets.length > 0 && t('releases.assetsCount', { count: r.assets.length })}
                    </div>
                    {r.body && (
                      <pre className="mt-2 text-xs text-gray-300 bg-gray-900/60 rounded p-2 whitespace-pre-wrap max-h-40 overflow-auto">
                        {r.body}
                      </pre>
                    )}
                  </div>
                  <button onClick={() => remove(r.tag)} className="btn-ghost p-1 hover:text-red-400">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
