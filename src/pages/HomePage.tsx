import { useCallback, useEffect, useMemo, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import {
  listDependencies,
  installDependency,
  listFlowRuns,
  listBackups,
  getDiscordInstalls,
  listDiscordProcesses,
  type DependencyStatus,
  type RunRecord,
  type BackupInfo,
  type DiscordInstall,
  type DiscordProcess,
} from "../api";
import "../css/HomePage.css";

type Page = "home" | "install" | "backups" | "logs" | "settings" | "devTests";

type HomePageProps = {
  onNavigate: (page: Page) => void;
  onUpdateClick: () => void;
};

type DependencyMap = Record<string, DependencyStatus>;
type InstallingMap = Record<string, boolean>;

const formatRelativeTime = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  const h = Math.round(m / 60);
  const d = Math.round(h / 24);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${d}d ago`;
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const isDiscordRunning = (install: DiscordInstall, processes: DiscordProcess[]): boolean => {
  const installPath = install.path.toLowerCase();
  return processes.some(
    (p) =>
      (p.exe && p.exe.toLowerCase().startsWith(installPath)) ||
      p.name.toLowerCase().replace(/[^a-z]/g, "").includes(install.id.toLowerCase().replace(/[^a-z]/g, ""))
  );
};

export default function HomePage({ onUpdateClick }: HomePageProps) {
  const [appVersion, setAppVersion] = useState("...");
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [dependencies, setDependencies] = useState<DependencyMap>({});
  const [depLoading, setDepLoading] = useState(false);
  const [depError, setDepError] = useState<string | null>(null);
  const [installing, setInstalling] = useState<InstallingMap>({});
  const [discordInstalls, setDiscordInstalls] = useState<DiscordInstall[]>([]);
  const [processes, setProcesses] = useState<DiscordProcess[]>([]);

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => setAppVersion("dev"));
    listFlowRuns().then(setRuns).catch(() => {});
    listBackups().then(setBackups).catch(() => {});
    getDiscordInstalls().then(setDiscordInstalls).catch(() => {});
    listDiscordProcesses().then(setProcesses).catch(() => {});
  }, []);

  const refreshDeps = useCallback(async () => {
    setDepLoading(true);
    setDepError(null);
    try {
      const results = await listDependencies();
      setDependencies(
        results.reduce<DependencyMap>((acc, d) => { acc[d.id] = d; return acc; }, {})
      );
    } catch (err) {
      setDepError(String(err));
    } finally {
      setDepLoading(false);
    }
  }, []);

  useEffect(() => { void refreshDeps(); }, [refreshDeps]);

  const orderedDeps = useMemo(() => {
    const isNodeDetected =
      dependencies.node?.status === "installed" || dependencies.node?.status === "outdated";
    return Object.values(dependencies).filter((d) =>
      isNodeDetected ? true : d.id !== "npm" && d.id !== "pnpm"
    );
  }, [dependencies]);

  const handleInstall = async (id: string) => {
    setInstalling((prev) => ({ ...prev, [id]: true }));
    setDepError(null);
    try {
      const updated = await installDependency(id);
      setDependencies((prev) => ({ ...prev, [updated.id]: updated }));
      await refreshDeps();
    } catch (err) {
      setDepError(String(err));
    } finally {
      setInstalling((prev) => ({ ...prev, [id]: false }));
    }
  };

  const hasActiveInstall = Object.values(installing).some(Boolean);

  const depBadge = useMemo(() => {
    const missing = orderedDeps.filter((d) => d.status === "missing").length;
    const outdated = orderedDeps.filter((d) => d.status === "outdated").length;
    if (missing > 0) return { label: `${missing} missing`, cls: "panel-badge--error" };
    if (outdated > 0) return { label: `${outdated} outdated`, cls: "panel-badge--warn" };
    if (orderedDeps.length > 0) return { label: "All healthy", cls: "panel-badge--ok" };
    return null;
  }, [orderedDeps]);

  const detectedCount = discordInstalls.length;
  const clientBadge = detectedCount > 0
    ? { label: `${detectedCount} detected`, cls: "panel-badge--ok" }
    : { label: "None detected", cls: "panel-badge--warn" };

  const lastRun = runs[0];
  const totalBackupSize = backups.reduce((s, b) => s + b.sizeBytes, 0);

  return (
    <div className="dashboard">
      <div className="dashboard__stat-row">
        <div className="stat-card">
          <div className="stat-label">Installer Version</div>
          <div className="stat-value">{appVersion}</div>
          <div className="stat-sub stat-sub--ok">Running</div>
          <div className="stat-actions">
            <button className="stat-btn" type="button" onClick={onUpdateClick}>
              Check for updates
            </button>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Last Run</div>
          {lastRun ? (
            <>
              <div className="stat-value stat-value--neutral">
                {formatRelativeTime(lastRun.startedAt)}
              </div>
              <div className={`stat-sub ${lastRun.overallStatus === "completed" ? "stat-sub--ok" : "stat-sub--warn"}`}>
                {lastRun.overallStatus === "completed" ? "Completed" : "Failed"}
              </div>
            </>
          ) : (
            <>
              <div className="stat-value stat-value--neutral">-</div>
              <div className="stat-sub stat-sub--muted">No runs yet</div>
            </>
          )}
        </div>

        <div className="stat-card">
          <div className="stat-label">Backups</div>
          <div className="stat-value stat-value--neutral">{backups.length}</div>
          <div className="stat-sub stat-sub--muted">
            {backups.length > 0 ? `${formatBytes(totalBackupSize)} used` : "No backups"}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
          </svg>
          Dependencies
          {depBadge && <span className={`panel-badge ${depBadge.cls}`}>{depBadge.label}</span>}
        </div>
        <div className="panel-body">
          {depError && <p className="error" style={{ margin: "0 0 0.5rem", fontSize: "0.75rem" }}>{depError}</p>}
          {orderedDeps.length === 0 && !depLoading && (
            <p className="muted small">No dependencies found.</p>
          )}
          <div className="dep-grid">
            {orderedDeps.map((dep) => {
              const isWarn = dep.status === "outdated";
              const isMiss = dep.status === "missing";
              const itemCls = isWarn ? "dep-item dep-item--warn" : isMiss ? "dep-item dep-item--miss" : "dep-item";
              const versionText = isWarn && dep.installedVersion
                ? `${dep.installedVersion} → ${dep.recommendedVersion}`
                : dep.installedVersion || (isMiss ? "not found" : dep.recommendedVersion);

              return (
                <div key={dep.id} className={itemCls}>
                  <div className="dep-item__name">{dep.name}</div>
                  <div className="dep-item__version" style={isMiss ? { fontStyle: "italic" } : {}}>{versionText}</div>
                  <div className={`dep-item__status ${isWarn ? "dep-item__status--warn" : isMiss ? "dep-item__status--miss" : "dep-item__status--ok"}`}>
                    {dep.status === "installed" ? "● Installed" : dep.status === "outdated" ? "⚠ Outdated" : dep.status === "missing" ? "✕ Not found" : dep.status}
                  </div>
                  {(isWarn || isMiss) && dep.canInstall && (
                    <button
                      type="button"
                      className={`dep-item__action ${isWarn ? "dep-item__action--update" : "dep-item__action--install"}`}
                      disabled={hasActiveInstall || !!installing[dep.id]}
                      onClick={() => void handleInstall(dep.id)}
                    >
                      {installing[dep.id] ? "Working..." : isWarn ? "Update" : "Install"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="panel-footer">
          <button type="button" className="ghost" onClick={refreshDeps} disabled={depLoading}>
            {depLoading ? "Checking…" : "Recheck"}
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          Discord Clients
          <span className={`panel-badge ${clientBadge.cls}`}>{clientBadge.label}</span>
        </div>
        <div className="panel-body">
          {discordInstalls.length === 0 ? (
            <p className="muted small">No Discord installations detected.</p>
          ) : (
            <div className="client-list">
              {discordInstalls.map((install) => {
                const running = isDiscordRunning(install, processes);
                return (
                  <div key={install.id} className="client-item">
                    <div className={`client-dot ${running ? "client-dot--running" : "client-dot--stopped"}`} />
                    <div className="client-info">
                      <div className="client-name">{install.name}</div>
                      <div className="client-path">{install.path}</div>
                    </div>
                    <span className={`client-tag ${running ? "client-tag--running" : "client-tag--stopped"}`}>
                      {running ? "Running" : "Not running"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
