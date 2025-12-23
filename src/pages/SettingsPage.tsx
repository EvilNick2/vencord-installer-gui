import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";
import { FolderOpen } from "lucide-react";
import { getUserOptions, updateUserOptions } from "../api";
import type { UserOptions } from "../api";

const appendVencordFolder = (basePath: string) => {
  const trimmed = basePath.replace(/[\\/]+$/, "");
  const endsWithVencord = /(?:^|[\\/])Vencord$/i.test(trimmed);

  if (endsWithVencord) return trimmed || "Vencord";

  const separator = trimmed.includes("\\") && !trimmed.includes("/") ? "\\" : "/";

  if (!trimmed) return `Vencord`;

  return `${trimmed}${separator}Vencord`;
};

export default function SettingsPage({
  onPendingChange,
}: {
  onPendingChange?: (hasPending: boolean) => void;
}) {
  const [options, setOptions] = useState<UserOptions | null>(null);
  const [userReposText, setUserReposText] = useState('');
  const [userThemesText, setUserThemesText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [dirtyFields, setDirtyFields] = useState({ 
    repoUrl: false,
    repoDir: false,
    userRepos: false,
    userThemes: false,
  });

  useEffect(() => {
    getUserOptions()
      .then((data) => {
        setOptions(data);
        setUserReposText(data.userRepositories.join("\n"));
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, []);

  const hasPending =
    saving || dirtyFields.repoUrl || dirtyFields.repoDir || dirtyFields.userRepos || dirtyFields.userThemes;

  useEffect(() => {
    onPendingChange?.(hasPending);
  }, [hasPending, onPendingChange]);

  useEffect(() => () => {
    onPendingChange?.(false);
  }, [onPendingChange]);

  const saveOptions = async (
    nextOptions: UserOptions,
    {
      syncUserReposText,
      syncUserThemesText = false,
    }: { syncUserReposText: boolean; syncUserThemesText?: boolean },
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

      if (syncUserThemesText) {
        setUserThemesText(updated.userThemes.join("\n"));
      }

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

  const parseUserThemesText = () =>
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

  const onUserThemesBlur = async () => {
    if (!options || saving || !dirtyFields.userThemes) return;

    const themeList = parseUserThemesText();

    const nextOptions = {
      ...options,
      userThemes: themeList,
    };

    const saved = await saveOptions(nextOptions, {
      syncUserReposText: false,
      syncUserThemesText: true,
    });
    if (saved) {
      setDirtyFields((prev) => ({ ...prev, userThemes: false }));
    }
  };

  const onToggleCloseDiscord = async () => {
    if (!options || saving) return;

    const nextOptions: UserOptions = {
      ...options,
      closeDiscordOnBackup: !options.closeDiscordOnBackup,
    };

    await saveOptions(nextOptions, { syncUserReposText: false });
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
  };

  const onToggleProvidedTheme = async (id: string) => {
    if (!options || saving) return;

    const nextOptions: UserOptions = {
      ...options,
      providedThemes: options.providedThemes.map((entry) => 
        entry.id === id ? { ...entry, enabled: !entry.enabled } : entry
      ),
    };

    await saveOptions(nextOptions, { syncUserReposText: false });
  };

  const onChooseRepoDir = async () => {
    if (!options || saving) return;

    const selected = await open({
      directory: true,
      multiple: false,
      defaultPath: options.vencordRepoDir,
    });

    if (!selected || Array.isArray(selected)) return;

    const nextOptions = { ...options, vencordRepoDir: appendVencordFolder(selected) };
    setOptions(nextOptions);
    setDirtyFields((prev) => ({ ...prev, repoDir: true }));
    setMessage(null);

    const saved = await saveOptions(nextOptions, { syncUserReposText: false });
    if (saved) {
      setDirtyFields((prev) => ({ ...prev, repoDir: false }))
    }
  }

  return (
    <section>
      <h2>Settings</h2>
      {loading && <p>Loading current options...</p>}
      {error && <p className='error'>Error: {error}</p>}

      {!loading && options && (
        <>
          <div className="card">
            <h3>Vencord repository</h3>
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

            <div className="form-field">
              <label htmlFor="vencord-repo-dir">Clone destination</label>
              <div className="input-row input-row--icon">
                <input
                  id="vencord-repo-dir"
                  className="text-input"
                  value={options.vencordRepoDir}
                  onChange={(e) => {
                    setOptions({ ...options, vencordRepoDir: e.target.value });
                    setDirtyFields((prev) => ({ ...prev, repoDir: true }));
                    setMessage(null);
                  }}
                  onBlur={async () => {
                    if (!options || saving || !dirtyFields.repoDir) return;

                    const saved = await saveOptions(options, { syncUserReposText: false });
                    if (saved) {
                      setDirtyFields((prev) => ({ ...prev, repoDir: false }));
                    }
                  }}
                  placeholder="e.g., C:/Users/user/Documents/Vencord"
                />
                <button
                  type="button"
                  onClick={onChooseRepoDir}
                  disabled={saving}
                  className="input-icon-button"
                  aria-label="Choose folder"
                >
                  <FolderOpen size={18} />
                </button>
              </div>
              <small className="helper-text" aria-live="polite">
                <p>The installer will clone or update the Vencord source directly at this path, using the folder name you provide</p>
                <p>Defaults to your home directory</p>
              </small>
            </div>
          </div>

          <div className="card">
            <h3>Provided repositories</h3>
            <div className='form-field'>
              <label>Included plguin sources</label>
              <ul className='settings-list'>
                {options.providedRepositories.map((repo) => (
                  <li key={repo.id} className='settings-list-item'>
                    <label className='settings-row'>
                      <input
                        type='checkbox'
                        checked={repo.enabled}
                        disabled={saving}
                        onChange={() => onToggleProvidedRepo(repo.id)}
                      />
                      <div className='settings-meta'>
                        <div className='settings-title'>{repo.name}</div>
                        <div className='settings-url'>{repo.url}</div>
                        <p className='settings-list-description'>{repo.description}</p>
                      </div>
                    </label>
                  </li>
                ))}
              </ul>
              <small>
                Toggle which bundled repositories should be used. This list may change with app updates if a repositories is added, removed, or marked unstable
              </small>
            </div>
          </div>

          <div className="card">
            <h3>Provided themes</h3>
            <div className='form-field'>
              <label>Included themes</label>
              <ul className='settings-list'>
                {options.providedThemes.map((theme) => (
                  <li key={theme.id} className='settings-list-item'>
                    <label className='settings-row'>
                      <input
                        type='checkbox'
                        checked={theme.enabled}
                        disabled={saving}
                        onChange={() => onToggleProvidedTheme(theme.id)}
                      />
                      <div className='settings-meta'>
                        <div className='settings-title'>{theme.name}</div>
                        <div className='settings-url'>{theme.url}</div>
                        <p className='settings-list-description'>{theme.description}</p>
                      </div>
                    </label>
                  </li>
                ))}
              </ul>
              <small>Toggle which bundled themes should be downloaded after patching</small>
            </div>
          </div>

          <div className="card">
            <h3>Custom themes</h3>
            <div className='form-field'>
              <label htmlFor='user-themes'>Custom user themes</label>
              <textarea
                id='user-themes'
                className='text-area'
                rows={5}
                value={userThemesText}
                onChange={(e) => {
                  setUserThemesText(e.target.value);
                  setDirtyFields((prev) => ({ ...prev, userThemes: true }));
                  setMessage(null);
                }}
                onBlur={onUserThemesBlur}
                placeholder='One theme URL per line'
              />
              <small>Each entry will be stored in the user options file and downloaded after patching</small>
            </div>
          </div>
          
          <div className="card">
            <h3>Custom repositories</h3>
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
          </div>

          <div className="card">
            <h3>Discord handling</h3>
            <div className="form-field">
              <ul className="settings-list">
                <li className="settings-list-item">
                  <label className="settings-list-row checkbox-row" htmlFor="close-discord">
                    <input
                      id="close-discord"
                      type="checkbox"
                      checked={options.closeDiscordOnBackup}
                      disabled={saving}
                      onChange={onToggleCloseDiscord}
                    />
                    <div>
                      <div className="checkbox-title">Close Discord clients before backup</div>
                      <small>
                        When enabled, the installer will temporarily close Discord instance before moving Vencord files and then reopen them afterward
                      </small>
                    </div>
                  </label>
                </li>
              </ul>
            </div>
          </div>

          {message && <p className='status-text'>{message}</p>}
        </>
      )}
    </section>
  );
}
