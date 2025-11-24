import { useEffect, useState } from "react";
import { getDiscordInstalls } from "../api";
import type { DiscordInstall } from "../api";

export default function InstallPage() {
  const [installs, setInstalls] = useState<DiscordInstall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    getDiscordInstalls()
      .then((data) => {
        setInstalls(data);

        const stable = data.find((d) => d.id === 'stable');
        if (stable) {
          setSelectedIds([stable.id]);
        } else {
          setSelectedIds([]);
        }
      })
      .catch((err) => {
        setError(String(err));
      })
      .finally(() => setLoading(false));
  }, []);

  const toggle = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
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