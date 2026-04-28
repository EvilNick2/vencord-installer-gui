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
import "../css/InstallPage.css";

const DISCORD_PROCESS_ORDER = ["discord", "discordptb", "discordcanary"] as const;

const FLOW_STEPS: { id: keyof PatchFlowResult; title: string; description: string }[] = [
  { id: "closeDiscord",    title: "Close Discord",    description: "Stops running clients so files can be updated safely" },
  { id: "backup",          title: "Backup Vencord",   description: "Copies your current Vencord files to a backup folder" },
  { id: "syncRepo",        title: "Sync repository",  description: "Clones or updates the configured Vencord repository" },
  { id: "build",           title: "Build files",      description: "Builds the latest Vencord artifacts" },
  { id: "inject",          title: "Inject Vencord",   description: "Installs the patched files into the selected Discord client(s)" },
  { id: "downloadThemes",  title: "Download themes",  description: "Fetches a set of community themes into your Vencord folder" },
  { id: "reopenDiscord",   title: "Reopen Discord",   description: "Starts Discord again after patching completes" },
];

type StepVisualStatus = FlowStepStatus | "idle";
type StepState = { status: StepVisualStatus; message: string };
type StepStateMap = Record<keyof PatchFlowResult, StepState>;

const normalizeProcessName = (name: string) => name.toLowerCase().replace(/\.exe$/, "");

const buildInitialSteps = (): StepStateMap =>
  FLOW_STEPS.reduce((acc, step) => ({ ...acc, [step.id]: { status: "idle", message: step.description } }), {} as StepStateMap);

const buildRunningSteps = (): StepStateMap => {
  const base = buildInitialSteps();
  const first = FLOW_STEPS[0]?.id;
  if (first) base[first] = { status: "running", message: "Running..." };
  return base;
};

const describeStep = (stepId: keyof PatchFlowResult, result?: FlowStepResult<unknown>): string => {
  if (!result) return "Not started";
  if (result.message) return result.message;
  switch (stepId) {
    case "closeDiscord": {
      const detail = result.detail as string[] | undefined;
      if (result.status === "skipped") return "Skipped";
      return detail?.length ? `Closed ${detail.length} client(s)` : "No running clients closed";
    }
    case "backup": {
      const detail = result.detail as { sourcePath?: string; backupPath?: string } | undefined;
      if (result.status === "skipped") return "Skipped";
      return detail?.backupPath ? `Saved to ${detail.backupPath}` : "Backup completed";
    }
    case "syncRepo": return (result.detail as string | undefined) ? `Synced at ${result.detail}` : "Repository synced";
    case "build":
    case "inject":         return (result.detail as string | undefined) || `${stepId} completed`;
    case "downloadThemes": return (result.detail as string | undefined) || "Themes downloaded";
    case "reopenDiscord": {
      const detail = result.detail as string[] | undefined;
      if (result.status === "skipped") return "Skipped";
      return detail?.length ? `Restarted ${detail.length} client(s)` : "Restarted";
    }
    default: return "Completed";
  }
};

const mapFlowToSteps = (result: PatchFlowResult): StepStateMap =>
  FLOW_STEPS.reduce((acc, step) => {
    const r = result[step.id];
    acc[step.id] = { status: r?.status ?? "pending", message: describeStep(step.id, r) };
    return acc;
  }, {} as StepStateMap);

const isDiscordRunning = (install: DiscordInstall, processes: DiscordProcess[]): boolean => {
  const path = install.path.toLowerCase();
  return processes.some(
    (p) =>
      (p.exe && p.exe.toLowerCase().startsWith(path)) ||
      p.name.toLowerCase().replace(/[^a-z]/g, "").includes(install.id.toLowerCase().replace(/[^a-z]/g, ""))
  );
};

const stepBadgeLabel = (status: StepVisualStatus): string => {
  switch (status) {
    case "idle":      return "Waiting";
    case "pending":   return "Pending";
    case "running":   return "Running";
    case "completed": return "Done";
    case "failed":    return "Failed";
    case "skipped":   return "Skipped";
    default:          return status;
  }
};

const stepBadgeCls = (status: StepVisualStatus): string => {
  switch (status) {
    case "running":   return "running";
    case "completed": return "done";
    case "failed":    return "failed";
    case "skipped":   return "skipped";
    default:          return "idle";
  }
};

const stepCardCls = (status: StepVisualStatus): string => {
  switch (status) {
    case "running":   return "pipe-step running";
    case "completed": return "pipe-step done";
    case "failed":    return "pipe-step failed";
    default:          return "pipe-step";
  }
};

const stepNumContent = (index: number, status: StepVisualStatus): string => {
  if (status === "completed") return "✓";
  if (status === "failed")    return "✕";
  if (status === "skipped")   return "-";
  return String(index + 1);
};

export default function InstallPage() {
  const [installs, setInstalls] = useState<DiscordInstall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userOptions, setUserOptions] = useState<UserOptions | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [openClients, setOpenClients] = useState<DiscordProcess[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [flowError, setFlowError] = useState<string | null>(null);
  const [stepStates, setStepStates] = useState<StepStateMap>(buildInitialSteps);

  useEffect(() => {
    const load = async () => {
      setError(null);
      setLoading(true);
      try {
        const [installsData, optionsData] = await Promise.all([getDiscordInstalls(), getUserOptions()]);
        setInstalls(installsData);
        setUserOptions(optionsData);
        const fromOptions = installsData.filter((i) => optionsData.selectedDiscordClients.includes(i.id)).map((i) => i.id);
        setSelectedIds(fromOptions.length > 0 ? fromOptions : installsData.find((d) => d.id === "stable") ? ["stable"] : []);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  useEffect(() => {
    listDiscordProcesses()
      .then((clients) => {
        const seen = new Map<string, DiscordProcess>();
        for (const c of clients) {
          const n = normalizeProcessName(c.name);
          if (!seen.has(n)) seen.set(n, c);
        }
        const ordered = [...seen.values()].sort((a, b) => {
          const ai = DISCORD_PROCESS_ORDER.indexOf(normalizeProcessName(a.name) as typeof DISCORD_PROCESS_ORDER[number]);
          const bi = DISCORD_PROCESS_ORDER.indexOf(normalizeProcessName(b.name) as typeof DISCORD_PROCESS_ORDER[number]);
          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        });
        setOpenClients(ordered);
      })
      .catch(() => {});
  }, []);

  const persistSelectedClients = (next: string[]) => {
    if (!userOptions) return;
    const opts = { ...userOptions, selectedDiscordClients: next };
    setUserOptions(opts);
    updateUserOptions(opts).then(setUserOptions).catch((e) => setError(String(e)));
  };

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      persistSelectedClients(next);
      return next;
    });
  };

  const selectedInstalls = useMemo(() => installs.filter((i) => selectedIds.includes(i.id)), [installs, selectedIds]);

  const runWorkflow = async () => {
    if (selectedInstalls.length === 0 || isRunning) return;
    setFlowError(null);
    setIsRunning(true);
    setStepStates(buildRunningSteps());
    let unlisten: UnlistenFn | null = null;
    try {
      unlisten = await listen<PatchFlowStepEvent>("patch-flow-step", (event) => {
        const payload = event.payload;
        if (!payload) return;
        setStepStates((prev) => {
          const updated = { ...prev } as StepStateMap;
          const { step, ...result } = payload;
          updated[step] = { status: result.status, message: result.message || describeStep(step, result) };
          return updated;
        });
      });
      const result = await runPatchFlow();
      setStepStates(mapFlowToSteps(result));
    } catch (err) {
      setFlowError(String(err));
      setStepStates(buildInitialSteps());
    } finally {
      if (unlisten) await unlisten();
      setIsRunning(false);
    }
  };

  return (
    <section>
      <div style={{ marginBottom: "1rem" }}>
        <div className="page-heading">Install</div>
        <div style={{ fontSize: "0.6875rem", color: "var(--text-faint)", marginTop: "2px" }}>
          Select your Discord clients and run the install pipeline.
        </div>
      </div>

      {error && <p className="error" style={{ marginBottom: "0.75rem", fontSize: "0.75rem" }}>{error}</p>}
      {flowError && <p className="error" style={{ marginBottom: "0.75rem", fontSize: "0.75rem" }}>{flowError}</p>}

      <div className="install-grid install-grid--full">
        <div className="panel">
          <div className="panel-header">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            Discord Clients
          </div>

          <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {loading && <p className="muted small">Scanning...</p>}
            {!loading && installs.length === 0 && !error && (
              <p className="muted small">No Discord installations found.</p>
            )}
            {installs.map((inst) => {
              const selected = selectedIds.includes(inst.id);
              const running = isDiscordRunning(inst, openClients);
              return (
                <button
                  key={inst.id}
                  type="button"
                  className={`install-client${selected ? " selected" : ""}`}
                  onClick={() => toggle(inst.id)}
                  disabled={isRunning}
                >
                  <div className="install-check">
                    <div className="install-check-mark" />
                  </div>
                  <div className="install-client-info">
                    <div className="install-client-name">{inst.name}</div>
                    <div className="install-client-path">{inst.path}</div>
                  </div>
                  <div className={`install-client-dot ${running ? "running" : "stopped"}`} />
                </button>
              );
            })}
          </div>

          <div className="panel-footer">
            <button
              type="button"
              className="install-btn-primary"
              onClick={() => void runWorkflow()}
              disabled={isRunning || selectedIds.length === 0}
            >
              {isRunning ? "Installing…" : "Install Vencord"}
            </button>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
            Pipeline
          </div>

          <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {FLOW_STEPS.map((step, i) => {
              const state = stepStates[step.id];
              return (
                <div key={step.id} className={stepCardCls(state.status)}>
                  <div className="pipe-step__num">{stepNumContent(i, state.status)}</div>
                  <div className="pipe-step__info">
                    <div className="pipe-step__name">{step.title}</div>
                    <div className="pipe-step__detail">{state.message}</div>
                  </div>
                  <span className={`pipe-step__badge ${stepBadgeCls(state.status)}`}>
                    {stepBadgeLabel(state.status)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
