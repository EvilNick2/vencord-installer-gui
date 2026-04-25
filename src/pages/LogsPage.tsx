import { useEffect, useState } from "react";
import { FolderOpen } from "lucide-react";
import { listFlowRuns, openRunsDir } from "../api";
import type { RunRecord } from "../api";

/** Maps Rust status strings to the CSS class names that exist in App.css. */
const statusClass = (status: string): string => {
  switch (status) {
    case "failed":  return "error";
    case "pending": return "idle";
    default:        return status;
  }
};

const formatDate = (isoString: string): string => {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(isoString));
  } catch {
    return isoString;
  }
};

export default function LogsPage() {
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    listFlowRuns()
      .then(setRuns)
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, []);

  const toggleRun = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const handleOpenFolder = () => {
    openRunsDir().catch((err) => setError(String(err)));
  };

  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Install history</p>
          <h2>Run logs</h2>
          <p className="muted">
            A record of all previous install runs. Each entry shows the step-by-step outcome. Full
            diagnostic details are saved in the log files.
          </p>
        </div>
        <button type="button" className="ghost" onClick={handleOpenFolder}>
          <FolderOpen size={16} />
          Open log folder
        </button>
      </div>

      {loading && <p>Loading run history...</p>}
      {error && <p className="error">Error: {error}</p>}

      {!loading && runs.length === 0 && !error && (
        <p className="muted">No install runs yet - run the installer to get started.</p>
      )}

      <div className="stack">
        {runs.map((run) => {
          const isExpanded = expandedId === run.id;

          return (
            <div key={run.id} className={`card accordion ${isExpanded ? "is-open" : ""}`}>
              <button
                type="button"
                className="accordion-header"
                onClick={() => toggleRun(run.id)}
                aria-expanded={isExpanded}
                aria-controls={`run-${run.id}-content`}
              >
                <div className="accordion-title">
                  <span>{formatDate(run.startedAt)}</span>
                  <span className={`status-pill status-${statusClass(run.overallStatus)}`}>
                    {run.overallStatus === "completed" ? "Completed" : "Failed"}
                  </span>
                </div>
                <span className="accordion-chevron" aria-hidden="true">▾</span>
              </button>

              <div
                id={`run-${run.id}-content`}
                className="accordion-content"
                aria-hidden={!isExpanded}
              >
                <div className="accordion-content-inner">
                  <ol className="flow-steps">
                    {run.steps.map((step) => (
                      <li key={step.id} className="flow-step">
                        <div className={`flow-marker status-${statusClass(step.status)}`} aria-hidden>
                          <span />
                        </div>
                        <div className="flow-body">
                          <div className="flow-row">
                            <div className="flow-title">{step.title}</div>
                            <span className={`pill status-${statusClass(step.status)}`}>
                              {step.status}
                            </span>
                          </div>
                          <p className="flow-message">{step.friendlyMessage}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
