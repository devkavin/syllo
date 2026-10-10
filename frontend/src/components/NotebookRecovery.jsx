import React from "react";

export default function NotebookRecovery({ busy, error, onCopy, onLoadServer }) {
  return <section className="mb-5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-3" aria-label="Notebook recovery">
    <div role="alert"><p className="font-medium">This notebook changed elsewhere</p><p className="text-sm mt-1">Your draft is kept on this device. Save it as a separate notebook, or load the server version and discard this draft.</p></div>
    <div className="flex flex-wrap gap-2"><button className="btn btn-primary text-sm" disabled={busy} onClick={onCopy}>Save recovered copy</button><button className="btn btn-outline text-sm" disabled={busy} onClick={onLoadServer}>Load server version</button></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}
