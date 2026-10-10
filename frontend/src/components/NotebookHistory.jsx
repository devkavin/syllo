import React from "react";

export default function NotebookHistory({ versions, loading, busy, error, onRestore, onRetry }) {
  return <section className="rounded-lg border border-border p-3 mt-3 space-y-3" aria-label="Notebook history">
    <h2 className="font-medium text-sm">Version history</h2>
    <p className="text-xs text-muted-foreground">Restoring creates a new revision and preserves the current version in history.</p>
    {loading ? <p role="status" className="text-sm">Loading history…</p> : versions.length ? <ul className="space-y-3 max-h-64 overflow-auto">{versions.map(version => <li key={version.version_id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <div className="min-w-0"><p className="truncate">{version.title || "Untitled"} · Version {version.revision}</p><p className="text-xs text-muted-foreground">{new Date(version.created_at).toLocaleString()}</p></div>
      <button className="btn btn-outline text-xs" disabled={busy} onClick={() => onRestore(version)} aria-label={`Restore version ${version.revision}`}>Restore</button>
    </li>)}</ul> : !error && <p className="text-sm text-muted-foreground">No previous versions yet.</p>}
    {error && <div><p role="alert" className="text-sm text-destructive">{error}</p><button className="action-link text-sm" onClick={onRetry}>Retry history</button></div>}
  </section>;
}
