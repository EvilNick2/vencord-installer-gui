import { useEffect, useMemo, useState } from "react";
import { confirm } from "@tauri-apps/plugin-dialog";
import { type BackupInfo, deleteBackups, listBackups } from "../api";
import { Trash2, RefreshCw, FolderOpen } from "lucide-react";
import "../css/BackupsPage.css";

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
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(date);
};

export default function BackupsPage() {
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalSize = useMemo(() => backups.reduce((sum, e) => sum + e.sizeBytes, 0), [backups]);

  const loadBackups = async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await listBackups();
      setBackups(items);
      setSelected((prev) => {
        const next = new Set<string>();
        for (const e of items) { if (prev.has(e.name)) next.add(e.name); }
        return next;
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadBackups(); }, []);

  const toggleSelection = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(selected.size === backups.length ? new Set() : new Set(backups.map((e) => e.name)));
  };

  const onDelete = async () => {
    if (selected.size === 0 || deleting) return;
    const ok = await confirm(
      selected.size === 1 ? "Delete the selected backup?" : `Delete ${selected.size} selected backups?`,
      { title: "Confirm deletion", kind: "warning" },
    );
    if (!ok) return;
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

  const allSelected = backups.length > 0 && selected.size === backups.length;

  return (
    <section>
      <div style={{ marginBottom: "1rem" }}>
        <div className="page-heading">Backups</div>
        <div style={{ fontSize: "0.6875rem", color: "var(--text-faint)", marginTop: "2px" }}>
          Review and delete saved Vencord backups.
        </div>
      </div>

      {error && <p className="error" style={{ marginBottom: "0.75rem", fontSize: "0.75rem" }}>{error}</p>}

      <div className="panel" style={{ height: "calc(100vh - var(--nav-height) - 7rem)" }}>
        <div className="panel-header">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          Stored Backups
          <div className="panel-header-right">
            {backups.length > 0 && (
              <span>{backups.length} backup{backups.length !== 1 ? "s" : ""} · {formatBytes(totalSize)}</span>
            )}
            <button
              type="button"
              className="backups-action-btn"
              onClick={toggleAll}
              disabled={loading || backups.length === 0}
            >
              {allSelected ? "Deselect all" : "Select all"}
            </button>
            <button
              type="button"
              className="backups-action-btn"
              onClick={() => void loadBackups()}
              disabled={loading}
            >
              <RefreshCw size={10} />
              Refresh
            </button>
            <button
              type="button"
              className="backups-action-btn danger"
              onClick={() => void onDelete()}
              disabled={selected.size === 0 || deleting}
            >
              <Trash2 size={10} />
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>

        <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {loading && <p className="muted small">Loading backups…</p>}
          {!loading && backups.length === 0 && !error && (
            <p className="muted small">No backups found.</p>
          )}
          {!loading && backups.map((entry) => (
            <button
              key={entry.name}
              type="button"
              className={`selectable-item${selected.has(entry.name) ? " selected" : ""}`}
              onClick={() => toggleSelection(entry.name)}
            >
              <div className="selectable-check">
                <div className="selectable-check-mark" />
              </div>
              <div className="backups-info">
                <div className="backups-name">{entry.name}</div>
                <div className="backups-date">{formatDate(entry.createdAt)}</div>
                <div className="backups-path">
                  <FolderOpen size={10} />
                  {entry.path}
                </div>
              </div>
              <div className="backups-size">{formatBytes(entry.sizeBytes)}</div>
            </button>
          ))}
        </div>

        {!loading && backups.length > 0 && (
          <div className="panel-footer backups-footer">
            <span style={{ fontSize: "0.6875rem", color: "var(--text-faint)" }}>
              {selected.size > 0 ? `${selected.size} of ${backups.length} selected` : "None selected"}
            </span>
            <button
              type="button"
              className="backups-action-btn danger"
              onClick={() => void onDelete()}
              disabled={selected.size === 0 || deleting}
            >
              <Trash2 size={10} />
              {deleting ? "Deleting…" : `Delete${selected.size > 0 ? ` (${selected.size})` : ""}`}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
