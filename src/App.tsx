import { useRef, useState } from 'react'
import HomePage from "./pages/HomePage";
import InstallPage from "./pages/InstallPage";
// import LogsPage from "./pages/LogsPage";
import DevTestsPage from "./pages/DevTestsPage";
import SettingsPage from "./pages/SettingsPage";
import Dock from "./components/Dock";
import './App.css'

import { House, FolderSync, ClipboardClock, FolderCode, Settings } from "lucide-react";

void ClipboardClock; // temporary

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

  const dockItems = [
    { icon: <House size={18} />, label: 'Home', onClick: () => handleNavigate('home') },
    { icon: <FolderSync size={18} />, label: 'Install', onClick: () => handleNavigate('install') },
    // { icon: <ClipboardClock size={18} />, label: 'Logs', onClick: () => handleNavigate('logs') },
    ...(showDevTests ? [{ icon: <FolderCode size={18} />, label: 'Dev Tests', onClick: () => handleNavigate('devTests') }] : []),
    { icon: <Settings size={18} />, label: 'Settings', onClick: () => handleNavigate('settings') }
  ]

  return (
    <div className='app-root'>
      <Dock
        items={dockItems}
        panelHeight={60}
        baseItemSize={50}
        magnification={55}
      />

      <main className="content">
        <div className="page">
          {page === 'home' && <HomePage />}
          {page === 'install' && <InstallPage />}
          {/* {page === 'logs' && <LogsPage />} */}
          {showDevTests && page === 'devTests' && <DevTestsPage />}
          {page === 'settings' && (
            <SettingsPage onPendingChange={(pending) => updateSettingsPending(pending)} />
          )}
        </div>
      </main>
    </div>
  );
}

export default App;