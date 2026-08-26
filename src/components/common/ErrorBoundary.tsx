// React 错误边界（健壮性加固）
//
// 背景：项目原本没有任何 ErrorBoundary。React 的默认行为是——渲染期抛出的异常
// 会卸载整棵组件树，用户看到的就是**纯白屏**，没有任何提示，也没有恢复入口，
// 只能强杀进程重启。而本项目有大量 `data.map()` 直接渲染 IPC 返回值的代码，
// 一旦主进程返回意外结构就会触发这种情况。
//
// 设计要点：
//   1. 必须是 class 组件——只有 class 才有 getDerivedStateFromError/componentDidCatch。
//   2. **绝不依赖 i18n Context**：`useI18n()` 在缺少 Provider 时会主动 throw，
//      若兜底 UI 依赖它，那么 I18nProvider 自身出错时兜底会二次崩溃。
//      因此这里内联极简双语文案，只靠 props 传入语言。
//   3. 同理不依赖主题 CSS 变量，关键配色用内联 style 兜底。
//   4. 提供三条恢复路径：重试渲染 / 重载界面 / 复制诊断信息。

import { Component, type ErrorInfo, type ReactNode } from 'react';

const TEXT = {
  zh: {
    title: '界面出现异常',
    desc: '这一部分界面渲染失败了。你的仓库数据没有受到影响。',
    retry: '重试',
    reload: '重新加载界面',
    copy: '复制诊断信息',
    copied: '已复制',
    detail: '查看技术细节',
  },
  en: {
    title: 'Something went wrong',
    desc: 'This part of the UI failed to render. Your repository data is unaffected.',
    retry: 'Retry',
    reload: 'Reload UI',
    copy: 'Copy diagnostics',
    copied: 'Copied',
    detail: 'Technical details',
  },
} as const;

interface Props {
  children: ReactNode;
  /** 界面语言。不从 Context 读取，避免依赖可能已损坏的上层。 */
  lang?: 'zh' | 'en';
  /** 出错时的额外回调（用于测试或上报）。 */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
  error: Error | null;
  componentStack: string;
  copied: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: '', copied: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack || '' });
    // main.ts 的 'console-message' 监听会把渲染层 console 转发到主进程日志，
    // 所以这里 console.error 等于同时落盘，便于事后排障。
    console.error('[ErrorBoundary]', error.message, error.stack, info.componentStack);
    this.props.onError?.(error, info);
  }

  private handleRetry = () => {
    this.setState({ error: null, componentStack: '', copied: false });
  };

  private handleReload = () => {
    window.location.reload();
  };

  private handleCopy = async () => {
    const { error, componentStack } = this.state;
    const text = [
      `KunyaoGit UI Error`,
      `time: ${new Date().toISOString()}`,
      `message: ${error?.message ?? ''}`,
      `stack: ${error?.stack ?? ''}`,
      `componentStack: ${componentStack}`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      this.setState({ copied: true });
    } catch {
      // 剪贴板不可用时静默失败，不再抛出
    }
  };

  render() {
    const { error, componentStack, copied } = this.state;
    if (!error) return this.props.children;

    const t = TEXT[this.props.lang === 'en' ? 'en' : 'zh'];

    return (
      <div
        role="alert"
        className="flex h-full w-full flex-col items-center justify-center gap-4 p-8"
        style={{ backgroundColor: 'rgb(17 24 39)', color: 'rgb(243 244 246)', minHeight: '240px' }}
      >
        <div className="max-w-xl w-full rounded-lg border border-red-500/40 bg-red-500/5 p-6">
          <h2 className="mb-2 text-lg font-semibold" style={{ color: 'rgb(248 113 113)' }}>
            {t.title}
          </h2>
          <p className="mb-4 text-sm opacity-80">{t.desc}</p>

          <p className="mb-4 break-all rounded bg-black/30 p-3 font-mono text-xs opacity-90">
            {error.message || String(error)}
          </p>

          <div className="mb-4 flex flex-wrap gap-2">
            <button
              onClick={this.handleRetry}
              className="rounded px-3 py-1.5 text-sm font-medium"
              style={{ backgroundColor: 'rgb(16 185 129)', color: 'rgb(6 78 59)' }}
            >
              {t.retry}
            </button>
            <button
              onClick={this.handleReload}
              className="rounded border border-white/20 px-3 py-1.5 text-sm hover:bg-white/10"
            >
              {t.reload}
            </button>
            <button
              onClick={this.handleCopy}
              className="rounded border border-white/20 px-3 py-1.5 text-sm hover:bg-white/10"
            >
              {copied ? t.copied : t.copy}
            </button>
          </div>

          {(error.stack || componentStack) && (
            <details className="text-xs opacity-70">
              <summary className="cursor-pointer select-none">{t.detail}</summary>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-black/30 p-3">
                {error.stack}
                {componentStack}
              </pre>
            </details>
          )}
        </div>
      </div>
    );
  }
}
