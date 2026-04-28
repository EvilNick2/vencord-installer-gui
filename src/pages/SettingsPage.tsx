import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";
import { FolderOpen, GitBranch, Palette, Archive, FileText, Monitor } from "lucide-react";
import { getUserOptions, updateUserOptions } from "../api";
import type { UserOptions } from "../api";

const appendVencordFolder = (basePath: string) => {
  const trimmed = basePath.replace(/[\\/]+$/, "");
  const endsWithVencord = /(?:^|[\\/])Vencord$/i.test(trimmed);
  if (endsWithVencord) return trimmed || "Vencord";
  const separator = trimmed.includes("\\") && !trimmed.includes("/") ? "\\" : "/";
  if (!trimmed) return "Vencord";
  return `${trimmed}${separator}Vencord`;
};

type SettingsCategory = "repositories" | "themes" | "backups" | "runlogs" | "discord";

type CategoryDef = {
  id: SettingsCategory;
  label: string;
  section: string;
  subtitle: string;
  icon: React.ReactNode;
};

const CATEGORIES: CategoryDef[] = [
  {
    id: "repositories",
    label: "Repositories",
    section: "Source",
    subtitle: "Configure where Vencord is cloned from and additional plugin sources",
    icon: <GitBranch size={14} />,
  },
  {
    id: "themes",
    label: "Themes",
    section: "Source",
    subtitle: "Choose which themes are downloaded after patching",
    icon: <Palette size={14} />,
  },
  {
    id: "backups",
    label: "Backups",
    section: "Storage",
    subtitle: "Control how many backup copies are kept",
    icon: <Archive size={14} />,
  },
  {
    id: "runlogs",
    label: "Run Logs",
    section: "Storage",
    subtitle: "Control how many run logs are retained",
    icon: <FileText size={14} />,
  },
  {
    id: "discord",
    label: "Discord",
    section: "Behaviour",
    subtitle: "Configure Discord process behaviour",
    icon: <Monitor size={14} />,
  },
];

const SECTIONS = ["Source", "Storage", "Behaviour"] as const;

export default function SettingsPage({
  onPendingChange,
}: {
  onPendingChange?: (hasPending: boolean) => void;
}) {
  const [options, setOptions] = useState<UserOptions | null>(null);
  const [userReposText, setUserReposText] = useState("");
  const [userThemesText, setUserThemesText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>("repositories");
  const [dirtyFields, setDirtyFields] = useState({
    repoUrl: false,
    repoDir: false,
    userRepos: false,
    userThemes: false,
    maxBackupCount: false,
    maxBackupSizeMb: false,
    maxRunLogCount: false,
  });

  useEffect(() => {
    getUserOptions()
      .then((data) => {
        setOptions(data);
        setUserReposText(data.userRepositories.join("\n"));
        setUserThemesText(data.userThemes.join("\n"));
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, []);

  const hasPending =
    saving ||
    dirtyFields.repoUrl || dirtyFields.repoDir || dirtyFields.userRepos ||
    dirtyFields.userThemes || dirtyFields.maxBackupCount ||
    dirtyFields.maxBackupSizeMb || dirtyFields.maxRunLogCount;

  useEffect(() => { onPendingChange?.(hasPending); }, [hasPending, onPendingChange]);
  useEffect(() => () => { onPendingChange?.(false); }, [onPendingChange]);

  const saveOptions = async (
    nextOptions: UserOptions,
    { syncUserReposText, syncUserThemesText = false }: { syncUserReposText: boolean; syncUserThemesText?: boolean },
  ): Promise<boolean> => {
    setSaving(true);
    setError(null);
    setOptions(nextOptions);
    try {
      const updated = await updateUserOptions(nextOptions);
      setOptions(updated);
      if (syncUserReposText) setUserReposText(updated.userRepositories.join("\n"));
      if (syncUserThemesText) setUserThemesText(updated.userThemes.join("\n"));
      return true;
    } catch (err) {
      setError(String(err));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const parseLines = (text: string) =>
    text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

  const parseNumberInput = (value: string) => {
    if (value.trim() === "") return null;
    const parsed = Number(value);
    if (Number.isNaN(parsed) || parsed < 0) return null;
    return Math.floor(parsed);
  };

  const onChooseRepoDir = async () => {
    if (!options || saving) return;
    const selected = await open({ directory: true, multiple: false, defaultPath: options.vencordRepoDir });
    if (!selected || Array.isArray(selected)) return;
    const nextOptions = { ...options, vencordRepoDir: appendVencordFolder(selected) };
    setOptions(nextOptions);
    setDirtyFields((p) => ({ ...p, repoDir: true }));
    const saved = await saveOptions(nextOptions, { syncUserReposText: false });
    if (saved) setDirtyFields((p) => ({ ...p, repoDir: false }));
  };

  const activeDef = CATEGORIES.find((c) => c.id === activeCategory)!;

  return (
    <section>
      <div style={{ marginBottom: "1rem" }}>
        <div className="page-heading">Settings</div>
        <div style={{ fontSize: "0.6875rem", color: "var(--text-faint)", marginTop: "2px" }}>
          Configure repositories, themes, backups and behaviour
        </div>
      </div>

      <div className="settings-layout">
        <nav className="settings-nav">
          {SECTIONS.map((section) => (
            <div key={section}>
              <div className="settings-nav-section">{section}</div>
              {CATEGORIES.filter((c) => c.section === section).map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  className={`settings-nav-item${activeCategory === cat.id ? " active" : ""}`}
                  onClick={() => setActiveCategory(cat.id)}
                >
                  {cat.icon}
                  {cat.label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="settings-content">
          <div className="settings-content-header">
            <div className="settings-content-title">{activeDef.label}</div>
            <div className="settings-content-sub">{activeDef.subtitle}</div>
          </div>

          <div className="settings-content-body">
            {loading && <p>Loading settings...</p>}
            {error && <p className="error">Error: {error}</p>}

            {!loading && options && (
              <>
                {activeCategory === "repositories" && (
                  <>
                    <div className="form-field">
                      <label htmlFor="vencord-repo-url">Vencord Repository URL</label>
                      <small>The main repo that gets cloned and built</small>
                      <input
                        id="vencord-repo-url"
                        className="text-input"
                        value={options.vencordRepoUrl}
                        onChange={(e) => { setOptions({ ...options, vencordRepoUrl: e.target.value }); setDirtyFields((p) => ({ ...p, repoUrl: true })); }}
                        onBlur={async () => {
                          if (!options || saving || !dirtyFields.repoUrl) return;
                          const saved = await saveOptions(options, { syncUserReposText: false });
                          if (saved) setDirtyFields((p) => ({ ...p, repoUrl: false }));
                        }}
                      />
                    </div>

                    <div className="form-field">
                      <label htmlFor="vencord-repo-dir">Clone Destination</label>
                      <small>Where the repo is stored locally</small>
                      <div className="input-row input-row--icon">
                        <input
                          id="vencord-repo-dir"
                          className="text-input"
                          value={options.vencordRepoDir}
                          onChange={(e) => { setOptions({ ...options, vencordRepoDir: e.target.value }); setDirtyFields((p) => ({ ...p, repoDir: true })); }}
                          onBlur={async () => {
                            if (!options || saving || !dirtyFields.repoDir) return;
                            const saved = await saveOptions(options, { syncUserReposText: false });
                            if (saved) setDirtyFields((p) => ({ ...p, repoDir: false }));
                          }}
                          placeholder="e.g., /home/user/Vencord"
                        />
                        <button type="button" onClick={onChooseRepoDir} disabled={saving} className="input-icon-button" aria-label="Choose folder">
                          <FolderOpen size={18} />
                        </button>
                      </div>
                    </div>

                    <div className="form-field">
                      <label htmlFor="user-repos">Additional Plugin Repositories</label>
                      <small>Extra repos merged in at build time. One URL per line.</small>
                      <textarea
                        id="user-repos"
                        className="text-area"
                        rows={4}
                        value={userReposText}
                        onChange={(e) => { setUserReposText(e.target.value); setDirtyFields((p) => ({ ...p, userRepos: true })); }}
                        onBlur={async () => {
                          if (!options || saving || !dirtyFields.userRepos) return;
                          const saved = await saveOptions({ ...options, userRepositories: parseLines(userReposText) }, { syncUserReposText: true });
                          if (saved) setDirtyFields((p) => ({ ...p, userRepos: false }));
                        }}
                        placeholder="One repository URL per line"
                      />
                    </div>

                    {options.providedRepositories.map((repo) => (
                      <button
                        key={repo.id}
                        type="button"
                        className={`selectable-item${repo.enabled ? " selected" : ""}`}
                        disabled={saving}
                        onClick={async () => {
                          if (!options || saving) return;
                          await saveOptions({
                            ...options,
                            providedRepositories: options.providedRepositories.map((e) =>
                              e.id === repo.id ? { ...e, enabled: !e.enabled } : e
                            ),
                          }, { syncUserReposText: false });
                        }}
                      >
                        <div className="selectable-check">
                          <div className="selectable-check-mark" />
                        </div>
                        <div className="toggle-info">
                          <div className="toggle-name">{repo.name}</div>
                          <div className="toggle-desc">{repo.description}</div>
                        </div>
                      </button>
                    ))}
                  </>
                )}

                {activeCategory === "themes" && (
                  <>
                    <div className="form-field">
                      <label htmlFor="user-themes">Custom Theme URLs</label>
                      <small>Downloaded after patching. One URL per line.</small>
                      <textarea
                        id="user-themes"
                        className="text-area"
                        rows={4}
                        value={userThemesText}
                        onChange={(e) => { setUserThemesText(e.target.value); setDirtyFields((p) => ({ ...p, userThemes: true })); }}
                        onBlur={async () => {
                          if (!options || saving || !dirtyFields.userThemes) return;
                          const saved = await saveOptions({ ...options, userThemes: parseLines(userThemesText) }, { syncUserReposText: false, syncUserThemesText: true });
                          if (saved) setDirtyFields((p) => ({ ...p, userThemes: false }));
                        }}
                        placeholder="One theme URL per line"
                      />
                    </div>

                    {options.providedThemes.map((theme) => (
                      <button
                        key={theme.id}
                        type="button"
                        className={`selectable-item${theme.enabled ? " selected" : ""}`}
                        disabled={saving}
                        onClick={async () => {
                          if (!options || saving) return;
                          await saveOptions({
                            ...options,
                            providedThemes: options.providedThemes.map((e) =>
                              e.id === theme.id ? { ...e, enabled: !e.enabled } : e
                            ),
                          }, { syncUserReposText: false });
                        }}
                      >
                        <div className="selectable-check">
                          <div className="selectable-check-mark" />
                        </div>
                        <div className="toggle-info">
                          <div className="toggle-name">{theme.name}</div>
                          <div className="toggle-desc">{theme.description}</div>
                        </div>
                      </button>
                    ))}
                  </>
                )}

                {activeCategory === "backups" && (
                  <>
                    <div className="form-field">
                      <label htmlFor="max-backup-count">Maximum backups to keep</label>
                      <small>Leave blank for unlimited. Older backups are pruned first.</small>
                      <input
                        id="max-backup-count"
                        type="number"
                        className="text-input"
                        min={0}
                        value={options.maxBackupCount ?? ""}
                        onChange={(e) => { setOptions({ ...options, maxBackupCount: parseNumberInput(e.target.value) }); setDirtyFields((p) => ({ ...p, maxBackupCount: true })); }}
                        onBlur={async () => {
                          if (!options || saving || !dirtyFields.maxBackupCount) return;
                          const saved = await saveOptions(options, { syncUserReposText: false });
                          if (saved) setDirtyFields((p) => ({ ...p, maxBackupCount: false }));
                        }}
                        placeholder="Unlimited"
                      />
                    </div>

                    <div className="form-field">
                      <label htmlFor="max-backup-size">Maximum backup size (MB)</label>
                      <small>Oldest backups are pruned when the total size exceeds this. Leave blank for no limit.</small>
                      <input
                        id="max-backup-size"
                        type="number"
                        className="text-input"
                        min={0}
                        value={options.maxBackupSizeMb ?? ""}
                        onChange={(e) => { setOptions({ ...options, maxBackupSizeMb: parseNumberInput(e.target.value) }); setDirtyFields((p) => ({ ...p, maxBackupSizeMb: true })); }}
                        onBlur={async () => {
                          if (!options || saving || !dirtyFields.maxBackupSizeMb) return;
                          const saved = await saveOptions(options, { syncUserReposText: false });
                          if (saved) setDirtyFields((p) => ({ ...p, maxBackupSizeMb: false }));
                        }}
                        placeholder="Unlimited"
                      />
                    </div>
                  </>
                )}

                {activeCategory === "runlogs" && (
                  <div className="form-field">
                    <label htmlFor="max-run-log-count">Maximum run logs to keep</label>
                    <small>Older run logs are removed after new ones are written. Defaults to 50.</small>
                    <input
                      id="max-run-log-count"
                      type="number"
                      className="text-input"
                      min={1}
                      value={options.maxRunLogCount ?? ""}
                      onChange={(e) => { setOptions({ ...options, maxRunLogCount: parseNumberInput(e.target.value) }); setDirtyFields((p) => ({ ...p, maxRunLogCount: true })); }}
                      onBlur={async () => {
                        if (!options || saving || !dirtyFields.maxRunLogCount) return;
                        const saved = await saveOptions(options, { syncUserReposText: false });
                        if (saved) setDirtyFields((p) => ({ ...p, maxRunLogCount: false }));
                      }}
                      placeholder="50"
                    />
                  </div>
                )}

                {activeCategory === "discord" && (
                  <button
                    type="button"
                    className={`selectable-item${options.closeDiscordOnBackup ? " selected" : ""}`}
                    disabled={saving}
                    onClick={async () => {
                      if (!options || saving) return;
                      await saveOptions({ ...options, closeDiscordOnBackup: !options.closeDiscordOnBackup }, { syncUserReposText: false });
                    }}
                  >
                    <div className="selectable-check">
                      <div className="selectable-check-mark" />
                    </div>
                    <div className="toggle-info">
                      <div className="toggle-name">Close Discord clients before backup</div>
                      <div className="toggle-desc">
                        Temporarily closes Discord instances before moving Vencord files, then reopens them afterward
                      </div>
                    </div>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
