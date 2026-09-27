import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { http, formatError } from "@/lib/api";
import { Search as SearchIcon, X, BookOpen, FileText, ListTodo, GraduationCap } from "lucide-react";

export default function SearchDialog({ open, onClose }) {
  const [q, setQ] = useState("");
  const [data, setData] = useState({ subjects: [], lessons: [], notebooks: [], tasks: [] });
  const [err, setErr] = useState("");
  const timer = useRef(null);
  const nav = useNavigate();

  useEffect(() => {
    if (!open) return;
    setQ(""); setData({ subjects: [], lessons: [], notebooks: [], tasks: [] }); setErr("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length === 0) { setData({ subjects: [], lessons: [], notebooks: [], tasks: [] }); return; }
    timer.current = setTimeout(async () => {
      try { const { data } = await http.get(`/search?q=${encodeURIComponent(q)}`); setData(data); }
      catch (e) { setErr(formatError(e)); }
    }, 220);
  }, [q, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const empty = q.length > 0 && !data.subjects.length && !data.lessons.length && !data.notebooks.length && !data.tasks.length;

  const goto = (path) => { onClose(); nav(path); };

  return (
    <div className="fixed inset-0 z-50 p-4 grid place-items-start pt-24" data-testid="search-dialog">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative card w-full max-w-xl mx-auto overflow-hidden fade-in">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <SearchIcon className="w-4 h-4 text-muted-foreground" />
          <input
            className="bg-transparent flex-1 outline-none text-sm"
            placeholder="Search subjects, lessons, notes and tasks"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
            data-testid="search-input"
          />
          <button className="btn btn-ghost !p-1" onClick={onClose} data-testid="search-close"><X className="w-4 h-4" /></button>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {err && <div className="p-4 text-sm text-destructive">{err}</div>}
          {q === "" && <div className="p-6 text-sm text-muted-foreground text-center">Type to search across your workspace.</div>}
          {empty && <div className="p-6 text-sm text-muted-foreground text-center">Nothing matched. Try a shorter word.</div>}

          <Section title="Subjects" items={data.subjects} icon={GraduationCap} render={(s) => (
            <button key={s.subject_id} data-testid={`search-subject-${s.subject_id}`} onClick={() => goto(`/subjects/${s.subject_id}`)} className="w-full text-left px-4 py-2 hover:bg-accent text-sm flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-muted-foreground" /> {s.name}
            </button>
          )} />
          <Section title="Lessons" items={data.lessons} icon={BookOpen} render={(l) => (
            <button key={l.lesson_id} data-testid={`search-lesson-${l.lesson_id}`} onClick={() => goto(`/subjects/${l.subject_id}`)} className="w-full text-left px-4 py-2 hover:bg-accent text-sm flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-muted-foreground" /> {l.title}
            </button>
          )} />
          <Section title="Notebooks" items={data.notebooks} icon={FileText} render={(n) => (
            <button key={n.notebook_id} data-testid={`search-notebook-${n.notebook_id}`} onClick={() => goto(`/notebooks`)} className="w-full text-left px-4 py-2 hover:bg-accent text-sm flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" /> {n.title || "Untitled"}
            </button>
          )} />
          <Section title="Tasks" items={data.tasks} icon={ListTodo} render={(t) => (
            <button key={t.task_id} data-testid={`search-task-${t.task_id}`} onClick={() => goto(`/tasks`)} className="w-full text-left px-4 py-2 hover:bg-accent text-sm flex items-center gap-2">
              <ListTodo className="w-4 h-4 text-muted-foreground" /> {t.title}
            </button>
          )} />
        </div>
      </div>
    </div>
  );
}

function Section({ title, items, render }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <div className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">{title}</div>
      <div>{items.map(render)}</div>
    </div>
  );
}
