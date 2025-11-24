import { useEffect, useRef, useState } from 'react'
import { getDiscordInstalls, getUserOptions, updateUserOptions } from './api';
import type { DiscordInstall, UserOptions } from './api';
import './App.css'

type Page = 'home' | 'install' | 'logs' | 'settings';

function App() {
  const [page, setPage] = useState<Page>('home');
  const settingsPendingRef = useRef(false);

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
          <button onClick={() => handleNavigate('settings')}>Settings</button>
        </nav>
      </aside>

      <main className='content'>
        {page === 'home' && <HomePage />}
        {page === 'install' && <InstallPage />}
        {page === 'logs' && <LogsPage />}
        {page === 'settings' && (
          <SettingsPage onPendingChange={(pending) => updateSettingsPending(pending)} />
        )}
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

type LogEntry = {
  time: string;
  label: string;
  message: string;
};

type LogPanel = {
  id: string;
  title: string;
  status: 'pending' | 'ready' | 'info';
  statusText: string;
  description: string;
  nextSteps: string;
  entries: LogEntry[];
};

function LogsPage() {
  const panels: LogPanel[] = [
    {
      id: 'backup',
      title: 'Backup current Vencord install',
      status: 'pending',
      statusText: 'Awaiting wiring',
      description:
        'Prepare to capture the existing Vencord files before applying changes so we can roll back.',
      nextSteps: 'Connect the backup command to stream output here.',
      entries: [
        {
          time: '12:30:02',
          label: 'plan',
          message: 'Queued backup flow; waiting for backend hook.',
        },
        {
          time: '12:29:55',
          label: 'hint',
          message: 'Will archive the current Vencord directory before patching.',
        },
      ],
    },
    {
      id: 'clone',
      title: 'Clone upstream repo',
      status: 'pending',
      statusText: 'Planned',
      description:
        'Logs for fetching the official Vencord repository so installs can use the freshest code.',
      nextSteps: 'Surface git output once the upstream clone command lands.',
      entries: [
        {
          time: '12:31:18',
          label: 'plan',
          message: 'Scheduled to run git clone or git pull during setup.',
        },
        {
          time: '12:31:08',
          label: 'note',
          message: 'Add streaming so progress and failures appear here.',
        },
      ],
    },
    {
      id: 'installer',
      title: 'Installer session',
      status: 'ready',
      statusText: 'UI ready',
      description:
        'General logs for installer actions, health checks, and user-visible events.',
      nextSteps: 'Wire Tauri log events to this feed.',
      entries: [
        {
          time: '12:32:10',
          label: 'info',
          message: 'Log UI ready to receive events.',
        },
        {
          time: '12:32:01',
          label: 'ui',
          message: 'Added separate panels for backup and repo sync.',
        },
        {
          time: '12:31:52',
          label: 'todo',
          message: 'Hook into backend streams for real-time output.',
        },
      ],
    },
  ];

  return (
    <section className='logs-section'>
      <header className='logs-header'>
        <div>
          <h2>Logs</h2>
          <p>
            A dedicated space for streaming installer output. Use this page to monitor backup,
            clone, and runtime tasks once the backend hooks are connected.
          </p>
        </div>
      </header>

      <div className='log-grid'>
        {panels.map((panel) => (
          <article key={panel.id} className='card log-card'>
            <header className='log-card__header'>
              <div>
                <h3>{panel.title}</h3>
                <p className='log-card__description'>{panel.description}</p>
              </div>
              <span className={`status-pill status-${panel.status}`}>
                {panel.statusText}
              </span>
            </header>

            <div className='log-card__meta'>
              <div>
                <small>Next step</small>
                <div className='log-card__next'>{panel.nextSteps}</div>
              </div>
              <div>
                <small>Entries</small>
                <div className='log-card__count'>{panel.entries.length}</div>
              </div>
            </div>

            <div className='logs-box log-scroll'>
              <ul className='log-list'>
                {panel.entries.map((entry, idx) => (
                  <li key={`${panel.id}-${idx}`} className='log-entry'>
                    <span className='log-time'>{entry.time}</span>
                    <span className='log-label'>{entry.label}</span>
                    <span className='log-message'>{entry.message}</span>
                  </li>
                ))}
                {panel.entries.length === 0 && (
                  <li className='log-entry log-entry--muted'>Waiting for events...</li>
                )}
              </ul>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function SettingsPage({
  onPendingChange,
}: {
  onPendingChange?: (hasPending: boolean) => void;
}) {
  const [options, setOptions] = useState<UserOptions | null>(null);
  const [userReposText, setUserReposText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [dirtyFields, setDirtyFields] = useState({ repoUrl: false, userRepos: false });

  useEffect(() => {
    getUserOptions()
      .then((data) => {
        setOptions(data);
        setUserReposText(data.userRepositories.join("\n"));
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, []);

  const hasPending = saving || dirtyFields.repoUrl || dirtyFields.userRepos;

  useEffect(() => {
    onPendingChange?.(hasPending);
  }, [hasPending, onPendingChange]);

  useEffect(() => () => {
    onPendingChange?.(false);
  }, [onPendingChange]);

  const saveOptions = async (
    nextOptions: UserOptions,
    { syncUserReposText }: { syncUserReposText: boolean },
  ): Promise<boolean> => {
    setSaving(true);
    setError(null);
    setMessage(null);

    setOptions(nextOptions);

    try {
      const updated = await updateUserOptions(nextOptions);
      setOptions(updated);

      if (syncUserReposText) {
        setUserReposText(updated.userRepositories.join("\n"));
      }

      setMessage('Options saved');
      return true;
    } catch (err) {
      setError(String(err));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const parseUserReposText = () =>
    userReposText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

  const onRepoUrlBlur = async () => {
    if (!options || saving || !dirtyFields.repoUrl) return;

    const saved = await saveOptions(options, { syncUserReposText: false });
    if (saved) {
      setDirtyFields((prev) => ({ ...prev, repoUrl: false }));
    }
  };

  const onUserReposBlur = async () => {
    if (!options || saving || !dirtyFields.userRepos) return;

    const repoList = parseUserReposText();

    const nextOptions = {
      ...options,
      userRepositories: repoList,
    };

    const saved = await saveOptions(nextOptions, { syncUserReposText: true });
    if (saved) {
      setDirtyFields((prev) => ({ ...prev, userRepos: false }));
    }
  };

  const onToggleProvidedRepo = async (id: string) => {
    if (!options || saving) return;

    const nextOptions: UserOptions = {
      ...options,
      providedRepositories: options.providedRepositories.map((entry) =>
        entry.id === id ? { ...entry, enabled: !entry.enabled } : entry
      ),
    };

    await saveOptions(nextOptions, { syncUserReposText: false });
  }

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
                onChange={(e) => {
                  setOptions({ ...options, vencordRepoUrl: e.target.value });
                  setDirtyFields((prev) => ({ ...prev, repoUrl: true }));
                  setMessage(null);
                }}
                onBlur={onRepoUrlBlur}
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
                        disabled={saving}
                        onChange={() => onToggleProvidedRepo(repo.id)}
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
                onChange={(e) => {
                  setUserReposText(e.target.value);
                  setDirtyFields((prev) => ({ ...prev, userRepos: true }));
                  setMessage(null);
                }}
                onBlur={onUserReposBlur}
                placeholder='One repository per line'
              />
              <small>Each entry will be stored in the user options file for installer use</small>
            </div>

            {message && <p className='status-text'>{message}</p>}
          </>
        )}
      </div>
    </section>
  );
}

export default App;