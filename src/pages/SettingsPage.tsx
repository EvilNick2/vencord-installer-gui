import { useEffect, useState } from "react";
import { getUserOptions, updateUserOptions } from "../api";
import type { UserOptions } from "../api";

export default function SettingsPage({
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

            <div className="form-field checkbox-field">
              <label className="checkbox_row" htmlFor="close-discord">
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
            </div>

            {message && <p className='status-text'>{message}</p>}
          </>
        )}
      </div>
    </section>
  );
}