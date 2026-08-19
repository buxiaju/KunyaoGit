import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout/Layout';
import HomePage from './pages/HomePage';
import RepoPage from './pages/RepoPage';
import RemotePage from './pages/RemotePage';
import RepoDetailPage from './pages/RepoDetailPage';
import ReleasesPage from './pages/ReleasesPage';
import SettingsPage from './pages/SettingsPage';
import { useSettingsStore } from './stores/settings';
import { useEffect } from 'react';
import { Toaster } from './components/common/Toast';
import { UpdateDialog } from './components/common/UpdateDialog';
import { useUpdateCheck } from './hooks/useUpdateCheck';

export default function App() {
  const loadSettings = useSettingsStore((s) => s.load);
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useUpdateCheck();

  return (
    <>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="repo/*" element={<RepoPage />} />
          <Route path="remote/:platform" element={<RemotePage />} />
          <Route path="remote/:platform/:owner/:repo" element={<RepoDetailPage />} />
          <Route path="releases" element={<ReleasesPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <Toaster />
      <UpdateDialog />
    </>
  );
}
