import { useEffect, useState } from "react";
import {
  getDiscordInstalls,
  getUserOptions,
  listDiscordProcesses,
  updateSelectedDiscordClients,
} from "../api";
import type { DiscordInstall, DiscordProcess, UserOptions } from "../api";

const DISCORD_PROCESS_ORDER = ["discord", "discordptb", "discordcanary"] as const;

const normalizeProcessName = (name: string) => name.toLowerCase().replace(/\.exe$/, "");

export default function InstallPage() {
  const [installs, setInstalls] = useState<DiscordInstall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [openClients, setOpenClients] = useState<DiscordProcess[]>([]);
  const [processError, setProcessError] = useState<string | null>(null);
  const [processLoading, setProcessLoading] = useState(true);
  const [options, setOptions] = useState<UserOptions | null>(null);

  useEffect(() => {
    Promise.all([getDiscordInstalls(), getUserOptions()])
      .then(([installsData, userOptions]) => {
        setInstalls(installsData);
        setOptions(userOptions);

        const availableIds = new Set(installsData.map((inst) => inst.id));
        const savedSelection = userOptions.selectedDiscordClients.filter((id) => 
          availableIds.has(id)
        );

        if (savedSelection.length > 0) {
          setSelectedIds(savedSelection);
          updateSelectedDiscordClients(savedSelection).catch((err) =>
            setError(String(err))
          );
          return;
        }

        const stable = installsData.find((d) => d.id === 'stable');
        if (stable) {
          setSelectedIds([stable.id]);
          updateSelectedDiscordClients([stable.id]).catch((err) =>
            setError(String(err))
          );
        } else {
          setSelectedIds([]);
        }
      })
      .catch((err) => {
        setError(String(err));
      })
      .finally(() => setLoading(false));
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

          const aIndex = DISCORD_PROCESS_ORDER.indexOf(aName as (typeof DISCORD_PROCESS_ORDER)[number])
          const bIndex = DISCORD_PROCESS_ORDER.indexOf(bName as (typeof DISCORD_PROCESS_ORDER)[number])

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

  const toggle = (id: string) => {
    setError(null);
    setSelectedIds((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id];

      updateSelectedDiscordClients(next).catch((err) => setError(String(err)));

      if (options) {
        updateSelectedDiscordClients(next).catch((err) => setError(String(err)));
        setOptions({ ...options, selectedDiscordClients: next });
      }

      return next;
    });
  };

  return (
    <section>
      <h2>Install / Repair</h2>

      <div className='card'>
        <h3>Detected Discord clients</h3>

        {loading && <p>Scanning for Discord installs...</p>}
        {error && <p className='error'>Error: {error}</p>}
        {!loading && installs.length === 0 && !error && (
          <p>No Discord installations found.</p>
        )}

        <ul className='install-list'>
          {installs.map((inst) => (
            <li key={inst.id}>
              <label>
                <input
                  type='checkbox'
                  checked={selectedIds.includes(inst.id)}
                  onChange={() => toggle(inst.id)}
                />
                <span className='install-name'>{inst.name}</span>
                <span className='install-path'>{inst.path}</span>
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
          <p>No Discord processes are currently running</p>
        )}

        <ul className="install-list">
          {openClients.map((proc) => (
            <li key={normalizeProcessName(proc.name)}>
              <div className="install-name">{proc.name}</div>
              {proc.exe && <div className="install-path">{proc.exe}</div>}
            </li>
          ))}
        </ul>
      </div>

      <div className='card'>
        <h3>Options</h3>

        <label>
          <input type='checkbox' /> Create backup before patching
        </label>

        <label>
          <input type='checkbox' /> Auto-update Vencord
        </label>
      </div>

      <div className='actions'>
        <button disabled={selectedIds.length === 0}>Install</button>
        <button disabled={selectedIds.length === 0}>Repair</button>
        <button disabled={selectedIds.length === 0}>Uninstall</button>
      </div>
    </section>
  );
}