import { useEffect, useMemo, useState } from "react";
import { confirm } from "@tauri-apps/plugin-dialog";
import { type BackupInfo, deleteBackups, listBackups } from "../api";

import { Trash2, RefreshCw, FolderOpen, CheckSquare, Square } from "lucide-react";

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);

  return `${value.toFixed(value >= 10 || value === Math.floor(value) ? 0 : 1)} ${units[exponent]}`;
};

const formatDate = (value?: string) => {
  if (!value) return "Unknown";

  const date = new Date(value);

  if (isNaN(date.getDate())) return "Unknown";

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

export default function BackupsPagte() {
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalSize = useMemo(
    () => backups.reduce((sum, entry) => sum + entry.sizeBytes, 0),
    [backups]
  );

  const loadBackups = async () => {
    setLoading(true);
    setError(null);

    try {
      const items = await listBackups();
      setBackups(items);
      setSelected((prev) => {
        const existing = new Set<string>();

        for (const entry of items) {
          if (prev.has(entry.name)) existing.add(entry.name);
        }

        return existing;
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBackups();
  }, []);

  const toggleSelection = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);

      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }

      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === backups.length) {
      setSelected(new Set());
      return;
    }

    setSelected(new Set(backups.map((entry) => entry.name)));
  };

  const onDelete = async () => {
    if (selected.size === 0 || deleting) return;

    const confirmDelete = await confirm(
      selected.size === 1
        ? "Delete the selected backup?"
        : `Delete ${selected.size} selected backups?`,
      { title: "Confirm deletion", kind: "warning" }
    );

    if (!confirmDelete) return;

    setDeleting(true);
    setError(null);

    try {
      await deleteBackups(Array.from(selected));
      await loadBackups();
      setSelected(new Set());
    } catch (err) {
      setError(String(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section>
      <h2>Backups</h2>
      <div className="card">
        <div className="card-header">
          <div>
            <h3>Stored backups</h3>
            <p className="muted">Review and delete saved Vencord backups</p>
          </div>
          <div className="actions">
            <button type="button" onClick={toggleAll} disabled={loading || backups.length === 0}>
              {selected.size === backups.length && backups.length > 0 ? (
                <>
                  <CheckSquare size={16} /> Unselect all
                </>
              ) : (
                <>
                  <Square size={16} /> Select all
                </>
              )}
            </button>
            <button type="button" onClick={loadBackups} disabled={loading}>
              <RefreshCw size={16} /> Refresh
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={selected.size === 0 || deleting}
              className="danger"
            >
              <Trash2 size={16} /> Delete
            </button>
          </div>
        </div>

        {loading && <p>Loading backups...</p>}
        {error && <p className="error">Error: {error}</p>}

        {!loading && backups.length === 0 && <p>No backups found yet</p>}

        {!loading && backups.length > 0 && (
          <>
            <ul className="list">
              {backups.map((entry) => (
                <li key={entry.name} className="list-item">
                  <label className="list-row">
                    <input
                      type="checkbox"
                      checked={selected.has(entry.name)}
                      onChange={() => toggleSelection(entry.name)}
                    />
                    <div className="list-meta">
                      <div className="list-title">{entry.name}</div>
                      <div className="list-description">{formatDate(entry.createdAt)}</div>
                      <div className="list-url">
                        <FolderOpen size={14} /> {entry.path}
                      </div>
                    </div>
                    <div className="list-size">{formatBytes(entry.sizeBytes)}</div>
                  </label>
                </li>
              ))}
            </ul>

            <div className="list-summary">
              <span>Total size: {formatBytes(totalSize)}</span>
              <span>Selected: {selected.size}</span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}