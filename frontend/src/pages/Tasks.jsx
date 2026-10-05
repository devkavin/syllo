import React, { useEffect, useMemo, useRef, useState } from "react";
import { http, formatError } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { subjectClasses } from "@/lib/palette";
import { Plus, CheckCircle2, Circle, Trash2 } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import AcademicSelector from "@/components/AcademicSelector";
import Modal from "@/components/Modal";

const PRIORITIES = [
  { id: "low", label: "Low" },
  { id: "normal", label: "Normal" },
  { id: "high", label: "High" },
];

export default function Tasks() {
  const [params] = useSearchParams();
  const openedTask = useRef(null);
  const [editing, setEditing] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [tab, setTab] = useState("open"); // open | done | all
  const [showNew, setShowNew] = useState(!!params.get("lesson"));
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const load = async () => {
    try {
      const [t, s] = await Promise.all([http.get("/tasks"), http.get("/subjects")]);
      setTasks(t.data); setSubjects(s.data);
    } catch (e) { setErr(formatError(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const id = params.get("task");
    if (!id || openedTask.current === id || loading) return;
    const task = tasks.find(t => t.task_id === id);
    openedTask.current = id;
    if (task) { setEditing(task); setShowNew(true); }
    else setErr("That task is no longer available. Your other tasks are below.");
  }, [params, tasks, loading]);

  const subMap = useMemo(() => Object.fromEntries(subjects.map((x) => [x.subject_id, x])), [subjects]);
  const filtered = tasks.filter((t) => tab === "all" ? true : tab === "done" ? t.completed : !t.completed);

  const toggle = async (t) => {
    setTasks((cur) => cur.map((x) => x.task_id === t.task_id ? { ...x, completed: !x.completed } : x));
    try { await http.patch(`/tasks/${t.task_id}`, { completed: !t.completed }); } catch (e) { setErr(formatError(e)); load(); }
  };
  const remove = async (t) => {
    if (!window.confirm("Delete this task?")) return;
    await http.delete(`/tasks/${t.task_id}`);
    setTasks((cur) => cur.filter((x) => x.task_id !== t.task_id));
  };

  return (
    <div className="space-y-8" data-testid="tasks-page">
      <div className="page-header">
        <div>
          <div className="section-title mb-2">Your list</div>
          <h1 className="page-title">Tasks</h1>
          <p className="text-muted-foreground mt-2">Small steps, gently kept.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)} data-testid="new-task-btn"><Plus className="w-4 h-4" /> New task</button>
      </div>

      <div className="segmented-control" role="group" aria-label="Task filter">
        {["open", "done", "all"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            data-testid={`tasks-tab-${t}`}
            className="segment"
          >
            {t === "open" ? "Open" : t === "done" ? "Done" : "All"}
          </button>
        ))}
      </div>

      {err && <div className="text-destructive text-sm">{err}</div>}

      {loading ? (
        <div className="space-y-2">{[0,1,2,3].map((i) => <div key={i} className="h-14 bg-muted rounded-xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          {tab === "done" ? "Completed tasks will appear here." : "Nothing to do here. Add one when you're ready."}
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {filtered.map((t) => {
            const sub = t.subject_id ? subMap[t.subject_id] : null;
            const c = sub ? subjectClasses(sub.color, isDark) : null;
            return (
              <li key={t.task_id} className="py-3 flex items-center gap-3" data-testid={`task-${t.task_id}`}>
                <button onClick={() => toggle(t)} aria-label={`${t.completed ? "Reopen" : "Complete"} ${t.title}`} aria-pressed={!!t.completed} data-testid={`task-toggle-${t.task_id}`} className="btn btn-ghost btn-icon text-muted-foreground">
                  {t.completed ? <CheckCircle2 className="w-5 h-5 text-primary" /> : <Circle className="w-5 h-5" />}
                </button>
                <div className="flex-1 min-w-0">
                    <button className={`action-link text-left ${t.completed ? "line-through text-muted-foreground" : ""}`} onClick={() => { setEditing(t); setShowNew(true); }}>{t.title}</button>
                    {t.lesson_id && <Link className="action-link" to={`/lessons/${t.lesson_id}`}>Open lesson</Link>}
                  <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5">
                    {sub && <span className="inline-flex items-center gap-1"><span className="subject-dot" style={{ background: c.dot }} />{sub.name}</span>}
                    {t.due_date && <span>Due {t.due_date}</span>}
                    <span className="capitalize">{t.priority}</span>
                  </div>
                </div>
                <button className="btn btn-ghost btn-icon text-muted-foreground" aria-label={`Delete ${t.title}`} onClick={() => remove(t)} data-testid={`task-delete-${t.task_id}`}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {showNew && <NewTaskModal subjects={subjects} task={editing} prefillLesson={params.get("lesson")} onClose={() => { setShowNew(false); setEditing(null); }} onCreated={load} />}
    </div>
  );
}

function NewTaskModal({ subjects, task, prefillLesson, onClose, onCreated }) {
  const [title, setTitle] = useState(task?.title || "");
  const [selection, setSelection] = useState({ subject_id: task?.subject_id || null, unit_id: task?.unit_id || null, lesson_id: task?.lesson_id || null });
  const [dueDate, setDueDate] = useState(task?.due_date || "");
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
    <Modal title={task ? "Edit task" : "New task"} onClose={onClose}>
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
        {err && <div className="text-destructive text-sm mt-3">{err}</div>}
        <button className="btn btn-primary w-full mt-4" disabled={busy} data-testid="new-task-submit">{busy ? "Saving…" : task ? "Save task" : "Add task"}</button>
      </form>
    </Modal>
  );
}
