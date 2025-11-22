import { useEffect, useState } from 'react'
import { getDiscordInstalls, getUserOptions, updateUserOptions } from './api';
import type { DiscordInstall, UserOptions } from './api';
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    getDiscordInstalls()
      .then((data) => {
        setInstalls(data);
        
        const stable = data.find((d) => d.id === 'stable');
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

      <div className='card'>
        <h3>Detected Discord clients</h3>

        {loading && <p>Scanning for Discord installs...</p>}
        {error && <p className='error'>Error: {error}</p>}
        {!loading && installs.length === 0 && !error && (
          <p>No Discord installations found.</p>
        )}

        <ul className='install-list'>
          {installs.map((inst) => (
            <li key={inst.id}>
              <label>
                <input
                  type='checkbox'
                  checked={selectedIds.includes(inst.id)}
                  onChange={() => toggle(inst.id)}
                />
                <span className='install-name'>{inst.name}</span>
                <span className='install-path'>{inst.path}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>

      <div className='card'>
        <h3>Options</h3>

        <label>
          <input type='checkbox' /> Create backup before patching
        </label>

        <label>
          <input type='checkbox' /> Auto-update Vencord
        </label>
      </div>

      <div className='actions'>
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
      <div className='logs-box'>
        <pre>No logs yet. Installer backend not connected.</pre>
      </div>
    </section>
  );
}

function SettingsPage() {
  const [options, setOptions] = useState<UserOptions | null>(null);
  const [userReposText, setUserReposText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    getUserOptions()
      .then((data) => {
        setOptions(data);
        setUserReposText(data.userRepositories.join("\n"));
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, []);

  const onSave = async () => {
    if (!options) return;

    setSaving(true);
    setError(null);
    setMessage(null);

    const repoList = userReposText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
      
    try {
      const updated = await updateUserOptions({
        ...options,
        userRepositories: repoList,
      });

      setOptions(updated);
      setMessage('Options saved');
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <h2>Settings</h2>
      <div className='card'>
        <h3>User options file</h3>
        {loading && <p>Loading current options...</p>}
        {error && <p className='error'>Error: {error}</p>}

        {!loading && options && (
          <>
            <div className='form-field'>
              <label htmlFor='vencord-repo'>Vencord Git clone URL</label>
              <input
                id='vencord-repo'
                className='text-input'
                value={options.vencordRepoUrl}
                onChange={(e) => setOptions({ ...options, vencordRepoUrl: e.target.value })}
              />
              <small>Used when cloning the Vencord source during install/update</small>
            </div>

            <div className='form-field'>
              <label>Provided repositories</label>
              <ul className='repo-list'>
                {options.providedRepositories.map((repo) => (
                  <li key={repo.id} className='repo-list-item'>
                    <label className='repo-row'>
                      <input
                        type='checkbox'
                        checked={repo.enabled}
                        onChange={() =>
                          setOptions({
                            ...options,
                            providedRepositories: options.providedRepositories.map((entry) =>
                              entry.id === repo.id ? { ...entry, enabled: !repo.enabled } : entry
                            ),
                          })
                        }
                      />
                      <div className='repo-meta'>
                        <div className='repo-title'>{repo.name}</div>
                        <div className='repo-url'>{repo.url}</div>
                        <p className='repo-description'>{repo.description}</p>
                      </div>
                    </label>
                  </li>
                ))}
              </ul>
              <small>
                Toggle which bundled repositories should be used. This list may change with app updates if a repositories is added, removed, or marked unstable
              </small>
            </div>

            <div className='form-field'>
              <label htmlFor='user-repos'>Custom user plugin repositories</label>
              <textarea
                id='user-repos'
                className='text-area'
                rows={5}
                value={userReposText}
                onChange={(e) => setUserReposText(e.target.value)}
                placeholder='One repository per line'
              />
              <small>Each entry will be stored in the user options file for installer use</small>
            </div>

            <div className='actions'>
              <button onClick={onSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save options'}
              </button>
            </div>

            {message && <p className='status-text'>{message}</p>}
          </>
        )}
      </div>
    </section>
  );
}

export default App;