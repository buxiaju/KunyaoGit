import { useState, useEffect } from 'react';
import { useSettingsStore } from '../stores/settings';
import { useUpdateStore } from '../stores/update';
import { useI18n } from '../i18n';
import { Github, Globe, Save, CheckCircle2, XCircle, Loader2, FolderOpen, Eye, EyeOff, RefreshCw, Download, ExternalLink, Info, Languages, Palette, Check, KeyRound, Terminal, Copy, ListChecks, Trash2 } from 'lucide-react';
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
  // v0.6+ SSH 推送支持
  const [sshKeyPath, setSshKeyPath] = useState(settings.sshKeyPath || '');
  // v0.6.2+ SSH 按 host 路由
  const [sshGithubKey, setSshGithubKey] = useState(settings.sshKeysByHost?.github || '');
  const [sshGiteeKey, setSshGiteeKey] = useState(settings.sshKeysByHost?.gitee || '');
  // v0.6.3+：已存在的 ~/.ssh 私钥列表
  const [existingKeys, setExistingKeys] = useState<Array<{ name: string; path: string; fingerprint: string; host?: 'github.com' | 'gitee.com' }>>([]);
  const [deletingKeyPath, setDeletingKeyPath] = useState<string | null>(null);
  // 生成密钥表单
  const [genDialog, setGenDialog] = useState<{ host: 'github.com' | 'gitee.com' } | null>(null);
  const [genKeyName, setGenKeyName] = useState('id_ed25519_');
  const [genKeyComment, setGenKeyComment] = useState('kunyao@kunyaogit.local');
  const [genBusy, setGenBusy] = useState(false);
  // 生成结果（用于显示公钥 + 复制）
  const [genResult, setGenResult] = useState<{ privatePath: string; publicKey: string; fingerprint: string; host: 'github.com' | 'gitee.com' } | null>(null);
  // 协议偏好
  const [preferredProtocol, setPreferredProtocol] = useState<'auto' | 'https' | 'ssh'>(
    settings.preferredProtocol || 'auto'
  );
  // 测试连接（按 host 区分）
  const [testingHost, setTestingHost] = useState<'github.com' | 'gitee.com' | null>(null);
  // v0.6.3+ 拆分：git 测试结果 + ssh 测试结果 各自独立（之前共用一个 testResult 导致 Git
  // 路径下面也会显示 SSH 测试结果，反之亦然）
  const [gitTestResult, setGitTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [sshTestResult, setSshTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const [currentVersion, setCurrentVersion] = useState('');
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  useEffect(() => {
    setGitPath(settings.gitPath || '');
    setDefaultCloneDir(settings.defaultCloneDir || '');
    setSshKeyPath(settings.sshKeyPath || '');
    setSshGithubKey(settings.sshKeysByHost?.github || '');
    setSshGiteeKey(settings.sshKeysByHost?.gitee || '');
    setPreferredProtocol(settings.preferredProtocol || 'auto');
    window.gitgui.app.getVersion().then(setCurrentVersion);
  }, [settings]);

  // v0.6.3+：进入设置页时扫一次 ~/.ssh
  const refreshExistingKeys = async () => {
    try {
      const list = await window.gitgui.settings.sshListKeys();
      setExistingKeys(Array.isArray(list) ? list : []);
    } catch {
      setExistingKeys([]);
    }
  };
  useEffect(() => {
    refreshExistingKeys();
  }, []);

  const saveGeneral = async () => {
    await save({ gitPath: gitPath || undefined, defaultCloneDir });
    toast.success(t('settings.saved'));
  };

  // v0.6.2+ SSH：保存私钥路径 + 按 host 私钥 + 协议偏好 + 写入 ~/.ssh/config
  const saveSsh = async (alsoWriteConfig: boolean = true) => {
    await save({
      sshKeyPath: sshKeyPath.trim() || '',
      sshKeysByHost: {
        github: sshGithubKey.trim() || '',
        gitee: sshGiteeKey.trim() || '',
      },
      preferredProtocol,
    });
    if (alsoWriteConfig) {
      // 同时写 ~/.ssh.config 让 OpenSSH 客户端按 host 自动选 key
      const blocks = [];
      if (sshGithubKey.trim()) blocks.push({ host: 'github.com', keyPath: sshGithubKey.trim() });
      if (sshGiteeKey.trim()) blocks.push({ host: 'gitee.com', keyPath: sshGiteeKey.trim() });
      if (sshKeyPath.trim() && blocks.length === 0) {
        blocks.push({ host: 'github.com', keyPath: sshKeyPath.trim() });
        blocks.push({ host: 'gitee.com', keyPath: sshKeyPath.trim() });
      }
      try {
        const r: any = await window.gitgui.settings.sshWriteConfig(blocks);
        if (r.ok) {
          toast.success(t('settings.sshConfigWritten'));
        } else {
          toast.error(t('settings.sshWriteConfigFailed', { error: r.error || '未知错误' }));
        }
      } catch (e) {
        toast.error(t('settings.sshWriteConfigFailed', { error: (e as Error).message }));
      }
    } else {
      toast.success(t('settings.saved'));
    }
  };

  // v0.6.2+：按 host 测试 SSH 连接
  const testSshForHost = async (host: 'github.com' | 'gitee.com', keyPath: string) => {
    setTestingHost(host);
    setSshTestResult(null);
    try {
      const r: any = await window.gitgui.settings.testSshForHost({ host, keyPath: keyPath || undefined });
      if (r.ok) {
        const m = r.message?.match(/已认证为\s+(\S+)|Hi\s+(\S+?)[!]/);
        const user = m?.[1] || m?.[2] || r.message;
        const userText = user || r.message;
        setSshTestResult({ ok: true, msg: host === 'github.com' ? `GitHub: ${userText}` : `Gitee: ${userText}` });
      } else {
        setSshTestResult({ ok: false, msg: r.error || r.message || '未知错误' });
      }
    } catch (e) {
      setSshTestResult({ ok: false, msg: (e as Error).message });
    } finally {
      setTestingHost(null);
    }
  };

  // v0.6.2+：生成新 SSH 密钥
  // v0.6.3+：留 keyPath + 传 host → 后端自动写到 ~/.ssh/id_ed25519_<github|gitee>
  const generateNewKey = async (host: 'github.com' | 'gitee.com') => {
    setGenBusy(true);
    try {
      const r: any = await window.gitgui.settings.sshGenerate({
        keyPath: '', // 留空 → 后端用 host 自动生成 ~/.ssh/id_ed25519_<github|gitee>
        host, // v0.6.3+ 显式传 host，给后端做 fallback
        comment: genKeyComment || `kunyao@kunyaogit.local (${host})`,
        passphrase: '',
      });
      if (r && r.publicKey) {
        // 生成成功 → 把生成的 key 路径自动填到对应 host
        if (host === 'github.com') setSshGithubKey(r.privatePath);
        else setSshGiteeKey(r.privatePath);
        setGenResult({ ...r, host });
        toast.success(t('settings.sshKeyGenerated'));
        setGenDialog(null);
        // 自动复制公钥到剪贴板
        try {
          await navigator.clipboard.writeText(r.publicKey);
        } catch { /* ignore */ }
        // v0.6.3+ 刷新 ~/.ssh 列表
        refreshExistingKeys();
      } else {
        toast.error(t('settings.sshGenerateFailed', { error: r?.error || '未知错误' }));
      }
    } catch (e) {
      toast.error(t('settings.sshGenerateFailed', { error: (e as Error).message }));
    } finally {
      setGenBusy(false);
    }
  };

  // v0.6.3+：删除一对 SSH 私钥（带确认）
  const deleteExistingKey = async (keyPath: string, name: string) => {
    if (!window.confirm(t('settings.sshDeleteConfirm', { name }))) return;
    setDeletingKeyPath(keyPath);
    try {
      const r: any = await window.gitgui.settings.sshDeleteKey(keyPath);
      if (r && r.ok) {
        toast.success(t('settings.sshDeleteOk', { name }));
        refreshExistingKeys();
        // 如果删的就是下方按 host 填的那个，清掉对应 host 路径
        if (keyPath === sshGithubKey) setSshGithubKey('');
        if (keyPath === sshGiteeKey) setSshGiteeKey('');
      } else {
        toast.error(t('settings.sshDeleteFailed', { error: r?.error || '未知错误' }));
      }
    } catch (e) {
      toast.error(t('settings.sshDeleteFailed', { error: (e as Error).message }));
    } finally {
      setDeletingKeyPath(null);
    }
  };

  // 复制公钥到剪贴板
  const copyPubkey = async (pubkey: string) => {
    try {
      await navigator.clipboard.writeText(pubkey);
      toast.success(t('settings.sshCopied'));
    } catch {
      // fallback：选中元素让用户 Ctrl+C
      const ta = document.createElement('textarea');
      ta.value = pubkey;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      toast.success(t('settings.sshCopied'));
    }
  };

  // 打开 ~/.ssh 目录（用 fs:open-path 走 APP_OPEN_PATH）
  const openSshDir = async () => {
    try {
      await window.gitgui.app.openPath('@userData'); // 占位，下面改
    } catch {}
  };
  // 注：openSshDir 实际是 @userData 占位 → 需要新 IPC "app:open-ssh-dir"
  // 为简化：用现有的 prompt 让用户复制路径
  void openSshDir;

  const pickDir = async () => {
    const r = await window.gitgui.repo.openDialog();
    if (r) setDefaultCloneDir(r);
  };

  const pickGit = async () => {
    // v0.6.3+ 用系统文件对话框代替 prompt()（Electron 渲染层默认禁用 prompt）
    const r: any = await window.gitgui.dialog.showOpen({
      title: t('settings.gitPathDialogTitle'),
      properties: ['openFile'],
      filters: [
        { name: 'Git', extensions: ['exe', 'cmd', 'bat'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (r && !r.canceled && r.filePaths && r.filePaths.length > 0) {
      setGitPath(r.filePaths[0]);
    }
  };

  const testGit = async () => {
    setTesting('git');
    try {
      const r = await window.gitgui.settings.testGit(gitPath || undefined);
      if (r.ok) {
        setGitTestResult({ ok: true, msg: `✅ ${r.version || 'OK'}` });
      } else {
        setGitTestResult({ ok: false, msg: r.error || t('common.error') });
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
            {gitTestResult && (
              <div className={`text-xs mt-1 ${gitTestResult.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                {gitTestResult.msg}
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

        {/* v0.6.2+ SSH 按 host 路由 */}
        <section className="panel p-4 space-y-3">
          <div className="flex items-center gap-2">
            <KeyRound size={18} />
            <h2 className="text-lg font-medium">{t('settings.sshSection')}</h2>
          </div>
          <p className="text-xs text-gray-500 -mt-2">{t('settings.sshSectionHint')}</p>

          {/* v0.6.3+：已存在的 SSH 私钥列表（自动扫 ~/.ssh/id_*） */}
          {existingKeys.length > 0 && (
            <div className="border border-primary-700/30 rounded p-2 bg-primary-900/5">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-xs font-medium text-gray-400 flex items-center gap-1">
                  <ListChecks size={12} />
                  {t('settings.sshExistingKeys')}（{existingKeys.length}）
                </div>
                <button
                  onClick={refreshExistingKeys}
                  className="text-xs text-gray-500 hover:text-primary-300"
                  title="Refresh"
                >
                  <RefreshCw size={11} />
                </button>
              </div>
              <div className="space-y-1">
                {existingKeys.map((k) => (
                  <div
                    key={k.path}
                    className="flex items-center gap-2 text-xs px-2 py-1.5 rounded bg-gray-800/40 hover:bg-gray-800/70"
                  >
                    <KeyRound size={12} className="text-gray-500 shrink-0" />
                    <span className="font-mono text-gray-200">{k.name}</span>
                    {k.host && (
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          k.host === 'github.com'
                            ? 'bg-purple-900/40 text-purple-300'
                            : 'bg-orange-900/40 text-orange-300'
                        }`}
                      >
                        {k.host === 'github.com' ? 'GitHub' : 'Gitee'}
                      </span>
                    )}
                    {k.fingerprint && (
                      <span className="text-gray-500 truncate flex-1" title={k.fingerprint}>
                        {k.fingerprint.slice(0, 28)}…
                      </span>
                    )}
                    <button
                      onClick={() => {
                        if (k.host === 'github.com') setSshGithubKey(k.path);
                        else if (k.host === 'gitee.com') setSshGiteeKey(k.path);
                      }}
                      className="text-gray-500 hover:text-primary-300"
                      title={t('settings.sshUseThisKey') || 'Use'}
                    >
                      <CheckCircle2 size={12} />
                    </button>
                    <button
                      onClick={() => deleteExistingKey(k.path, k.name)}
                      disabled={deletingKeyPath === k.path}
                      className="text-gray-500 hover:text-red-400 disabled:opacity-50"
                      title={t('settings.sshDeleteKey') || 'Delete'}
                    >
                      {deletingKeyPath === k.path ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Trash2 size={12} />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* GitHub 私钥 */}
          <Field label={t('settings.sshGithubKey')} hint={t('settings.sshGithubKeyHint')}>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                value={sshGithubKey}
                onChange={(e) => setSshGithubKey(e.target.value)}
                placeholder="C:\\Users\\<user>\\.ssh\\id_ed25519_github"
              />
              <button
                onClick={() => {
                  setGenKeyName('id_ed25519_github');
                  setGenKeyComment('kunyao@kunyaogit.local (GitHub)');
                  setGenDialog({ host: 'github.com' });
                }}
                className="btn-secondary"
                title={t('settings.sshGenerateKey')}
              >
                <Terminal size={14} /> {t('settings.sshGenerateKey')}
              </button>
              <button
                onClick={() => testSshForHost('github.com', sshGithubKey || sshKeyPath)}
                disabled={testingHost !== null}
                className="btn-ghost"
              >
                {testingHost === 'github.com' ? <Loader2 size={14} className="animate-spin" /> : null}
                {t('settings.sshTestGithub')}
              </button>
            </div>
          </Field>

          {/* v0.6.3+ 生成结果卡片：放到对应 host 的 Field 下方（避免和『写入 ~/.ssh/config』按钮视觉混淆） */}
          {genResult?.host === 'github.com' && (
            <div className="border border-emerald-700/40 rounded p-3 bg-emerald-900/10 space-y-2">
              <div className="text-sm font-medium text-emerald-300">
                ✓ {t('settings.sshKeyGenerated')}（{genResult.fingerprint}）
              </div>
              <div className="text-xs text-gray-400">
                {t('settings.sshKeyGeneratedHint')}
                <a
                  className="text-primary-400 hover:underline ml-2"
                  onClick={() => window.gitgui.app.openExternal('https://github.com/settings/keys')}
                >
                  {t('settings.sshAddToGithub')} →
                </a>
              </div>
              <div className="text-xs text-gray-500">{t('settings.sshPublicKey')}：</div>
              <pre className="text-[11px] font-mono bg-gray-900/50 border border-gray-800 rounded p-2 break-all whitespace-pre-wrap max-h-32 overflow-auto">
                {genResult.publicKey}
              </pre>
              <div className="flex gap-2">
                <button onClick={() => copyPubkey(genResult.publicKey)} className="btn-secondary">
                  <Copy size={14} /> {t('settings.sshCopyToClipboard')}
                </button>
                <button onClick={() => setGenResult(null)} className="btn-ghost">
                  {t('common.close')}
                </button>
              </div>
            </div>
          )}

          {/* Gitee 私钥 */}
          <Field label={t('settings.sshGiteeKey')} hint={t('settings.sshGiteeKeyHint')}>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                value={sshGiteeKey}
                onChange={(e) => setSshGiteeKey(e.target.value)}
                placeholder="C:\\Users\\<user>\\.ssh\\id_ed25519_gitee"
              />
              <button
                onClick={() => {
                  setGenKeyName('id_ed25519_gitee');
                  setGenKeyComment('kunyao@kunyaogit.local (Gitee)');
                  setGenDialog({ host: 'gitee.com' });
                }}
                className="btn-secondary"
                title={t('settings.sshGenerateKey')}
              >
                <Terminal size={14} /> {t('settings.sshGenerateKey')}
              </button>
              <button
                onClick={() => testSshForHost('gitee.com', sshGiteeKey || sshKeyPath)}
                disabled={testingHost !== null}
                className="btn-ghost"
              >
                {testingHost === 'gitee.com' ? <Loader2 size={14} className="animate-spin" /> : null}
                {t('settings.sshTestGitee')}
              </button>
            </div>
          </Field>

          {/* v0.6.3+ 生成结果卡片：放到对应 host 的 Field 下方（避免和『写入 ~/.ssh/config』按钮视觉混淆） */}
          {genResult?.host === 'gitee.com' && (
            <div className="border border-emerald-700/40 rounded p-3 bg-emerald-900/10 space-y-2">
              <div className="text-sm font-medium text-emerald-300">
                ✓ {t('settings.sshKeyGenerated')}（{genResult.fingerprint}）
              </div>
              <div className="text-xs text-gray-400">
                {t('settings.sshKeyGeneratedHint')}
                <a
                  className="text-primary-400 hover:underline ml-2"
                  onClick={() => window.gitgui.app.openExternal('https://gitee.com/personal_access_tokens#ssh-key')}
                >
                  {t('settings.sshAddToGitee')} →
                </a>
              </div>
              <div className="text-xs text-gray-500">{t('settings.sshPublicKey')}：</div>
              <pre className="text-[11px] font-mono bg-gray-900/50 border border-gray-800 rounded p-2 break-all whitespace-pre-wrap max-h-32 overflow-auto">
                {genResult.publicKey}
              </pre>
              <div className="flex gap-2">
                <button onClick={() => copyPubkey(genResult.publicKey)} className="btn-secondary">
                  <Copy size={14} /> {t('settings.sshCopyToClipboard')}
                </button>
                <button onClick={() => setGenResult(null)} className="btn-ghost">
                  {t('common.close')}
                </button>
              </div>
            </div>
          )}

          {/* v0.6.3+ 删兜底 SSH 私钥路径 UI 字段
              - 上方已有按 host 的 GitHub / Gitee 私钥路径（推荐用法）
              - sshKeyPath 仍保留在 state + settings（兼容历史数据 / sshWriteConfig 兜底逻辑） */}

          {/* 协议偏好 */}
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

          {/* 底部操作 */}
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => saveSsh(true)} className="btn-primary">
              <Save size={14} /> {t('settings.sshWriteConfig')}
            </button>
            {sshTestResult && (
              <div className={`text-xs ${sshTestResult.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                {sshTestResult.msg}
              </div>
            )}
          </div>

          {/* 生成密钥对话框（内联展开） */}
          {genDialog && (
            <div className="border border-primary-700/40 rounded p-3 bg-primary-900/10 space-y-2">
              <div className="text-sm font-medium text-primary-300">
                {t('settings.sshGenerateKeyTitle')}（{genDialog.host}）
              </div>
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 items-center text-sm">
                <label className="text-gray-400">{t('settings.sshKeyName')}</label>
                <input
                  className="input"
                  value={genKeyName}
                  onChange={(e) => setGenKeyName(e.target.value)}
                  placeholder={t('settings.sshKeyNameHint')}
                />
                <label className="text-gray-400">{t('settings.sshKeyComment')}</label>
                <input
                  className="input"
                  value={genKeyComment}
                  onChange={(e) => setGenKeyComment(e.target.value)}
                />
                <label className="text-gray-400">{t('settings.sshKeyType')}</label>
                <div className="text-xs">{t('settings.sshKeyTypeEd25519')}</div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => generateNewKey(genDialog.host)}
                  disabled={genBusy || !genKeyName.trim()}
                  className="btn-primary"
                >
                  {genBusy ? <Loader2 size={14} className="animate-spin" /> : <Terminal size={14} />}
                  {t('settings.sshGenerate')}
                </button>
                <button onClick={() => setGenDialog(null)} className="btn-ghost">
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          )}
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
