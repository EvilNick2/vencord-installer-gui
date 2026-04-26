import { useRef, useState } from 'react'
import HomePage from "./pages/HomePage";
import InstallPage from "./pages/InstallPage";
import BackupsPage from "./pages/BackupsPage";
import LogsPage from "./pages/LogsPage";
import DevTestsPage from "./pages/DevTestsPage";
import SettingsPage from "./pages/SettingsPage";
import TopNav from "./components/TopNav";
import './App.css'

type Page = 'home' | 'install' | 'backups' | 'logs' | 'settings' | 'devTests';

function App() {
  const [page, setPage] = useState<Page>('home');
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const settingsPendingRef = useRef(false);
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
        onUpdateClick={() => setUpdateModalOpen(true)}
      />
      <div className="app-body">
        <main className="app-content">
          <div className="page">
            {page === 'home' && <HomePage />}
            {page === 'install' && <InstallPage />}
            {page === 'backups' && <BackupsPage />}
            {page === 'logs' && <LogsPage />}
            {showDevTests && page === 'devTests' && <DevTestsPage />}
            {page === 'settings' && (
              <SettingsPage onPendingChange={updateSettingsPending} />
            )}
          </div>
        </main>
      </div>
      {updateModalOpen && (
        <div className="modal-backdrop" onClick={() => setUpdateModalOpen(false)}>
          <div className="modal-panel" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Application updates</h3>
              <button onClick={() => setUpdateModalOpen(false)}>✕</button>
            </div>
            <div style={{ padding: '20px', color: 'var(--text-muted)', fontSize: '13px' }}>
              TODO
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
