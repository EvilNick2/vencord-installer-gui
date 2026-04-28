import { useEffect, useState } from "react";
import { FolderOpen } from "lucide-react";
import { listFlowRuns, openRunsDir } from "../api";
import type { RunRecord } from "../api";

const statusClass = (status: string): string => {
  switch (status) {
    case "failed":  return "fail";
    case "pending": return "skip";
    default:        return "ok";
  }
};

const formatDate = (isoString: string): string => {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    }).format(new Date(isoString));
  } catch {
    return isoString;
  }
};

export default function LogsPage() {
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    listFlowRuns()
      .then((r) => {
        setRuns(r);
        if (r.length > 0) setSelectedId(r[0].id);
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, []);

  const selected = runs.find((r) => r.id === selectedId);

  const handleOpenFolder = () => {
    openRunsDir().catch((err) => setError(String(err)));
  };

  return (
    <section>
      <div style={{ marginBottom: "1rem" }}>
        <div className="page-heading">Logs</div>
        <div style={{ fontSize: "0.6875rem", color: "var(--text-faint)", marginTop: "2px" }}>
          Installation run history
        </div>
      </div>

      {error && <p className="error" style={{ marginBottom: "0.75rem", fontSize: "0.75rem" }}>{error}</p>}

      <div className="logs-layout">
        <div className="panel">
          <div className="panel-header">
            Runs
            <span className="panel-header-right">
              <button
                type="button"
                className="ghost small"
                onClick={handleOpenFolder}
                style={{ padding: "2px 6px", fontSize: "0.6rem" }}
              >
                <FolderOpen size={11} />
              </button>
            </span>
          </div>
          <div className="panel-body" style={{ padding: "8px" }}>
            {loading && <p className="muted small" style={{ padding: "8px" }}>Loading...</p>}
            {!loading && runs.length === 0 && !error && (
              <p className="muted small" style={{ padding: "8px" }}>No runs yet.</p>
            )}
            {runs.map((run) => (
              <button
                key={run.id}
                type="button"
                className={`run-item${selectedId === run.id ? " active" : ""}`}
                onClick={() => setSelectedId(run.id)}
              >
                <div className="run-top">
                  <span className="run-date">{formatDate(run.startedAt)}</span>
                  <span className={`run-badge ${run.overallStatus === "completed" ? "ok" : "fail"}`}>
                    {run.overallStatus === "completed" ? "Completed" : "Failed"}
                  </span>
                </div>
                <div className="run-steps">{run.steps.length} steps</div>
              </button>
            ))}
          </div>
        </div>

        <div className="panel">
          {selected ? (
            <>
              <div className="detail-header">
                <div className="detail-title">Run - {formatDate(selected.startedAt)}</div>
                <div className="detail-meta">{selected.steps.length} steps</div>
              </div>
              <div className="detail-body">
                {selected.steps.map((step) => {
                  const cls = statusClass(step.status);
                  return (
                    <div key={step.id} className={`log-step ${cls}`}>
                      <div className={`log-dot ${cls}`} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="log-step-name">{step.title}</div>
                        <div className="log-step-detail">{step.friendlyMessage}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            !loading && (
              <div style={{ padding: "24px 16px" }}>
                <p className="muted small">Select a run to view details.</p>
              </div>
            )
          )}
        </div>
      </div>
    </section>
  );
}
