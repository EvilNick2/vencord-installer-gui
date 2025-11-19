import { useEffect, useState } from 'react'
import { getDiscordInstalls } from "./api";
import type { DiscordInstall } from "./api";
import './App.css'

type Page = 'home' | 'install' | 'logs' | 'settings';

function App() {
  const [page, setPage] = useState<Page>('home');

  return (
    <div className='app-root'>
      <aside className='sidebar'>
        <h1 className='app-title'>Vencord Installer</h1>
        <nav>
          <button onClick={() => setPage('home')}>Overview</button>
          <button onClick={() => setPage('install')}>Install / Repair</button>
          <button onClick={() => setPage('logs')}>Logs</button>
          <button onClick={() => setPage('settings')}>Settings</button>
        </nav>
      </aside>

      <main className='content'>
        {page === 'home' && <HomePage />}
        {page === 'install' && <InstallPage />}
        {page === 'logs' && <LogsPage />}
        {page === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}

function HomePage() {
  return (
    <section>
      <h2>Overview</h2>
      <p>
        This is a placeholder UI for the Vencord installer. No real actions are wired up yet.
      </p>
      <ul>
        <li>Step 1: Detect Discord installations</li>
        <li>Step 2: Choose targets and options</li>
        <li>Step 3: Install / repair / uninstall</li>
      </ul>
    </section>
  );
}

function InstallPage() {
  const [installs, setInstalls] = useState<DiscordInstall[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    setLoading(true);
    getDiscordInstalls()
      .then((data) => {
        setInstalls(data);
        
        const stable = data.find((d) => d.id === "stable");
        if (stable) {
          setSelectedIds([stable.id]);
        } else {
          setSelectedIds([]);
        }
      })
      .catch((err) => {
        setError(String(err));
      })
      .finally(() => setLoading(false));
  }, []);

  const toggle = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <section>
      <h2>Install / Repair</h2>

      <div className="card">
        <h3>Detected Discord clients</h3>

        {loading && <p>Scanning for Discord installs...</p>}
        {error && <p className="error">Error: {error}</p>}
        {!loading && installs.length === 0 && !error && (
          <p>No Discord installations found.</p>
        )}

        <ul className="install-list">
          {installs.map((inst) => (
            <li key={inst.id}>
              <label>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(inst.id)}
                  onChange={() => toggle(inst.id)}
                />
                <span className="install-name">{inst.name}</span>
                <span className="install-path">{inst.path}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <h3>Options</h3>

        <label>
          <input type="checkbox" /> Create backup before patching
        </label>

        <label>
          <input type="checkbox" /> Auto-update Vencord
        </label>
      </div>

      <div className="actions">
        <button disabled={selectedIds.length === 0}>Install</button>
        <button disabled={selectedIds.length === 0}>Repair</button>
        <button disabled={selectedIds.length === 0}>Uninstall</button>
      </div>
    </section>
  );
}

function LogsPage() {
  return (
    <section>
      <h2>Logs</h2>
      <div className="logs-box">
        <pre>No logs yet. Installer backend not connected.</pre>
      </div>
    </section>
  );
}

function SettingsPage() {
  return (
    <section>
      <h2>Settings</h2>
      <p>Placeholder for future configuration.</p>
    </section>
  );
}

export default App;