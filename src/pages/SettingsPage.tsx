import { useState, useEffect } from 'react';
import { useSettingsStore } from '../stores/settings';
import { useUpdateStore } from '../stores/update';
import { useI18n } from '../i18n';
import { Github, Globe, Save, CheckCircle2, XCircle, Loader2, FolderOpen, Eye, EyeOff, RefreshCw, Download, ExternalLink, Info, Languages, Palette, Check, KeyRound, Terminal } from 'lucide-react';
import { toast } from '../components/common/Toast';
import type { AppUpdateInfo } from '../../shared/types';
import { THEME_LIST, setTheme } from '../hooks/useTheme';
import type { Theme } from '../../shared/types';

export default function SettingsPage() {
  const { t, lang, setLang } = useI18n();
  const { settings, save, setAuth, clearAuth } = useSettingsStore();
  const [gitPath, setGitPath] = useState(settings.gitPath || '');
  const [defaultCloneDir, setDefaultCloneDir] = useState(settings.defaultCloneDir || '');
  const [githubToken, setGithubToken] = useState('');
  const [giteeToken, setGiteeToken] = useState('');
  const [showGh, setShowGh] = useState(false);
  const [showGt, setShowGt] = useState(false);
  const [testing, setTesting] = useState<'git' | 'github' | 'gitee' | 'ssh' | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  // v0.6+ SSH 推送支持
  const [sshKeyPath, setSshKeyPath] = useState(settings.sshKeyPath || '');
  const [preferredProtocol, setPreferredProtocol] = useState<'auto' | 'https' | 'ssh'>(
    settings.preferredProtocol || 'auto'
  );
  const [sshTestResult, setSshTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const [currentVersion, setCurrentVersion] = useState('');
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  useEffect(() => {
    setGitPath(settings.gitPath || '');
    setDefaultCloneDir(settings.defaultCloneDir || '');
    setSshKeyPath(settings.sshKeyPath || '');
    setPreferredProtocol(settings.preferredProtocol || 'auto');
    window.gitgui.app.getVersion().then(setCurrentVersion);
  }, [settings]);

  const saveGeneral = async () => {
    await save({ gitPath: gitPath || undefined, defaultCloneDir });
    toast.success(t('settings.saved'));
  };

  // v0.6+ SSH：保存私钥路径 + 协议偏好
  const saveSsh = async () => {
    await save({ sshKeyPath: sshKeyPath.trim() || '', preferredProtocol });
    toast.success(t('settings.saved'));
  };

  // v0.6+ SSH：测试连接
  const testSshConnection = async () => {
    setTesting('ssh');
    setSshTestResult(null);
    try {
      // 先把当前输入的路径保存到 settings，这样 GitService 下次 new 时会读到
      await save({ sshKeyPath: sshKeyPath.trim() || '' });
      const r: any = await window.gitgui.settings.testSsh(sshKeyPath.trim() || undefined);
      if (r.ok) {
        // r.message 含 "已认证为 <user>" 或 "Hi <user>"
        const m = r.message?.match(/已认证为\s+(\S+)|Hi\s+(\S+?)[!]/);
        const user = m?.[1] || m?.[2] || r.message;
        setSshTestResult({ ok: true, msg: t('settings.sshAuthOk', { user }) });
      } else {
        setSshTestResult({ ok: false, msg: t('settings.sshAuthFailed', { error: r.error || r.message || '未知错误' }) });
      }
    } catch (e) {
      setSshTestResult({ ok: false, msg: t('settings.sshAuthFailed', { error: (e as Error).message }) });
    } finally {
      setTesting(null);
    }
  };

  const pickDir = async () => {
    const r = await window.gitgui.repo.openDialog();
    if (r) setDefaultCloneDir(r);
  };

  const pickGit = async () => {
    const p = prompt(t('settings.gitPathPrompt'));
    if (p) setGitPath(p);
  };

  const testGit = async () => {
    setTesting('git');
    try {
      const r = await window.gitgui.settings.testGit(gitPath || undefined);
      if (r.ok) {
        setTestResult({ ok: true, msg: `✅ ${r.version || 'OK'}` });
      } else {
        setTestResult({ ok: false, msg: r.error || t('common.error') });
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
        toast.success(t('settings.connected', { user: (r.data as any).user }));
      } else {
        toast.error(t('settings.tokenInvalid', { error: r.error || '' }));
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
        toast.success(t('settings.connected', { user: (r.data as any).login }));
      } else {
        toast.error(t('settings.tokenInvalid', { error: r.error || '' }));
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
        toast.warn(t('settings.updateNotFound'));
      } else if (r.hasUpdate) {
        toast.success(t('settings.updateFound', { version: r.latest.version }));
      } else {
        toast.info(t('settings.updateLatest', { version: r.currentVersion }));
      }
    } catch (e: any) {
      toast.error(t('settings.updateCheckFailed', { error: e?.message || String(e) }));
    } finally {
      setCheckingUpdate(false);
    }
  };

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <h1 className="text-2xl font-semibold">{t('settings.title')}</h1>

        {/* 通用 */}
        <section className="panel p-4 space-y-3">
          <h2 className="text-lg font-medium">{t('settings.general')}</h2>

          {/* Language selector */}
          <Field label={t('settings.language')} hint={t('settings.languageHint')}>
            <div className="flex gap-2">
              <button
                onClick={() => setLang('zh')}
                className={`btn-secondary ${lang === 'zh' ? 'ring-2 ring-primary-500' : ''}`}
              >
                <Languages size={14} /> 中文
              </button>
              <button
                onClick={() => setLang('en')}
                className={`btn-secondary ${lang === 'en' ? 'ring-2 ring-primary-500' : ''}`}
              >
                <Languages size={14} /> English
              </button>
            </div>
          </Field>

          {/* Theme selector */}
          <Field label={t('settings.theme')} hint={t('settings.themeHint')}>
            <div className="flex gap-3 flex-wrap">
              {THEME_LIST.map((th) => {
                const active = settings.theme === th.value;
                return (
                  <button
                    key={th.value}
                    onClick={() => setTheme(th.value as Theme)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md border transition-all ${
                      active
                        ? 'border-primary-500 ring-2 ring-primary-500/50'
                        : 'border-gray-700 hover:border-gray-600'
                    }`}
                    style={{
                      backgroundColor: th.swatch.bg,
                      color: th.swatch.fg,
                    }}
                    title={lang === 'zh' ? th.labelZh : th.labelEn}
                  >
                    <Palette size={14} style={{ color: th.swatch.primary }} />
                    <span className="text-sm font-medium">{lang === 'zh' ? th.labelZh : th.labelEn}</span>
                    {active && <Check size={14} style={{ color: th.swatch.primary }} />}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label={t('settings.gitPath')} hint={t('settings.gitPathHint')}>
            <div className="flex gap-2">
              <input className="input" value={gitPath} onChange={(e) => setGitPath(e.target.value)} placeholder="git" />
              <button onClick={pickGit} className="btn-secondary">{t('settings.select')}</button>
              <button onClick={testGit} disabled={testing === 'git'} className="btn-ghost">
                {testing === 'git' ? <Loader2 size={14} className="animate-spin" /> : null}
                {t('settings.test')}
              </button>
            </div>
            {testResult && (
              <div className={`text-xs mt-1 ${testResult.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                {testResult.msg}
              </div>
            )}
          </Field>

          <Field label={t('settings.defaultCloneDir')} hint={t('settings.defaultCloneDirHint')}>
            <div className="flex gap-2">
              <input className="input" value={defaultCloneDir} onChange={(e) => setDefaultCloneDir(e.target.value)} placeholder="D:\Projects" />
              <button onClick={pickDir} className="btn-secondary">
                <FolderOpen size={14} /> {t('settings.browse')}
              </button>
            </div>
          </Field>

          <button onClick={saveGeneral} className="btn-primary">
            <Save size={14} /> {t('settings.save')}
          </button>
        </section>

        {/* GitHub */}
        <section className="panel p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Github size={18} />
              <h2 className="text-lg font-medium">{t('settings.github')}</h2>
            </div>
            {settings.auth?.github && (
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 size={14} className="text-emerald-400" />
                <span>@{settings.auth.github.user}</span>
                <button onClick={() => clearAuth('github')} className="text-xs text-red-400 hover:underline">
                  {t('settings.disconnect')}
                </button>
              </div>
            )}
          </div>

          <Field
            label={t('settings.tokenLabel')}
            hint={
              <span>
                {t('settings.tokenHintGithub')} —{' '}
                <a onClick={() => window.gitgui.app.openExternal('https://github.com/settings/tokens')} className="text-primary-400 cursor-pointer">GitHub Settings → Developer settings</a>
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
                  placeholder={settings.auth?.github ? t('settings.tokenPlaceholderSet') : t('settings.tokenPlaceholderNew')}
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
                {t('settings.testAndSave')}
              </button>
            </div>
          </Field>
        </section>

        {/* Gitee */}
        <section className="panel p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe size={18} className="text-red-400" />
              <h2 className="text-lg font-medium">{t('settings.gitee')}</h2>
            </div>
            {settings.auth?.gitee && (
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 size={14} className="text-emerald-400" />
                <span>@{settings.auth.gitee.user}</span>
                <button onClick={() => clearAuth('gitee')} className="text-xs text-red-400 hover:underline">
                  {t('settings.disconnect')}
                </button>
              </div>
            )}
          </div>

          <Field
            label={t('settings.giteeTokenLabel')}
            hint={
              <span>
                {t('settings.tokenHintGitee')} —{' '}
                <a onClick={() => window.gitgui.app.openExternal('https://gitee.com/personal_access_tokens')} className="text-primary-400 cursor-pointer">Gitee Settings → Personal Access Tokens</a>
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
                  placeholder={settings.auth?.gitee ? t('settings.tokenPlaceholderGiteeSet') : t('settings.tokenPlaceholderGiteeNew')}
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
                {t('settings.testAndSave')}
              </button>
            </div>
          </Field>
        </section>

        {/* v0.6+ SSH 推送支持 */}
        <section className="panel p-4 space-y-3">
          <div className="flex items-center gap-2">
            <KeyRound size={18} />
            <h2 className="text-lg font-medium">{t('settings.sshSection')}</h2>
          </div>
          <p className="text-xs text-gray-500 -mt-2">{t('settings.sshSectionHint')}</p>

          <Field label={t('settings.sshKeyPath')} hint={t('settings.sshKeyPathHint')}>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                value={sshKeyPath}
                onChange={(e) => setSshKeyPath(e.target.value)}
                placeholder={t('settings.sshKeyPathPlaceholder')}
              />
              <button
                onClick={async () => {
                  // 用现成的 openPath 让用户在文件管理器里选
                  // （fs:read-dir 之类的接口都是目录的，没有「选文件」接口；
                  //   这里退到 prompt，让用户粘贴路径）
                  const p = prompt(t('settings.sshKeyPathHint'));
                  if (p) setSshKeyPath(p);
                }}
                className="btn-secondary"
              >
                <FolderOpen size={14} /> {t('settings.select')}
              </button>
            </div>
          </Field>

          <Field label={t('settings.preferredProtocol')}>
            <div className="flex gap-2">
              {(['auto', 'https', 'ssh'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPreferredProtocol(p)}
                  className={`px-3 py-1.5 rounded border text-sm ${
                    preferredProtocol === p
                      ? 'border-primary-500 bg-primary-500/10 text-primary-300'
                      : 'border-gray-700 text-gray-400 hover:border-gray-500'
                  }`}
                >
                  {p === 'auto' && t('settings.protocolAuto')}
                  {p === 'https' && t('settings.protocolHttps')}
                  {p === 'ssh' && t('settings.protocolSsh')}
                </button>
              ))}
            </div>
          </Field>

          <div className="flex items-center gap-2">
            <button onClick={testSshConnection} disabled={testing === 'ssh'} className="btn-ghost">
              {testing === 'ssh' ? <Loader2 size={14} className="animate-spin" /> : <Terminal size={14} />}
              {t('settings.testSsh')}
            </button>
            <button onClick={saveSsh} className="btn-primary">
              <Save size={14} /> {t('settings.save')}
            </button>
            {sshTestResult && (
              <div className={`text-xs ${sshTestResult.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                {sshTestResult.msg}
              </div>
            )}
          </div>
        </section>

        {/* 关于 */}
        <section className="panel p-4 space-y-3 text-sm text-gray-500">
          <div className="flex items-center gap-2">
            <Info size={16} />
            <h2 className="text-base font-medium text-gray-300">{t('settings.about')}</h2>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-gray-300">{t('settings.version', { version: currentVersion || '...' })}</div>
              <p className="text-xs mt-0.5">{t('settings.aboutDesc')}</p>
            </div>
            <button onClick={checkUpdate} disabled={checkingUpdate} className="btn-secondary">
              {checkingUpdate ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {t('settings.checkUpdate')}
            </button>
          </div>

          {updateInfo?.latest && (
            <div className={`p-3 rounded border ${updateInfo.hasUpdate ? 'border-amber-700/50 bg-amber-900/20' : 'border-emerald-700/40 bg-emerald-900/15'}`}>
              <div className="flex items-center gap-2 mb-1">
                {updateInfo.hasUpdate ? (
                  <>
                    <Download size={14} className="text-amber-400" />
                    <span className="text-amber-200 font-medium">{t('settings.newVersionAvailable', { version: updateInfo.latest.version })}</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={14} className="text-emerald-400" />
                    <span className="text-emerald-200">{t('settings.alreadyLatest')}</span>
                  </>
                )}
                <span className="text-xs text-gray-500">{t('settings.via')} {updateInfo.latest.platform === 'github' ? 'GitHub' : 'Gitee'}</span>
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
                    <Download size={12} /> {t('settings.downloadAndInstall')}
                  </button>
                )}
                <button
                  onClick={() => window.gitgui.update.open(updateInfo.latest!.htmlUrl)}
                  className="btn-secondary text-xs"
                >
                  <ExternalLink size={12} /> {t('settings.openInBrowser')}
                </button>
                {updateInfo.hasUpdate && (
                  <button
                    onClick={() => {
                      window.gitgui.update.dismiss(updateInfo.latest!.version);
                      toast.info(t('settings.versionIgnored'));
                    }}
                    className="btn-ghost text-xs"
                  >
                    {t('settings.ignoreVersion')}
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
                  <span>{s.ok ? (s.release ? `v${s.release.version}` : t('settings.noRelease')) : (s.error || t('settings.failed'))}</span>
                </div>
              ))}
            </div>
          )}

          <p className="text-xs pt-1">{t('settings.builtWith')}</p>
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
