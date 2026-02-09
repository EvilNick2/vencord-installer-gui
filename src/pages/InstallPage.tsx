import { useEffect, useMemo, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  getDiscordInstalls,
  getUserOptions,
  listDiscordProcesses,
  runPatchFlow,
  updateUserOptions,
} from "../api";
import type {
  DiscordInstall,
  DiscordProcess,
  FlowStepResult,
  FlowStepStatus,
  PatchFlowStepEvent,
  PatchFlowResult,
  UserOptions,
} from "../api";

const DISCORD_PROCESS_ORDER = ["discord", "discordptb", "discordcanary"] as const;

const FLOW_STEPS: { id: keyof PatchFlowResult; title: string; description: string }[] = [
  {
    id: "closeDiscord",
    title: "Close Discord",
    description: "Stops running clients so files can be updated safely",
  },
  {
    id: "backup",
    title: "Backup Vencord",
    description: "Copies your current Vencord files to a backup folder",
  },
  {
    id: "syncRepo",
    title: "Sync repository",
    description: "Clones or updates the configured Vencord repository",
  },
  {
    id: "build",
    title: "Build files",
    description: "Builds the latest Vencord artifacts",
  },
  {
    id: "inject",
    title: "Inject Vencord",
    description: "Installs the patched files into the selected Discord client(s)",
  },
  {
    id: "downloadThemes",
    title: "Download themes",
    description: "Fetches a set of community themes into your Vencord folder",
  },
  {
    id: "reopenDiscord",
    title: "Reopen Discord",
    description: "Starts Discord again after patching completes",
  },
];

type StepVisualStatus = FlowStepStatus | "idle";

type StepState = {
  status: StepVisualStatus;
  message: string;
};

type StepStateMap = Record<keyof PatchFlowResult, StepState>;

const normalizeProcessName = (name: string) => name.toLowerCase().replace(/\.exe$/, "");

const buildInitialSteps = (): StepStateMap =>
  FLOW_STEPS.reduce(
    (acc, step) => ({
      ...acc,
      [step.id]: { status: "idle", message: "Waiting to run" },
    }),
    {} as StepStateMap
  );

const buildRunningSteps = (): StepStateMap => {
  const base = buildInitialSteps();
  const first = FLOW_STEPS[0]?.id;

  if (first) {
    base[first] = { status: "running", message: "Running installer workflow..." };
  }

  return base;
};

const describeStep = (
  stepId: keyof PatchFlowResult,
  result?: FlowStepResult<unknown>
): string => {
  if (!result) {
    return "Not started";
  }

  if (result.message) {
    return result.message;
  }

  switch (stepId) {
    case "closeDiscord": {
      const detail = result.detail as string[] | undefined;
      if (result.status === "skipped") return "Closing Discord was skipped";
      if (detail?.length) return `Closed ${detail.length} client(s): ${detail.join(", ")}`;
      return "No running Discord clients were closed";
    }
    case "backup": {
      const detail = result.detail as
        | { sourcePath?: string; backupPath?: string; closingSkipped?: boolean }
        | undefined;
      if (result.status === "skipped") return "Backup step was skipped";
      if (detail?.sourcePath && detail?.backupPath) {
        return `Backed up ${detail.sourcePath} to ${detail.backupPath}`;
      }
      return "Backup completed";
    }
    case "syncRepo": {
      const detail = result.detail as string | undefined;
      return detail ? `Repository synced at ${detail}` : "Repository sync completed";
    }
    case "build": {
      const detail = result.detail as string | undefined;
      return detail || "Build completed";
    }
    case "inject": {
      const detail = result.detail as string | undefined;
      return detail || "Injected Vencord into Discord";
    }
    case "downloadThemes": {
      const detail = result.detail as string | undefined;
      return detail || "Downloaded themes";
    }
    case "reopenDiscord": {
      const detail = result.detail as string[] | undefined;
      if (result.status === "skipped") return "Reopening Discord was skipped";
      if (detail?.length) return `Restarted ${detail.length} client(s)`;
      return "Discord restarted";
    }
    default:
      return "Step completed";
  }
};

const mapFlowToSteps = (result: PatchFlowResult): StepStateMap =>
  FLOW_STEPS.reduce((acc, step) => {
    const stepResult = result[step.id];
    acc[step.id] = {
      status: stepResult?.status ?? "pending",
      message: describeStep(step.id, stepResult),
    };
    return acc;
  }, {} as StepStateMap);

export default function InstallPage() {
  const [installs, setInstalls] = useState<DiscordInstall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userOptions, setUserOptions] = useState<UserOptions | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [openClients, setOpenClients] = useState<DiscordProcess[]>([]);
  const [processError, setProcessError] = useState<string | null>(null);
  const [processLoading, setProcessLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [flowError, setFlowError] = useState<string | null>(null);
  const [stepStates, setStepStates] = useState<StepStateMap>(buildInitialSteps);
  const [lastResult, setLastResult] = useState<PatchFlowResult | null>(null);
  const [activeInstallId, setActiveInstallId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setError(null);
      setLoading(true);

      try {
        const [installsData, optionsData] = await Promise.all([
          getDiscordInstalls(),
          getUserOptions(),
        ]);

        setInstalls(installsData);
        setUserOptions(optionsData);

        const selectedFromOptions = installsData
          .filter((inst) => optionsData.selectedDiscordClients.includes(inst.id))
          .map((inst) => inst.id);

        if (selectedFromOptions.length > 0) {
          setSelectedIds(selectedFromOptions);
        } else {
          const stable = installsData.find((d) => d.id === "stable");
          setSelectedIds(stable ? [stable.id] : []);
        }
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const refreshOpenClients = () => {
    setProcessError(null);
    setProcessLoading(true);

    listDiscordProcesses()
      .then((clients) => {
        const uniqueByType = new Map<string, DiscordProcess>();

        for (const client of clients) {
          const normalized = normalizeProcessName(client.name);

          if (!uniqueByType.has(normalized)) {
            uniqueByType.set(normalized, client);
          }
        }

        const ordered = Array.from(uniqueByType.values()).sort((a, b) => {
          const aName = normalizeProcessName(a.name);
          const bName = normalizeProcessName(b.name);

          const aIndex = DISCORD_PROCESS_ORDER.indexOf(
            aName as (typeof DISCORD_PROCESS_ORDER)[number]
          );
          const bIndex = DISCORD_PROCESS_ORDER.indexOf(
            bName as (typeof DISCORD_PROCESS_ORDER)[number]
          );

          const normalizedAIndex = aIndex === -1 ? DISCORD_PROCESS_ORDER.length : aIndex;
          const normalizedBIndex = bIndex === -1 ? DISCORD_PROCESS_ORDER.length : bIndex;

          return normalizedAIndex - normalizedBIndex;
        });

        setOpenClients(ordered);
      })
      .catch((err) => setProcessError(String(err)))
      .finally(() => setProcessLoading(false));
  };

  useEffect(() => {
    refreshOpenClients();
  }, []);

  const persistSelectedClients = (nextSelected: string[]) => {
    if (!userOptions) return;

    const nextOptions = { ...userOptions, selectedDiscordClients: nextSelected };
    setUserOptions(nextOptions);

    updateUserOptions(nextOptions)
      .then((updated) => setUserOptions(updated))
      .catch((err) => setError(String(err)));
  };

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      persistSelectedClients(next);
      return next;
    });
  };

  const selectedInstalls = useMemo(
    () => installs.filter((inst) => selectedIds.includes(inst.id)),
    [installs, selectedIds]
  );

  const runWorkflow = async () => {
    if (selectedInstalls.length === 0) return;

    setFlowError(null);
    setIsRunning(true);
    setLastResult(null);
    setStepStates(buildRunningSteps());
    setActiveInstallId(
      selectedInstalls.map((install) => install.name || install.id).join(", ") ||
        "selected clients"
    );

    let unlisten: UnlistenFn | null = null;

    try {
      unlisten = await listen<PatchFlowStepEvent>("patch-flow-step", (event) => {
        const payload = event.payload;

        if (!payload) return;

        setStepStates((prev) => {
          const updated = { ...prev } as StepStateMap;
          const { step, ...result } = payload;

          updated[step] = {
            status: result.status,
            message: result.message || describeStep(step, result),
          };
          
          return updated;
        })
      })

      const result = await runPatchFlow();
      setLastResult(result);
      setStepStates(mapFlowToSteps(result));
    } catch (err) {
      setFlowError(String(err));
      setStepStates(buildInitialSteps());
    } finally {
      if (unlisten) {
        await unlisten();
      }

      setIsRunning(false);
      setActiveInstallId(null);
    }
  };

  return (
    <section className="install-section">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Installer workflow</p>
          <h2>Install / Repair Vencord</h2>
          <p className="muted">
            Run the full patcher pipeline in one click. The installer will close Discord,
            back up your files, sync the repository, build, inject, download themes, and finally reopen
            your client.
          </p>
        </div>
      </div>

      <div className="install-grid">
        <div className="stack">
          <div className="card">
            <div className="card-header">
              <h3>Detected Discord clients</h3>
              <span className="muted small">{loading ? "Scanning..." : `${installs.length} found`}</span>
            </div>

            {loading && <p>Scanning for Discord installs...</p>}
            {error && <p className="error">Error: {error}</p>}
            {!loading && installs.length === 0 && !error && (
              <p>No Discord installations found.</p>
            )}

            <ul className="install-list rich-list">
              {installs.map((inst) => (
                <li key={inst.id} className={selectedIds.includes(inst.id) ? "selected" : ""}>
                  <label className="install-tile">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(inst.id)}
                      onChange={() => toggle(inst.id)}
                    />
                    <div className="install-meta">
                      <div className="install-name-row">
                        <span className="install-name">{inst.name}</span>
                        {selectedIds.includes(inst.id) && <span className="pill">Target</span>}
                      </div>
                      <span className="install-path">{inst.path}</span>
                    </div>
                  </label>
                </li>
              ))}
            </ul>
          </div>

          <div className="card">
            <div className="card-header">
              <h3>Currently running Discord</h3>
              <button onClick={refreshOpenClients} disabled={processLoading}>
                {processLoading ? "Refreshing..." : "Refresh"}
              </button>
            </div>

            {processLoading && <p>Scanning for running clients...</p>}
            {!processLoading && processError && (
              <p className="error">Error: {processError}</p>
            )}
            {!processLoading && openClients.length === 0 && !processError && (
              <p className="muted">No Discord processes are currently running</p>
            )}

            <ul className="install-list rich-list">
              {openClients.map((proc) => (
                <li key={normalizeProcessName(proc.name)}>
                  <div className="install-meta">
                    <div className="install-name-row">
                      <span className="install-name">{proc.name}</span>
                      <span className="pill neutral">PID {proc.pid}</span>
                    </div>
                    {proc.exe && <div className="install-path">{proc.exe}</div>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <div className="card-header">
              <div>
                <h3>Full install workflow</h3>
                <p className="muted small" style={{margin: "4px 0 10px 0"}}>Each step runs in order for the selected Discord client(s).</p>
              </div>
              <div className="inline-actions workflow-actions">
                <div className={`status-pill ${isRunning ? "status-pending" : "status-ready"}`}>
                  {isRunning ? "Running" : "Standing by"}
                </div>
                <button
                  className="primary"
                  onClick={runWorkflow}
                  disabled={isRunning || selectedIds.length === 0}
                >
                  {isRunning ? "Running installer..." : "Run full install"}
                </button>
              </div>
            </div>

            {flowError && <p className="error">{flowError}</p>}

            <ol className="flow-steps">
              {FLOW_STEPS.map((step) => {
                const state = stepStates[step.id];

                return (
                  <li key={step.id} className="flow-step">
                    <div className={`flow-marker status-${state.status}`} aria-hidden>
                      <span />
                    </div>
                    <div className="flow-body">
                      <div className="flow-row">
                        <div>
                          <div className="flow-title">{step.title}</div>
                          <div className="muted small">{step.description}</div>
                        </div>
                        <span className={`pill status-${state.status}`}>
                          {state.status === "idle" ? "Pending" : state.status === "running" ? "Running" : state.status}
                        </span>
                      </div>
                      <p className="flow-message">{state.message}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="card">
            <div className="card-header">
              <div>
                <h3>Latest run</h3>
                <p className="muted small">
                  Review the outcome from the most recent workflow execution.
                </p>
              </div>
              <button className="ghost" onClick={() => setStepStates(buildInitialSteps())} disabled={isRunning}>
                Reset steps
              </button>
            </div>

            {activeInstallId && (
              <p className="muted">Running installer for {activeInstallId}...</p>
            )}

            {lastResult ? (
              <ul className="install-list rich-list compact">
                {FLOW_STEPS.map((step) => {
                  const result = lastResult[step.id];
                  return (
                    <li key={step.id}>
                      <div className="install-meta">
                        <div className="install-name-row">
                          <span className="install-name">{step.title}</span>
                          <span className={`pill status-${result?.status ?? "pending"}`}>
                            {result?.status ?? "pending"}
                          </span>
                        </div>
                        <div className="install-path">{describeStep(step.id, result)}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="muted">No runs yet. Start the workflow to see results.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}