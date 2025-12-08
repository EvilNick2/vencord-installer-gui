import { useCallback, useEffect, useMemo, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";

const formatBytes = (bytes: number | undefined): string => {
  if (!bytes || Number.isNaN(bytes)) return "Unknown";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
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

export default function UpdaterPanel() {
  const [supportsUpdater, setSupportsUpdater] = useState<boolean | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string>("...");
  const [status, setStatus] = useState<UpdaterStatus>("idle");
  const [statusMessage, setStatusMessage] = useState<string>("Check for installer updates");
  const [update, setUpdate] = useState<Update | null>(null);
  const [progress, setProgress] = useState<ProgressState>({ downloaded: 0 });
  const [error, setError] = useState<string | null>(null);

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
        setStatusMessage("Updater is only available in the packaged app")
      }
    };

    void detectTauriSupport();

    return () => {
      canceled = true;
    };
  }, []);

  useEffect(()=> {
    return () => {
      if (update) void update.close();
    };
  }, [update]);

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
        setStatus("upToDate");
        setStatusMessage("You're running the latest version");
        return;
      }

      setUpdate(result);
      setStatus("available");
      setStatusMessage(`Version ${result.version} is available`);
    } catch (err) {
      setStatus("error");
      setError(String(err));
      setStatusMessage("Could not check for updates");
    }
  }, [supportsUpdater]);

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
        setStatusMessage("Update installed, but automatic restart failed. Please restart manually")
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
            ): null}
          </div>
          {update.body ? (
            <div className="update-notes">
              <div className="meta-label">Release notes</div>
              <div className="update-notes__body">{update.body}</div>
            </div>
          ): null}
        </div>
      ): null}

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
          ): null}
          <div className="meta-value">{downloadProgress.text}</div>
        </div>
      ): null}

      {supportsUpdater === false ? (
        <div className="muted">Run the packaged Tauri app to access automatic updates</div>
      ): null}
    </section>
  );
}