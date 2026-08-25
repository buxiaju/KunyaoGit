// v0.6+ Release 列表项
// 摘要视图：name / tag / 状态 / 时间 / assets 数量 / 详情入口 / 发布（仅 draft）/ 删除

import { useI18n } from '../../i18n';
import { Tag, Trash2, ExternalLink, ChevronRight, Package, Send, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import type { ReleaseInfo } from '../../../shared/types';

interface Props {
  release: ReleaseInfo;
  busy?: boolean;
  onOpenDetail: () => void;
  onPublish: () => void;
  onDelete: () => void;
}

export default function ReleaseCard({ release, busy, onOpenDetail, onPublish, onDelete }: Props) {
  const { t } = useI18n();

  return (
    <div className="panel p-3 hover:border-primary-700 transition-colors">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Tag size={14} className="text-primary-400 flex-shrink-0" />
            <span className="font-medium truncate">{release.name}</span>
            <span className="text-xs text-gray-500 font-mono">{release.tag}</span>
            {release.draft && (
              <span className="text-[10px] px-1.5 rounded bg-gray-700 text-gray-300">
                {t('releases.draft')}
              </span>
            )}
            {release.prerelease && (
              <span className="text-[10px] px-1.5 rounded bg-amber-900/50 text-amber-300">
                {t('releases.prerelease')}
              </span>
            )}
            <span className="text-[10px] px-1.5 rounded bg-gray-800 text-gray-400">
              {release.platform}
            </span>
          </div>
          <div className="text-xs text-gray-500 mt-1.5 flex items-center gap-2 flex-wrap">
            <span>
              {t('releases.publishedAt', {
                date:
                  (release.publishedAt || release.createdAt) &&
                  formatDistanceToNow(new Date(release.publishedAt || release.createdAt), {
                    locale: zhCN,
                    addSuffix: true,
                  }),
              })}
            </span>
            {release.assets.length > 0 && (
              <>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <Package size={10} />
                  {t('releases.assetsCount', { count: release.assets.length })}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-0.5 flex-shrink-0">
          {release.draft && (
            <button
              onClick={onPublish}
              disabled={busy}
              className="btn-ghost p-1.5 text-primary-300 hover:text-primary-200"
              title={t('releases.publishDraft')}
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
            </button>
          )}
          <button
            onClick={onDelete}
            disabled={busy}
            className="btn-ghost p-1.5 hover:text-red-400"
            title={t('common.delete')}
          >
            <Trash2 size={12} />
          </button>
          <button
            onClick={onOpenDetail}
            className="btn-ghost p-1.5"
            title={t('releases.detail')}
          >
            <ChevronRight size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
