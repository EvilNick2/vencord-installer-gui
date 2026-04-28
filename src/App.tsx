import { useEffect, useRef, useState } from 'react'
import { check } from '@tauri-apps/plugin-updater'
import HomePage from "./pages/HomePage";
import InstallPage from "./pages/InstallPage";
import BackupsPage from "./pages/BackupsPage";
import LogsPage from "./pages/LogsPage";
import DevTestsPage from "./pages/DevTestsPage";
import SettingsPage from "./pages/SettingsPage";
import TopNav from "./components/TopNav";
import UpdateModal from "./components/UpdateModal";
import './App.css'

type Page = 'home' | 'install' | 'backups' | 'logs' | 'settings' | 'devTests';

function App() {
  const [page, setPage] = useState<Page>('home');
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const settingsPendingRef = useRef(false);

  useEffect(() => {
    check().then(update => { if (update) setUpdateModalOpen(true); }).catch(() => {});
  }, []);
  const showDevTests = import.meta.env.DEV;

  const updateSettingsPending = (pending: boolean) => {
    settingsPendingRef.current = pending;
  }

  const handleNavigate = (nextPage: Page) => {
    if (page === 'settings' && nextPage !== 'settings' && settingsPendingRef.current) {
      const confirmLeave = window.confirm(
        'You have unsaved changed in settings. Leave without saving?'
      );
      if (!confirmLeave) return;
    }
    if (!showDevTests && nextPage === 'devTests') return;
    setPage(nextPage);
  };

  return (
    <div className="app-root">
      <TopNav
        activePage={page}
        onNavigate={handleNavigate}
        showDevTests={showDevTests}
      />
      <div className="app-body">
        <main className="app-content">
          {page === 'home' && <HomePage onNavigate={handleNavigate} onUpdateClick={() => setUpdateModalOpen(true)} />}
          {page !== 'home' && (
            <div className="page">
              {page === 'install' && <InstallPage />}
              {page === 'backups' && <BackupsPage />}
              {page === 'logs' && <LogsPage />}
              {showDevTests && page === 'devTests' && <DevTestsPage />}
              {page === 'settings' && (
                <SettingsPage onPendingChange={updateSettingsPending} />
              )}
            </div>
          )}
        </main>
      </div>
      <UpdateModal open={updateModalOpen} onClose={() => setUpdateModalOpen(false)} />
    </div>
  );
}

export default App;
