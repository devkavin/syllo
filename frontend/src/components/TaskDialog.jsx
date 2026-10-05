import React, { useEffect, useState } from "react";
import { http, formatError } from "@/lib/api";
import AcademicSelector from "@/components/AcademicSelector";
import Modal from "@/components/Modal";

const PRIORITIES = [
  { id: "low", label: "Low" },
  { id: "normal", label: "Normal" },
  { id: "high", label: "High" },
];

export default function TaskDialog({ subjects, task, prefillLesson, initialDueDate = "", fallbackFocusRef, onClose, onCreated }) {
  const [title, setTitle] = useState(task?.title || "");
  const [selection, setSelection] = useState({ subject_id: task?.subject_id || null, unit_id: task?.unit_id || null, lesson_id: task?.lesson_id || null });
  const [dueDate, setDueDate] = useState(task?.due_date || initialDueDate);
  const [priority, setPriority] = useState(task?.priority || "normal");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { let live = true; if (!task && prefillLesson) http.get(`/lessons/${encodeURIComponent(prefillLesson)}`).then(r => { if (live) setSelection({ subject_id: r.data.subject_id, unit_id: r.data.unit_id, lesson_id: r.data.lesson_id }); }).catch(e => { if (live) setErr(formatError(e)); }); return () => { live = false; }; }, [task, prefillLesson]);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true); setErr("");
    try {
      const body = { title: title.trim(), ...selection, due_date: dueDate || null, priority };
      if (task) await http.patch(`/tasks/${task.task_id}`, body); else await http.post("/tasks", body);
      onCreated(); onClose();
    } catch (e) { setErr(formatError(e)); } finally { setBusy(false); }
  };

  return (
    <Modal title={task ? "Edit task" : "New task"} fallbackFocusRef={fallbackFocusRef} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" data-testid="new-task-modal">
        <div><label htmlFor="task-title" className="field-label">Title</label>
        <input id="task-title" className="input" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Write your task" autoFocus data-testid="new-task-title" /></div>
        <AcademicSelector subjects={subjects} value={selection} onChange={setSelection} disabled={busy} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="task-due" className="field-label">Due date</label>
            <input id="task-due" type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} data-testid="new-task-due" />
          </div>
          <div>
            <label htmlFor="task-priority" className="field-label">Priority</label>
            <select id="task-priority" className="input" value={priority} onChange={(e) => setPriority(e.target.value)} data-testid="new-task-priority">
              {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
        </div>
        {err && <div role="alert" className="text-destructive text-sm mt-3">{err}</div>}
        <button className="btn btn-primary w-full mt-4" disabled={busy} data-testid="new-task-submit">{busy ? "Saving…" : task ? "Save task" : "Add task"}</button>
      </form>
    </Modal>
  );
}
