// v0.6+ Release 列表页
// 顶部：title + 平台切换 + 搜索 + 新建按钮
// 主区：ReleaseCard 列表 + 创建表单（展开）
// 侧拉：ReleaseDetailDrawer（详情 + 编辑 + 附件管理 + 发布草稿）

import { useEffect, useMemo, useState } from 'react';
import { useRepoStore } from '../stores/repo';
import { useSettingsStore } from '../stores/settings';
import { useI18n } from '../i18n';
import { toast } from '../components/common/Toast';
import CreateReleaseForm from '../components/repo/CreateReleaseForm';
import ReleaseCard from '../components/repo/ReleaseCard';
import ReleaseDetailDrawer from '../components/repo/ReleaseDetailDrawer';
import type { ReleaseInfo } from '../../shared/types';
import { Plus, Github, Globe, Search, RefreshCw, Loader2 } from 'lucide-react';

export default function ReleasesPage() {
  const { t } = useI18n();
  const { current } = useRepoStore();
  const { settings } = useSettingsStore();
  const [platform, setPlatform] = useState<'github' | 'gitee'>('github');
  const [releases, setReleases] = useState<ReleaseInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [busyTag, setBusyTag] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReleaseInfo | null>(null);

  useEffect(() => {
    if (current) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.path, platform]);

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

  const filtered = useMemo(() => {
    if (!search.trim()) return releases;
    const q = search.trim().toLowerCase();
    return releases.filter(
      (r) => r.name.toLowerCase().includes(q) || r.tag.toLowerCase().includes(q)
    );
  }, [releases, search]);

  const handleDelete = async (r: ReleaseInfo) => {
    if (!current) return;
    if (!confirm(t('releases.deleteConfirm', { name: r.tag }))) return;
    const ok = await window.gitgui.release.delete(current.path, r.tag, platform);
    if (ok.ok) {
      toast.success(t('releases.deleteSuccess'));
      if (detail?.tag === r.tag && detail?.platform === r.platform) setDetail(null);
      await load();
    } else {
      toast.error(t('releases.deleteFailed', { error: ok.error }));
    }
  };

  const handlePublish = async (r: ReleaseInfo) => {
    if (!current) return;
    setBusyTag(`${r.platform}-${r.tag}`);
    const res = await window.gitgui.release.publish(current.path, r.tag, platform);
    setBusyTag(null);
    if (res.ok) {
      toast.success(t('releases.publishSuccess'));
      await load();
    } else {
      toast.error(t('releases.publishFailed', { error: res.error }));
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
      {/* 顶部工具栏 */}
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between gap-2 flex-shrink-0">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{t('releases.title')}</h2>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{current.name}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* 搜索 */}
          <div className="relative">
            <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              className="input text-xs pl-7 w-48"
              placeholder={t('releases.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {/* 刷新 */}
          <button
            onClick={load}
            disabled={loading || !currentAuth}
            className="btn-ghost p-1.5"
            title={t('common.loading')}
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
          {/* 平台切换 */}
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
            onClick={() => setShowCreate(!showCreate)}
            disabled={!currentAuth}
            className="btn-primary disabled:opacity-50"
          >
            <Plus size={14} /> {t('releases.newRelease')}
          </button>
        </div>
      </div>

      {/* 创建表单 */}
      {showCreate && (
        <CreateReleaseForm
          platform={platform}
          onCancel={() => setShowCreate(false)}
          onCreated={async () => {
            setShowCreate(false);
            await load();
          }}
        />
      )}

      {/* 列表区 */}
      <div className="flex-1 overflow-auto p-4">
        {!currentAuth ? (
          <div className="text-center text-gray-500 text-sm py-10">
            {t('releases.notConfigured', { platform: platform === 'github' ? 'GitHub' : 'Gitee' })}
          </div>
        ) : loading ? (
          <div className="text-center py-10 text-gray-500 text-sm">
            <Loader2 size={16} className="animate-spin inline mr-2" />
            {t('releases.loading')}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-gray-500 text-sm py-10">
            {search.trim() ? t('releases.searchEmpty') : t('releases.empty')}
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-2">
            {filtered.map((r) => (
              <ReleaseCard
                key={`${r.platform}-${r.tag}`}
                release={r}
                busy={busyTag === `${r.platform}-${r.tag}`}
                onOpenDetail={() => setDetail(r)}
                onPublish={() => handlePublish(r)}
                onDelete={() => handleDelete(r)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 详情抽屉 */}
      <ReleaseDetailDrawer
        release={detail}
        open={!!detail}
        onClose={() => setDetail(null)}
        onChanged={load}
      />
    </div>
  );
}
