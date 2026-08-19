// 更新对话框：发现新版本 → 应用内下载（带进度）→ 自动启动安装包
// 由 useUpdateStore 驱动，在 App.tsx 全局挂载（与 Toaster 同级）

import { Download, X, ExternalLink, Loader2, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { useUpdateStore } from '../../stores/update';
import { useI18n } from '../../i18n';
import type { DownloadProgress } from '../../../shared/types';

function fmtBytes(n: number): string {
  if (!n) return '0 B';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}

export function UpdateDialog() {
  const { t } = useI18n();
  const { visible, info, phase, progress, error, hide, startDownload, cancelDownload } = useUpdateStore();

  if (!visible || !info?.latest) return null;
  const latest = info.latest;
  const cur = info.currentVersion;

  const openInBrowser = () => {
    window.gitgui.update.open(latest.htmlUrl);
    window.gitgui.update.dismiss(latest.version).catch(() => {});
    hide();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => phase !== 'downloading' && hide()}>
      <div
        className="w-full max-w-lg mx-4 rounded-lg border border-gray-700 bg-gray-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Download size={16} className="text-emerald-400" />
            <h2 className="text-sm font-medium text-gray-100">{t('update.foundNew', { version: latest.version })}</h2>
            <span className="text-xs text-gray-500">当前 v{cur}</span>
          </div>
          {phase !== 'downloading' && (
            <button onClick={hide} className="text-gray-500 hover:text-gray-300">
              <X size={16} />
            </button>
          )}
        </div>

        <div className="p-5 space-y-4">
          {/* 发布说明 */}
          {latest.body && phase === 'prompt' && (
            <pre className="text-xs text-gray-300 whitespace-pre-wrap font-sans max-h-48 overflow-auto bg-black/30 p-3 rounded border border-gray-800">
              {latest.body}
            </pre>
          )}

          {/* 阶段：询问 */}
          {phase === 'prompt' && (
            <>
              <p className="text-sm text-gray-300">
                已发布 <span className="text-emerald-400 font-medium">v{latest.version}</span>，建议更新到最新版本。
              </p>
              <div className="flex items-center gap-2">
                <button onClick={startDownload} className="btn-primary">
                  <Download size={14} /> {t('update.downloadInstall')}
                </button>
                <button onClick={hide} className="btn-ghost">稍后</button>
                <button onClick={openInBrowser} className="btn-secondary">
                  <ExternalLink size={12} /> {t('update.openInBrowser')}
                </button>
              </div>
            </>
          )}

          {/* 阶段：下载中 */}
          {phase === 'downloading' && (
            <DownloadPanel progress={progress} onCancel={cancelDownload} />
          )}

          {/* 阶段：下载完成，正在启动安装程序 */}
          {phase === 'done' && (
            <div className="flex items-center gap-3 py-2">
              <CheckCircle2 size={20} className="text-emerald-400 flex-shrink-0" />
              <div className="flex-1">
                <div className="text-sm text-gray-200">{t('update.downloadComplete')}</div>
                <div className="text-xs text-gray-500">{t('update.startingInstaller')}</div>
              </div>
              <Loader2 size={16} className="animate-spin text-emerald-400" />
            </div>
          )}

          {/* 阶段：错误 */}
          {phase === 'error' && (
            <>
              <div className="flex items-start gap-3 py-1">
                <AlertCircle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="text-sm text-red-200">{t('update.downloadFailed')}</div>
                  <div className="text-xs text-gray-400 mt-1 break-all">{error}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={startDownload} className="btn-primary">
                  <RefreshCw size={14} /> {t('update.retry')}
                </button>
                <button onClick={openInBrowser} className="btn-secondary">
                  <ExternalLink size={12} /> {t('update.browserDownload')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DownloadPanel({ progress, onCancel }: { progress: DownloadProgress | null; onCancel: () => void }) {
  const { t } = useI18n();
  const percent = progress?.percent ?? -1;
  const known = percent >= 0 && (progress?.totalBytes ?? 0) > 0;
  return (
    <div className="space-y-3 py-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-300 flex items-center gap-2">
          <Loader2 size={14} className="animate-spin text-emerald-400" />
          {known ? t('update.downloading', { percent }) : t('update.connecting')}
        </span>
        <span className="text-xs text-gray-500">
          {progress?.source === 'gitee' ? t('update.sourceGitee') : progress?.source === 'github' ? t('update.sourceGithub') : ''}
        </span>
      </div>
      {/* 进度条 */}
      <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
        {known ? (
          <div
            className="h-full bg-emerald-500 transition-all duration-200"
            style={{ width: `${percent}%` }}
          />
        ) : (
          <div className="h-full w-1/3 bg-emerald-500/70 animate-pulse rounded-full" />
        )}
      </div>
      {/* 字节数 */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{progress ? fmtBytes(progress.bytesReceived) : ''}</span>
        <span>{known && progress ? '共 ' + fmtBytes(progress.totalBytes) : '大小未知'}</span>
      </div>
      <button onClick={onCancel} className="btn-ghost text-xs">{t('update.cancel')}</button>
    </div>
  );
}
