import React, { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import Modal from "@/components/Modal";
import { http, formatError } from "@/lib/api";

export default function DeleteAction({ label, name, url, description, onDeleted, fallbackFocusRef, beforeDelete }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const deleting = useRef(false);
  async function remove() {
    if (deleting.current) return;
    deleting.current = true; setBusy(true); setError("");
    try {
      if (beforeDelete && !(await beforeDelete())) throw new Error("Save or recover your notes before deleting this item.");
      await http.delete(url);
      setOpen(false); onDeleted?.();
    } catch (failure) { setError(formatError(failure)); }
    finally { deleting.current = false; setBusy(false); }
  }
  return <>
    <button type="button" className="btn btn-ghost btn-icon shrink-0 text-muted-foreground hover:text-destructive" aria-label={label} title={label} onClick={() => { setError(""); setOpen(true); }}><Trash2 className="w-4 h-4" /></button>
    {open && <Modal title={`Delete ${name}?`} description={description} fallbackFocusRef={fallbackFocusRef} onClose={() => { if (!deleting.current) setOpen(false); }}>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2"><button className="btn btn-outline" autoFocus disabled={busy} onClick={() => setOpen(false)}>Cancel</button><button className="btn btn-primary bg-destructive text-destructive-foreground" disabled={busy} onClick={remove}>{busy ? "Deleting…" : "Delete permanently"}</button></div>
    </Modal>}
  </>;
}
