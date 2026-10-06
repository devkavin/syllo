import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { http, formatError } from "@/lib/api";
import AcademicSelector from "@/components/AcademicSelector";
import Modal from "@/components/Modal";
import { DeskResourceNotice } from "@/components/StudyDesk";

export default function NewNoteDialog({ subjects, onClose, fallbackFocusRef }) {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [selection, setSelection] = useState({ subject_id: null, unit_id: null, lesson_id: null });
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const submitting = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const close = () => { active.current = false; onClose(); };
  const submit = async event => {
    event.preventDefault();
    if (submitting.current || !title.trim()) return;
    submitting.current = true; setBusy(true); setError("");
    try {
      const { data } = await http.post("/notebooks", { title: title.trim(), content: "", subject_id: selection.subject_id, lesson_id: selection.lesson_id });
      if (!active.current) return;
      onClose(); navigate(`/notebooks?notebook=${encodeURIComponent(data.notebook_id)}`);
    } catch (e) { if (active.current) setError(formatError(e)); }
    finally { submitting.current = false; if (active.current) setBusy(false); }
  };
  return <Modal title="New note" description="Write freely. Linking a subject or lesson is optional." onClose={close} fallbackFocusRef={fallbackFocusRef}>
    <form onSubmit={submit} className="space-y-4">
      <div><label htmlFor="desk-note-title" className="field-label">Title</label><input id="desk-note-title" className="input" required maxLength={240} autoFocus value={title} disabled={busy} onChange={e => setTitle(e.target.value)} placeholder="What are you working on?" /></div>
      <DeskResourceNotice resource={subjects} label="subjects" />
      {!subjects.loading && !subjects.failed && <AcademicSelector subjects={subjects.data || []} value={selection} onChange={setSelection} disabled={busy} />}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <button className="btn btn-primary w-full" disabled={busy}>{busy ? "Creating…" : "Create note"}</button>
    </form>
  </Modal>;
}
