import React, { Component, useMemo, useState } from "react";
import { runDevTest, type DevModuleResult, type DevTestStep } from "../api";

const STEP_DEFINITIONS: {
  id: DevTestStep;
  title: string;
  description: string;
  needsSourcePath?: boolean;
}[] = [
    {
      id: "closeDiscord",
      title: "Close Discord clients",
      description: "Closes running Discord processes based on the current settings flag",
    },
    {
      id: "backup",
      title: "Backup Vencord install",
      description: "Moves a given Vencord install into the backups folder",
      needsSourcePath: true,
    },
    {
      id: "syncRepo",
      title: "Sync Vencord repository",
      description: "Clones or updates the configured Vencord repository path",
    },
    {
      id: "build",
      title: "Build Vencord source files",
      description: "Installs requirements and builds the project",
    },
    {
      id: "inject",
      title: "Inject placeholder",
      description: "Runs the stub inject step used by the installer pipeline",
    },
    {
      id: "reopenDiscord",
      title: "Reopen Discord",
      description: "Restarts any Discord processes that the Close Discord test previously stopped",
    },
  ];

const STEP_TITLES: Record<DevTestStep, string> = STEP_DEFINITIONS.reduce(
  (acc, step) => ({ ...acc, [step.id]: step.title }),
  {} as Record<DevTestStep, string>
);

type LoggedResult = {
  id: number;
  timestamp: Date;
  step: DevTestStep;
  summary: string;
  title: string;
};

function formatTimestamp(date: Date) {
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

function summarizeResult(result: DevModuleResult): string {
  if (!result || typeof result !== "object") {
    return "Test finished, but no result details were provided.";
  }

  switch (result.kind) {
    case "closeDiscord": {
      if (result.closingSkipped) {
        return "Close Discord skipped due to settings";
      }

      const closed = result.closedClients?.length ?? 0;
      return closed === 0
        ? "No Discord clients were closed"
        : `Closed ${closed} Discord client(s): ${result.closedClients.join(", ")}`;
    }
    case "backup": {
      const source = result.result?.sourcePath ?? "unknown source";
      const dest = result.result?.backupPath ?? "unknown backup location";
      return `Backed up ${source} to ${dest}`;
    }
    case "syncRepo":
      return result.path ? `Synced repository at ${result.path}` : "Sync complete";
    case "build":
    case "inject":
      return result.message || result.path || `${result.kind} step completed`;
    case "reopenDiscord": {
      if (result.closingSkipped) {
        return "Discord restart skipped because closing is disabled in settings";
      }

      const restarted = result.restarted?.length ?? 0;
      const closed = result.closedClients?.length ?? 0;

      if (restarted > 0) {
        return `Restarted ${restarted} Discord process(es): ${result.restarted.join(", ")}`;
      }

      if (closed > 0) {
        return "No Discord processes were restarted";
      }

      return "No Discord processes were previously closed";
    }
    default:
      return "Test completed";
  }
}

class DevTestsErrorBoundary extends Component<{ children: React.ReactNode }, { error?: Error }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);

    this.state = { error: undefined };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Dev tests crashed", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="card">
          <h3>Development tests unavailable</h3>
          <p className="error">{this.state.error.message}</p>
          <button onClick={() => this.setState({ error: undefined })}>Try again</button>
        </div>
      );
    }

    return this.props.children;
  }
}


export default function DevTestsPage() {
  const [runningStep, setRunningStep] = useState<DevTestStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourcePath, setSourcePath] = useState("");
  const [results, setResults] = useState<LoggedResult[]>([]);

  const sortedResults = useMemo(
    () => [...results].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()),
    [results]
  );

  const handleRun = async (step: DevTestStep) => {
    setError(null);
    setRunningStep(step);

    try {
      const result = await runDevTest(step, sourcePath || undefined);
      let summary: string;

      try {
        summary = summarizeResult(result);
      } catch (summaryError) {
        console.error("Failed to summarize dev test result", summaryError);
        summary = "Test completed, but the result could not be summarized";
      }

      const entry: LoggedResult = {
        id: Date.now(),
        timestamp: new Date(),
        step,
        title: STEP_TITLES[step],
        summary,
      };

      setResults((prev) => [entry, ...prev]);
    } catch (err) {
      setError(String(err));
    } finally {
      setRunningStep(null);
    }
  };

  return (
    <DevTestsErrorBoundary>
      <section>
        <h2>Development tests</h2>

        <div className="card">
          <h3>Run installer modules individually</h3>
          <p className="muted">
            Use this menu to exercise one module at a time without running the entire installer flow.
          </p>

          <div className="form-field">
            <label htmlFor="dev-source-path">Source path for backup testing</label>
            <input
              id="dev-source-path"
              className="text-input"
              type="text"
              value={sourcePath}
              onChange={(event) => setSourcePath(event.target.value)}
              placeholder="/path/to/Vencord"
            />
            <small>
              Only required for the backup module. It should point to the Vencord install you want to move into the
              backups folder.
            </small>
          </div>

          {error && <p className="error">{error}</p>}

          <ul className="settings-list">
            {STEP_DEFINITIONS.map((step) => (
              <li key={step.id} className="settings-list-item">
                <div className="settings-list-row">
                  <div className="settings-list-meta">
                    <span className="settings-list-title">{step.title}</span>
                    <span className="settings-list-description">{step.description}</span>
                  </div>
                  <div>
                    <button
                      onClick={() => handleRun(step.id)}
                      disabled={
                        runningStep !== null || (step.needsSourcePath && sourcePath.trim().length === 0)
                      }
                    >
                      {runningStep === step.id ? "Running..." : "Run"}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h3>Recent test results</h3>
          {sortedResults.length === 0 && <p className="muted">No modules have been run yet.</p>}

          <ul className="settings-list">
            {sortedResults.map((entry) => (
              <li key={entry.id} className="settings-list-item">
                <div className="settings-list-row">
                  <div className="settings-list-meta">
                    <span className="settings-list-title">{entry.title}</span>
                    <span className="settings-list-description">{formatTimestamp(entry.timestamp)}</span>
                    <span>{entry.summary}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </DevTestsErrorBoundary>
  );
}