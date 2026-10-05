import React, { useEffect, useMemo, useRef, useState } from "react";
import { http, formatError } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { subjectClasses } from "@/lib/palette";
import { Plus, CheckCircle2, Circle, Trash2 } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import TaskDialog from "@/components/TaskDialog";

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

      {showNew && <TaskDialog subjects={subjects} task={editing} prefillLesson={params.get("lesson")} onClose={() => { setShowNew(false); setEditing(null); }} onCreated={load} />}
    </div>
  );
}
