import { useCallback, useEffect, useMemo, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";

const RELEASES_ENDPOINT = "https://api.github.com/repos/EvilNick2/vencord-installer-gui/releases?per_page=20"

const formatBytes = (bytes: number | undefined): string => {
  if (!bytes || Number.isNaN(bytes)) return "Unknown";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const parseVersion = (value: string): number[] | null => {
  const cleaned = value.trim().replace(/^v/i, "").split(/[+-]/)[0];
  const parts = cleaned.split(".");
  if (parts.length === 0) return null;

  const parsed: number[] = [];

  for (const part of parts) {
    const match = part.match(/^\d+/);
    if (!match) return null;
    parsed.push(Number.parseInt(match[0], 10));
  }

  return parsed.length > 0 ? parsed : null;
}

const compareVersions = (lhs: string, rhs: string): number | null => {
  const left = parseVersion(lhs);
  const right = parseVersion(rhs);
  if (!left || !right) return null;

  const len = Math.max(left.length, right.length);

  for (let idx = 0; idx < len; idx += 1) {
    const a = left[idx] ?? 0;
    const b = right[idx] ?? 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }

  return 0;
};

type UpdaterStatus =
  | "idle"
  | "checking"
  | "upToDate"
  | "available"
  | "downloading"
  | "installed"
  | "error";

type ProgressState = {
  downloaded: number;
  total?: number;
};

type ReleaseEntry = {
  id: number;
  version: string;
  date?: string;
  notes?: string;
  url?: string;
};

type GithubRelease = {
  id: number;
  tag_name?: string;
  name?: string;
  published_at?: string;
  body?: string;
  html_url?: string;
  draft?: boolean;
  prerelease?: boolean;
};

export default function UpdaterPanel() {
  const [supportsUpdater, setSupportsUpdater] = useState<boolean | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string>("...");
  const [status, setStatus] = useState<UpdaterStatus>("idle");
  const [statusMessage, setStatusMessage] = useState<string>("Check for installer updates");
  const [update, setUpdate] = useState<Update | null>(null);
  const [progress, setProgress] = useState<ProgressState>({ downloaded: 0 });
  const [error, setError] = useState<string | null>(null);
  const [releaseHistory, setReleaseHistory] = useState<ReleaseEntry[]>([]);
  const [releaseLoading, setReleaseLoading] = useState<boolean>(false);
  const [releaseError, setReleaseError] = useState<string | null>(null);


  useEffect(() => {
    let canceled = false;

    const detectTauriSupport = async () => {
      try {
        const version = await getVersion();
        if (canceled) return;

        setCurrentVersion(version);
        setSupportsUpdater(true);
      } catch {
        if (canceled) return;

        setSupportsUpdater(false);
        setCurrentVersion("dev");
        setStatusMessage("Updater is only available in the packaged app");
      }
    };

    void detectTauriSupport();

    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (update) void update.close();
    };
  }, [update]);

  const fetchReleaseHistory = useCallback(async () => {
    setReleaseLoading(true);
    setReleaseError(null);

    try {
      const response = await fetch(RELEASES_ENDPOINT, {
        headers: {
          Accept: "application/vnd.github+json"
        },
      });

      if (!response.ok) {
        throw new Error(`Could not fetch release history (${response.status})`);
      }

      const releases = (await response.json()) as GithubRelease[];
      const mapped = releases
        .filter((release) => !release.draft && !release.prerelease)
        .map((release) => ({
          id: release.id,
          version: release.tag_name || release.name || "Unknown version",
          date: release.published_at,
          notes: release.body || undefined,
          url: release.html_url,
        }));

      setReleaseHistory(mapped);
    } catch (err) {
      setReleaseError(String(err));
    } finally {
      setReleaseLoading(false);
    }
  }, []);

  const downloadProgress = useMemo(() => {
    if (status !== "downloading") return null;

    const totalText = progress.total ? formatBytes(progress.total) : "Unknown";
    const downloadedText = formatBytes(progress.downloaded);

    const percent =
      progress.total && progress.total > 0
        ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
        : null;

    return {
      text: `${downloadedText} downloaded${percent ? ` (${percent}%)` : ""} of ${totalText}`,
      percent,
    };
  }, [progress, status]);

  const checkForUpdates = useCallback(async () => {
    if (supportsUpdater !== true) return;

    setStatus("checking");
    setStatusMessage("Checking for updates...");
    setError(null);

    try {
      const result = await check();

      if (!result) {
        setUpdate(null);
        setReleaseHistory([]);
        setReleaseError(null);
        setStatus("upToDate");
        setStatusMessage("You're running the latest version");
        return;
      }

      setUpdate(result);
      setStatus("available");
      setStatusMessage(`Version ${result.version} is available`);
      void fetchReleaseHistory();
    } catch (err) {
      setStatus("error");
      setError(String(err));
      setStatusMessage("Could not check for updates");
    }
  }, [supportsUpdater, fetchReleaseHistory]);

  const downloadAndInstall = async () => {
    if (supportsUpdater !== true || !update) return;

    setStatus("downloading");
    setProgress({ downloaded: 0, total: undefined });
    setError(null);
    setStatusMessage("Downloading update...");

    try {
      const handleEvent = (event: DownloadEvent) => {
        switch (event.event) {
          case "Started":
            setProgress({ downloaded: 0, total: event.data.contentLength });
            break;
          case "Progress":
            setProgress((prev) => ({
              downloaded: prev.downloaded + event.data.chunkLength,
              total: prev.total,
            }));
            break;
          case "Finished":
            setStatusMessage("Installing update and restarting...");
            break;
          default:
            break;
        }
      };

      await update.downloadAndInstall(handleEvent);
      setStatus("installed");
      setStatusMessage("Update installed. Restarting to apply changes...");

      try {
        await relaunch();
      } catch (restartErr) {
        setStatusMessage("Update installed, but automatic restart failed. Please restart manually");
        setError(String(restartErr));
      }
    } catch (err) {
      setStatus("error");
      setError(String(err));
      setStatusMessage("Update failed");
    }
  };

  useEffect(() => {
    if (!supportsUpdater) return;

    const timeout = setTimeout(() => {
      void checkForUpdates();
    }, 0);

    return () => clearTimeout(timeout);
  }, [supportsUpdater, checkForUpdates]);

  const newerReleaseHistory = useMemo(() => {
    const filtered = releaseHistory.filter((release) => {
      const comparison = compareVersions(release.version, currentVersion);
      return comparison !== null && comparison > 0;
    });

    return filtered.sort((a, b) => {
      const comparison = compareVersions(b.version, a.version);
      return comparison ?? 0;
    });
  }, [releaseHistory, currentVersion]);

  const disableCheck = status === "checking" || status === "downloading" || supportsUpdater !== true;
  const disableInstall =
    supportsUpdater !== true ||
    !update ||
    status === "checking" ||
    status === "downloading" ||
    status === "installed";

  return (
    <section className="card updater-card">
      <div className="card-header updater-header">
        <div>
          <h3>Application updates</h3>
          <p className="muted">Stay current to receive the latest installer fixes and improvements</p>
        </div>
        <div className="actions">
          <button onClick={checkForUpdates} disabled={disableCheck}>
            {status === "checking" ? "Checking..." : "Check for updates"}
          </button>
          <button onClick={downloadAndInstall} disabled={disableInstall}>
            {status === "downloading" ? "Downloading..." : "Install update"}
          </button>
        </div>
      </div>

      <div className="updater-meta">
        <div>
          <div className="meta-label">Current version</div>
          <div className="meta-value">{currentVersion}</div>
        </div>
        <div>
          <div className="meta-label">Update status</div>
          <div className="meta-value">{statusMessage}</div>
          {error ? <div className="error-text">{error}</div> : null}
        </div>
      </div>

      {update && status === "available" ? (
        <div className="update-details">
          <div>
            <div className="meta-label">Available version</div>
            <div className="meta-value">{update.version}</div>
            {update.date ? (
              <div className="muted">Released {new Intl.DateTimeFormat().format(new Date(update.date))}</div>
            ) : null}
          </div>
          <div className="update-notes update-notes--history">
            <div className="meta-label">Release notes for newer versions</div>

            {releaseError ? <div className="error-text">{releaseError}</div> : null}
            {releaseLoading ? <div className="muted">Loading release history...</div> : null}

            {!releaseLoading && !releaseError && newerReleaseHistory.length === 0 ? (
              <div className="muted">No newer release notes found for your current version.</div>
            ) : null}

            {!releaseLoading && !releaseError && newerReleaseHistory.length > 0 ? (
              <ul className="release-history-list">
                {newerReleaseHistory.map((release) => (
                  <li key={release.id} className="release-history-item">
                    <div className="release-history-item__header">
                      <strong>{release.version}</strong>
                      {release.date ? (
                        <span className="muted small">
                          {new Intl.DateTimeFormat().format(new Date(release.date))}
                        </span>
                      ) : null}
                    </div>
                    {release.notes ? (
                      <div className="release-history-item__notes">{release.notes}</div>
                    ) : (
                      <div className="muted small">No changelog provided for this release.</div>
                    )}
                    {release.url ? (
                      <a href={release.url} target="_blank" rel="noreferrer" className="small">
                        Open release page
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}

      {downloadProgress ? (
        <div className="update-progress">
          <div className="meta-label">Download progress</div>
          {downloadProgress.percent !== null ? (
            <div className="progress-track">
              <div
                className="progress-bar"
                style={{ width: `${downloadProgress.percent}%` }}
                aria-valuenow={downloadProgress.percent}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
          ) : null}
          <div className="meta-value">{downloadProgress.text}</div>
        </div>
      ) : null}

      {supportsUpdater === false ? (
        <div className="muted">Run the packaged Tauri app to access automatic updates</div>
      ) : null}
    </section>
  );
}