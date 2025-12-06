import { useRef, useState } from 'react'
import HomePage from "./pages/HomePage";
import InstallPage from "./pages/InstallPage";
import LogsPage from "./pages/LogsPage";
import DevTestsPage from "./pages/DevTestsPage";
import SettingsPage from "./pages/SettingsPage";
import './App.css'

type Page = 'home' | 'install' | 'logs' | 'settings' | 'devTests';

function App() {
  const [page, setPage] = useState<Page>('home');
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

      if (!confirmLeave) {
        return;
      }
    }

    if (!showDevTests && nextPage === 'devTests') {
      return;
    }

    setPage(nextPage);
  };

  return (
    <div className='app-root'>
      <aside className='sidebar'>
        <h1 className='app-title'>Vencord Installer</h1>
        <nav>
          <button onClick={() => handleNavigate('home')}>Overview</button>
          <button onClick={() => handleNavigate('install')}>Install / Repair</button>
          <button onClick={() => handleNavigate('logs')}>Logs</button>
          {showDevTests && (
            <button onClick={() => handleNavigate('devTests')}>Development Tests</button>
          )}
          <button onClick={() => handleNavigate('settings')}>Settings</button>
        </nav>
      </aside>

      <main className='content'>
        {page === 'home' && <HomePage />}
        {page === 'install' && <InstallPage />}
        {page === 'logs' && <LogsPage />}
        {showDevTests && page === 'devTests' && <DevTestsPage />}
        {page === 'settings' && (
          <SettingsPage onPendingChange={(pending) => updateSettingsPending(pending)} />
        )}
      </main>
    </div>
  );
}

export default App;