import { useEffect, useMemo, useState } from "react";
import { installDependency, listDependencies, type DependencyStatus } from "../api";

const STATUS_LABELS: Record<DependencyStatus['status'], string> = {
  installed: 'Installed',
  missing: 'Not installed',
  outdated: 'Update available',
  error: 'Check failed',
};

const STATUS_CLASS: Record<DependencyStatus['status'], string> = {
  installed: 'status-pill status-ready',
  missing: 'status-pill status-pending',
  outdated: 'status-pill status-info',
  error: 'status-pill status-error',
};

type InstallState = Record<string, boolean>;

type DependencyMap = Record<string, DependencyStatus>;

export default function DependencyPanel() {
  const [dependencies, setDependencies] = useState<DependencyMap>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState<InstallState>({});

  const orderedDependencies = useMemo(() => {
    const node = dependencies.node;
    const isNodeDetected = node?.status === "installed" || node?.status === "outdated";

    return Object.values(dependencies).filter((dependency) => {
      if (isNodeDetected) {
        return true;
      }

      return dependency.id !== "npm" && dependency.id !== "pnpm";
    });
  }, [dependencies]);

  const refresh = async () => {
    setLoading(true);
    setError(null);

    try {
      const results = await listDependencies();
      setDependencies(
        results.reduce<DependencyMap>((acc, entry) => {
          acc[entry.id] = entry;
          return acc;
        }, {})
      );
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const hasActiveInstall = Object.values(installing).some(Boolean);
  const activeInstallId = Object.entries(installing).find(([, isInstalling]) => isInstalling)?.[0] ?? null;
  const activeInstallName = activeInstallId ? dependencies[activeInstallId]?.name ?? activeInstallId : null;

  const handleInstall = async (id: string) => {
    setInstalling((prev) => ({ ...prev, [id]: true }));
    setError(null);

    try {
      const updated = await installDependency(id);
      setDependencies((prev) => ({ ...prev, [updated.id]: updated }));
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setInstalling((prev) => ({ ...prev, [id]: false }));
    }
  };

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <h3>Dependency check</h3>
          <p className="muted">Verify the tools needed to build and install Vencord</p>
        </div>
        <div className="actions">
          <button onClick={refresh} disabled={loading}>
            {loading ? "Checking..." : "Recheck"}
          </button>
        </div>
      </div>

      {error ? <div className="error-text">{error}</div> : null}

      <div className="dependency-grid">
        {orderedDependencies.map((dep) => (
          <div key={dep.id} className="dependency-card">
            <div className="dependency-row">
              <div>
                <div className="dependency-name">{dep.name}</div>
                <div className="dependency-meta">Recommended: {dep.recommendedVersion}</div>
                {dep.installedVersion ? (
                  <div className="dependency-meta">Installed: {dep.installedVersion}</div>
                ) : (
                  <div className="dependency-meta muted"> Installed version unknown</div>
                )}
                {dep.message ? <div className="dependency-message">{dep.message}</div> : null}
              </div>
              <div className={STATUS_CLASS[dep.status]}>{STATUS_LABELS[dep.status]}</div>
            </div>
            <div className="dependency-actions">
              <button
                onClick={() => void handleInstall(dep.id)}
                disabled={hasActiveInstall || !dep.canInstall || installing[dep.id]}
                title={
                  hasActiveInstall && !installing[dep.id]
                    ? `Only one dependency can be installed at a time. ${activeInstallName ?? "Another dependency"} is currently installing`
                    : undefined
                }
              >
                {installing[dep.id]
                  ? "Working..."
                  : hasActiveInstall && !installing[dep.id]
                    ? `Wait for ${activeInstallName ?? "current dependency"}`
                    : dep.installLabel ?? (dep.status === "outdated" ? "Upgrade" : "Install")}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
