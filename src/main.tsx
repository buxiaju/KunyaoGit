import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import App from './App';
import ErrorBoundary from './components/common/ErrorBoundary';
import { installGlobalErrorHandlers } from './lib/globalErrorHandler';
import './styles/index.css';

// 让 Monaco 使用本地包（默认从 jsdelivr CDN 拉，国内经常访问不到）
loader.config({ monaco });

// 全局兜底：未处理的 Promise rejection / 异步运行时错误
installGlobalErrorHandlers();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* 最外层错误边界：连 I18nProvider / HashRouter 自身出错也能兜住 */}
    <ErrorBoundary>
      <HashRouter>
        <App />
      </HashRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
