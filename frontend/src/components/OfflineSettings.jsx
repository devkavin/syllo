import React, { useState, useSyncExternalStore } from "react";
import { Download } from "lucide-react";
import { offlineNotes } from "@/lib/api";
import { installApp } from "@/lib/installApp";

export default function OfflineSettings() {
  const app = useSyncExternalStore(installApp.subscribe, installApp.getSnapshot, installApp.getSnapshot);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return <div className="space-y-4 text-sm">
    <p className="text-muted-foreground">Recent opened notes are saved on this device for offline editing. Changes sync when you reconnect; conflicting edits ask you to choose a copy. Signing out removes the cached notes.</p>
    <p role="status">{!offlineNotes.available ? "Offline note storage is unavailable in this browser." : app.ready ? "Offline app ready · up to 25 recent notes" : "Open Syllo while connected to prepare offline access."}</p>
    {app.installed ? <p>Installed on this device.</p> : app.installable ? <button className="btn btn-outline" onClick={() => { void installApp.install().catch(() => setMessage("Installation could not open. Use your browser's Install app menu.")); }}><Download className="h-4 w-4" />Install Syllo</button> : <p className="text-muted-foreground">To install, use your browser's Install app menu. On iPhone or iPad, use Safari → Share → Add to Home Screen.</p>}
    <p className="text-muted-foreground">Focus and practice need a connection to start or save. Notes larger than 1 MB stay online. Your browser may clear stored notes when space is low.</p>
    <button className="btn btn-ghost" disabled={busy} onClick={async () => { setBusy(true); await offlineNotes.clearNotes(); setMessage("Cached note copies cleared. Unsynced drafts are kept."); setBusy(false); }}>Clear cached notes</button>
    {message && <p role="status">{message}</p>}
    {app.error && <p role="alert">{app.error}</p>}
  </div>;
}
