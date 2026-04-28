import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { openUrl } from "@tauri-apps/plugin-opener";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";

const RELEASES_ENDPOINT =
  "https://api.github.com/repos/EvilNick2/vencord-installer-gui/releases?per_page=20";

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
};

const compareVersions = (lhs: string, rhs: string): number | null => {
  const left = parseVersion(lhs);
  const right = parseVersion(rhs);
  if (!left || !right) return null;
  const len = Math.max(left.length, right.length);
  for (let i = 0; i < len; i++) {
    const a = left[i] ?? 0;
    const b = right[i] ?? 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
};

type UpdaterStatus = "idle" | "checking" | "upToDate" | "available" | "downloading" | "installed" | "error";
type ProgressState = { downloaded: number; total?: number };
type ReleaseEntry = { id: number; version: string; date?: string; notes?: string; url?: string };
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

type UpdateModalProps = {
  open: boolean;
  onClose: () => void;
};

export default function UpdateModal({ open, onClose }: UpdateModalProps) {
  const [supportsUpdater, setSupportsUpdater] = useState<boolean | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string>("...");
  const [status, setStatus] = useState<UpdaterStatus>("idle");
  const [statusMessage, setStatusMessage] = useState<string>("Check for installer updates");
  const [update, setUpdate] = useState<Update | null>(null);
  const [progress, setProgress] = useState<ProgressState>({ downloaded: 0 });
  const [error, setError] = useState<string | null>(null);
  const [releaseHistory, setReleaseHistory] = useState<ReleaseEntry[]>([]);
  const [releaseLoading, setReleaseLoading] = useState(false);
  const [releaseError, setReleaseError] = useState<string | null>(null);

  useEffect(() => {
    let canceled = false;
    getVersion()
      .then((v) => { if (!canceled) { setCurrentVersion(v); setSupportsUpdater(true); } })
      .catch(() => { if (!canceled) { setSupportsUpdater(false); setCurrentVersion("dev"); setStatusMessage("Updater only available in packaged app"); } });
    return () => { canceled = true; };
  }, []);

  useEffect(() => {
    return () => { if (update) void update.close(); };
  }, [update]);

  const fetchReleaseHistory = useCallback(async () => {
    setReleaseLoading(true);
    setReleaseError(null);
    try {
      const res = await fetch(RELEASES_ENDPOINT, { headers: { Accept: "application/vnd.github+json" } });
      if (!res.ok) throw new Error(`Could not fetch release history (${res.status})`);
      const releases = (await res.json()) as GithubRelease[];
      setReleaseHistory(
        releases
          .filter((r) => !r.draft && !r.prerelease)
          .map((r) => ({ id: r.id, version: r.tag_name || r.name || "Unknown", date: r.published_at, notes: r.body || undefined, url: r.html_url }))
      );
    } catch (err) {
      setReleaseError(String(err));
    } finally {
      setReleaseLoading(false);
    }
  }, []);

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

  useEffect(() => {
    if (!open || supportsUpdater !== true) return;
    const t = setTimeout(() => void checkForUpdates(), 0);
    return () => clearTimeout(t);
  }, [open, supportsUpdater, checkForUpdates]);

  const downloadProgress = useMemo(() => {
    if (status !== "downloading") return null;
    const total = progress.total ? formatBytes(progress.total) : "Unknown";
    const downloaded = formatBytes(progress.downloaded);
    const percent = progress.total && progress.total > 0
      ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
      : null;
    return { text: `${downloaded} of ${total}${percent ? ` (${percent}%)` : ""}`, percent };
  }, [progress, status]);

  const downloadAndInstall = async () => {
    if (supportsUpdater !== true || !update) return;
    setStatus("downloading");
    setProgress({ downloaded: 0 });
    setError(null);
    setStatusMessage("Downloading update...");
    try {
      await update.downloadAndInstall((event: DownloadEvent) => {
        switch (event.event) {
          case "Started":
            setProgress({ downloaded: 0, total: event.data.contentLength });
            break;
          case "Progress":
            setProgress((p) => ({ downloaded: p.downloaded + event.data.chunkLength, total: p.total }));
            break;
          case "Finished":
            setStatusMessage("Installing and restarting...");
            break;
        }
      });
      setStatus("installed");
      setStatusMessage("Update installed. Restarting...");
      try { await relaunch(); } catch (e) {
        setStatusMessage("Restart failed - please restart manually");
        setError(String(e));
      }
    } catch (err) {
      setStatus("error");
      setError(String(err));
      setStatusMessage("Update failed");
    }
  };

  const newerReleaseHistory = useMemo(() => {
    return releaseHistory
      .filter((r) => { const c = compareVersions(r.version, currentVersion); return c !== null && c > 0; })
      .sort((a, b) => compareVersions(b.version, a.version) ?? 0);
  }, [releaseHistory, currentVersion]);

  const openReleasePage = async (url: string | undefined) => {
    if (!url) return;
    try { await openUrl(url); } catch {
      try { await navigator.clipboard.writeText(url); setStatusMessage("URL copied to clipboard"); } catch (e) { setError(String(e)); }
    }
  };

  const disableCheck = status === "checking" || status === "downloading" || supportsUpdater !== true;
  const disableInstall = !update || status !== "available";

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Application updates</h3>
          <button type="button" onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: "1rem 1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem", overflowY: "auto", flex: 1 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div>
              <div className="eyebrow">Current version</div>
              <div style={{ fontWeight: 600, color: "var(--text-primary)", marginTop: "0.25rem" }}>{currentVersion}</div>
            </div>
            <div>
              <div className="eyebrow">Status</div>
              <div style={{ fontWeight: 600, color: "var(--text-primary)", marginTop: "0.25rem" }}>{statusMessage}</div>
              {error && (
                <div style={{ marginTop: "0.25rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ color: "var(--error)", fontSize: "0.75rem" }}>{error}</span>
                  <button type="button" className="ghost small" onClick={checkForUpdates} disabled={disableCheck}>Retry</button>
                </div>
              )}
            </div>
          </div>

          {downloadProgress && (
            <div>
              <div className="eyebrow" style={{ marginBottom: "0.375rem" }}>Download progress</div>
              {downloadProgress.percent !== null && (
                <div className="progress-track" style={{ marginBottom: "0.25rem" }}>
                  <div className="progress-bar" style={{ width: `${downloadProgress.percent}%` }} />
                </div>
              )}
              <div className="muted small">{downloadProgress.text}</div>
            </div>
          )}

          {update && status === "available" && !releaseLoading && newerReleaseHistory.length > 0 && (
            <div>
              <div className="eyebrow" style={{ marginBottom: "0.375rem" }}>Release notes</div>
              <ul className="release-history-list">
                {newerReleaseHistory.map((r, i) => (
                  <li key={r.id} className="release-history-item">
                    <div className="release-history-item__header">
                      <div className="release-history-item__version-row">
                        <strong>{r.version}</strong>
                        {i === 0 && <span className="status-pill status-ready">Latest</span>}
                      </div>
                      {r.date && <span className="muted small">{new Intl.DateTimeFormat().format(new Date(r.date))}</span>}
                    </div>
                    {r.notes
                      ? <div className="release-history-item__notes"><ReactMarkdown>{r.notes}</ReactMarkdown></div>
                      : <div className="muted small">No changelog for this release.</div>
                    }
                    {r.url && <button type="button" className="ghost small" onClick={() => void openReleasePage(r.url)}>Open release page</button>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {supportsUpdater === false && (
            <p className="muted small">Run the packaged app to access automatic updates.</p>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="primary" onClick={() => void downloadAndInstall()} disabled={disableInstall}>
            {status === "downloading" ? "Downloading…" : "Download & Install"}
          </button>
        </div>
      </div>
    </div>
  );
}
