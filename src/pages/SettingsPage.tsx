import { useState, useEffect } from 'react';
import { useSettingsStore } from '../stores/settings';
import { useUpdateStore } from '../stores/update';
import { Github, Globe, Save, CheckCircle2, XCircle, Loader2, FolderOpen, Eye, EyeOff, RefreshCw, Download, ExternalLink, Info } from 'lucide-react';
import { toast } from '../components/common/Toast';
import type { AppUpdateInfo } from '../../shared/types';

export default function SettingsPage() {
  const { settings, save, setAuth, clearAuth } = useSettingsStore();
  const [gitPath, setGitPath] = useState(settings.gitPath || '');
  const [defaultCloneDir, setDefaultCloneDir] = useState(settings.defaultCloneDir || '');
  const [githubToken, setGithubToken] = useState('');
  const [giteeToken, setGiteeToken] = useState('');
  const [showGh, setShowGh] = useState(false);
  const [showGt, setShowGt] = useState(false);
  const [testing, setTesting] = useState<'git' | 'github' | 'gitee' | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const [currentVersion, setCurrentVersion] = useState('');
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  useEffect(() => {
    setGitPath(settings.gitPath || '');
    setDefaultCloneDir(settings.defaultCloneDir || '');
    window.gitgui.app.getVersion().then(setCurrentVersion);
  }, [settings]);

  const saveGeneral = async () => {
    await save({ gitPath: gitPath || undefined, defaultCloneDir });
    toast.success('已保存');
  };

  const pickDir = async () => {
    const r = await window.gitgui.repo.openDialog();
    if (r) setDefaultCloneDir(r);
  };

  const pickGit = async () => {
    // 通过主进程打开文件选择对话框
    const r = await window.gitgui.app.openPath as any;
    // 借用打开仓库的目录选择（无法选单个文件，但 git 路径一般作为可选项让用户输入）
    const p = prompt(
      '输入 git 可执行文件路径\n留空使用 PATH 中的 git\n示例：C:\\Program Files\\Git\\bin\\git.exe'
    );
    if (p) setGitPath(p);
  };

  const testGit = async () => {
    setTesting('git');
    try {
      const r = await window.gitgui.settings.testGit(gitPath || undefined);
      if (r.ok) {
        setTestResult({ ok: true, msg: `✅ ${r.version || 'OK'}` });
      } else {
        setTestResult({ ok: false, msg: r.error || '失败' });
      }
    } finally {
      setTesting(null);
    }
  };

  const testAndSaveGithub = async () => {
    if (!githubToken.trim()) return;
    setTesting('github');
    try {
      const r = await window.gitgui.settings.testAuth('github', githubToken.trim());
      if (r.ok) {
        await setAuth('github', githubToken.trim(), (r.data as any).user);
        setGithubToken('');
        toast.success(`已连接：@${(r.data as any).user}`);
      } else {
        toast.error('Token 无效：' + r.error);
      }
    } finally {
      setTesting(null);
    }
  };

  const testAndSaveGitee = async () => {
    if (!giteeToken.trim()) return;
    setTesting('gitee');
    try {
      const r = await window.gitgui.settings.testAuth('gitee', giteeToken.trim());
      if (r.ok) {
        await setAuth('gitee', giteeToken.trim(), (r.data as any).login);
        setGiteeToken('');
        toast.success(`已连接：@${(r.data as any).login}`);
      } else {
        toast.error('Token 无效：' + r.error);
      }
    } finally {
      setTesting(null);
    }
  };

  const checkUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const r = (await window.gitgui.update.check()) as AppUpdateInfo;
      setUpdateInfo(r);
      if (!r.latest) {
        toast.warn('未能获取最新版本信息');
      } else if (r.hasUpdate) {
        toast.success(`发现新版本 v${r.latest.version}`);
      } else {
        toast.info(`已是最新版本（v${r.currentVersion}）`);
      }
    } catch (e: any) {
      toast.error('检查更新失败：' + (e?.message || String(e)));
    } finally {
      setCheckingUpdate(false);
    }
  };

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <h1 className="text-2xl font-semibold">设置</h1>

        {/* 通用 */}
        <section className="panel p-4 space-y-3">
          <h2 className="text-lg font-medium">通用</h2>

          <Field label="Git 可执行文件路径" hint="留空则使用 PATH 中的 git">
            <div className="flex gap-2">
              <input className="input" value={gitPath} onChange={(e) => setGitPath(e.target.value)} placeholder="git" />
              <button onClick={pickGit} className="btn-secondary">选择</button>
              <button onClick={testGit} disabled={testing === 'git'} className="btn-ghost">
                {testing === 'git' ? <Loader2 size={14} className="animate-spin" /> : null}
                测试
              </button>
            </div>
            {testResult && (
              <div className={`text-xs mt-1 ${testResult.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                {testResult.msg}
              </div>
            )}
          </Field>

          <Field label="默认克隆目录" hint="从 URL 克隆时的目标目录">
            <div className="flex gap-2">
              <input className="input" value={defaultCloneDir} onChange={(e) => setDefaultCloneDir(e.target.value)} placeholder="D:\Projects" />
              <button onClick={pickDir} className="btn-secondary">
                <FolderOpen size={14} /> 浏览
              </button>
            </div>
          </Field>

          <button onClick={saveGeneral} className="btn-primary">
            <Save size={14} /> 保存
          </button>
        </section>

        {/* GitHub */}
        <section className="panel p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Github size={18} />
              <h2 className="text-lg font-medium">GitHub</h2>
            </div>
            {settings.auth?.github && (
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 size={14} className="text-emerald-400" />
                <span>@{settings.auth.github.user}</span>
                <button onClick={() => clearAuth('github')} className="text-xs text-red-400 hover:underline">
                  断开
                </button>
              </div>
            )}
          </div>

          <Field
            label="Personal Access Token"
            hint={
              <span>
                在 <a onClick={() => window.gitgui.app.openExternal('https://github.com/settings/tokens')} className="text-primary-400 cursor-pointer">GitHub Settings → Developer settings</a> 创建，需要 repo / read:user 权限
              </span>
            }
          >
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  className="input pr-8"
                  type={showGh ? 'text' : 'password'}
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  placeholder={settings.auth?.github ? '已配置（输入新值覆盖）' : 'ghp_...'}
                />
                <button
                  onClick={() => setShowGh(!showGh)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500"
                >
                  {showGh ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <button onClick={testAndSaveGithub} disabled={testing === 'github' || !githubToken} className="btn-primary">
                {testing === 'github' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                测试并保存
              </button>
            </div>
          </Field>
        </section>

        {/* Gitee */}
        <section className="panel p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe size={18} className="text-red-400" />
              <h2 className="text-lg font-medium">Gitee</h2>
            </div>
            {settings.auth?.gitee && (
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 size={14} className="text-emerald-400" />
                <span>@{settings.auth.gitee.user}</span>
                <button onClick={() => clearAuth('gitee')} className="text-xs text-red-400 hover:underline">
                  断开
                </button>
              </div>
            )}
          </div>

          <Field
            label="私人令牌"
            hint={
              <span>
                在 <a onClick={() => window.gitgui.app.openExternal('https://gitee.com/personal_access_tokens')} className="text-primary-400 cursor-pointer">Gitee 设置 → 私人令牌</a> 创建
              </span>
            }
          >
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  className="input pr-8"
                  type={showGt ? 'text' : 'password'}
                  value={giteeToken}
                  onChange={(e) => setGiteeToken(e.target.value)}
                  placeholder={settings.auth?.gitee ? '已配置' : '输入令牌'}
                />
                <button
                  onClick={() => setShowGt(!showGt)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500"
                >
                  {showGt ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <button onClick={testAndSaveGitee} disabled={testing === 'gitee' || !giteeToken} className="btn-primary">
                {testing === 'gitee' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                测试并保存
              </button>
            </div>
          </Field>
        </section>

        {/* 关于 */}
        <section className="panel p-4 space-y-3 text-sm text-gray-500">
          <div className="flex items-center gap-2">
            <Info size={16} />
            <h2 className="text-base font-medium text-gray-300">关于</h2>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-gray-300">KunyaoGit v{currentVersion || '...'}</div>
              <p className="text-xs mt-0.5">支持 GitHub 和 Gitee 的 Git 桌面客户端</p>
            </div>
            <button onClick={checkUpdate} disabled={checkingUpdate} className="btn-secondary">
              {checkingUpdate ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              检查更新
            </button>
          </div>

          {updateInfo?.latest && (
            <div className={`p-3 rounded border ${updateInfo.hasUpdate ? 'border-amber-700/50 bg-amber-900/20' : 'border-emerald-700/40 bg-emerald-900/15'}`}>
              <div className="flex items-center gap-2 mb-1">
                {updateInfo.hasUpdate ? (
                  <>
                    <Download size={14} className="text-amber-400" />
                    <span className="text-amber-200 font-medium">新版本 v{updateInfo.latest.version} 可用</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={14} className="text-emerald-400" />
                    <span className="text-emerald-200">已是最新版本</span>
                  </>
                )}
                <span className="text-xs text-gray-500">via {updateInfo.latest.platform === 'github' ? 'GitHub' : 'Gitee'}</span>
              </div>
              {updateInfo.latest.body && (
                <pre className="text-xs text-gray-300 whitespace-pre-wrap font-sans max-h-40 overflow-auto bg-black/20 p-2 rounded mt-1">
                  {updateInfo.latest.body}
                </pre>
              )}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {updateInfo.hasUpdate && (
                  <button
                    onClick={() => useUpdateStore.getState().show(updateInfo)}
                    className="btn-primary text-xs"
                  >
                    <Download size={12} /> 立即下载并安装
                  </button>
                )}
                <button
                  onClick={() => window.gitgui.update.open(updateInfo.latest!.htmlUrl)}
                  className="btn-secondary text-xs"
                >
                  <ExternalLink size={12} /> 浏览器打开
                </button>
                {updateInfo.hasUpdate && (
                  <button
                    onClick={() => {
                      window.gitgui.update.dismiss(updateInfo.latest!.version);
                      toast.info('已忽略该版本');
                    }}
                    className="btn-ghost text-xs"
                  >
                    忽略此版本
                  </button>
                )}
              </div>
            </div>
          )}

          {updateInfo?.sources && (
            <div className="text-xs space-y-0.5 pt-1">
              {updateInfo.sources.map((s) => (
                <div key={s.platform} className="flex items-center gap-1.5 text-gray-500">
                  <span className={s.ok ? 'text-emerald-500' : 'text-red-500'}>
                    {s.ok ? '✓' : '✕'}
                  </span>
                  <span>{s.platform === 'github' ? 'GitHub' : 'Gitee'}：</span>
                  <span>{s.ok ? (s.release ? `v${s.release.version}` : '无 release') : (s.error || '失败')}</span>
                </div>
              ))}
            </div>
          )}

          <p className="text-xs pt-1">使用 Electron + React + TypeScript 构建</p>
        </section>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm text-gray-300 mb-1">{label}</label>
      {children}
      {hint && <div className="text-xs text-gray-500 mt-1">{hint}</div>}
    </div>
  );
}
