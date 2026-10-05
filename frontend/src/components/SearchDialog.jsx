import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { http, formatError } from "@/lib/api";
import { Search as SearchIcon, BookOpen, FileText, ListTodo, GraduationCap } from "lucide-react";
import Modal from "@/components/Modal";

export default function SearchDialog({ open, onClose, fallbackFocusRef }) {
  const [q, setQ] = useState("");
  const [data, setData] = useState({ subjects: [], lessons: [], notebooks: [], tasks: [] });
  const [err, setErr] = useState("");
  const request = useRef(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    if (!open) return;
    setQ(""); setData({ subjects: [], lessons: [], notebooks: [], tasks: [] }); setErr(""); setSearched(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const id = ++request.current;
    setErr(""); setSearched(false); setData({ subjects: [], lessons: [], notebooks: [], tasks: [] });
    if (q.trim().length === 0) { setLoading(false); return; }
    setLoading(true);
    const timer = setTimeout(async () => {
      try { const { data } = await http.get(`/search?q=${encodeURIComponent(q)}`); if (request.current === id) { setData(data); setSearched(true); } }
      catch (e) { if (request.current === id) setErr(formatError(e)); }
      finally { if (request.current === id) setLoading(false); }
    }, 220);
    return () => { clearTimeout(timer); request.current++; };
  }, [q, open]);

  if (!open) return null;
  const empty = searched && !loading && !err && !data.subjects.length && !data.lessons.length && !data.notebooks.length && !data.tasks.length;

  const goto = (path) => { onClose(); nav(path); };

  return (
    <Modal title="Search" onClose={onClose} fallbackFocusRef={fallbackFocusRef} className="max-w-xl" data-testid="search-dialog">
        <div className="flex items-center gap-3 rounded-lg border border-input px-3">
          <SearchIcon className="w-4 h-4 text-muted-foreground" />
          <input
            className="bg-transparent min-w-0 flex-1 py-3 text-base"
            aria-label="Search your workspace"
            aria-busy={loading}
            placeholder="Search subjects, lessons, notes and tasks"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
            data-testid="search-input"
          />
        </div>
        <div className="max-h-[50dvh] overflow-y-auto">
          {err && <div role="alert" className="p-4 text-sm text-destructive">{err}</div>}
          {loading && <p role="status" className="p-4 text-sm text-muted-foreground">Searching…</p>}
          {q === "" && <div className="p-6 text-sm text-muted-foreground text-center">Type to search across your workspace.</div>}
          {empty && <div className="p-6 text-sm text-muted-foreground text-center">Nothing matched. Try a shorter word.</div>}

          <Section title="Subjects" items={data.subjects} icon={GraduationCap} render={(s) => (
            <button key={s.subject_id} data-testid={`search-subject-${s.subject_id}`} onClick={() => goto(`/subjects/${s.subject_id}`)} className="w-full min-h-11 text-left px-4 py-3 hover:bg-accent rounded-lg text-sm flex items-center gap-3">
              <GraduationCap className="w-4 h-4 text-muted-foreground" /> {s.name}
            </button>
          )} />
          <Section title="Lessons" items={data.lessons} icon={BookOpen} render={(l) => (
            <button key={l.lesson_id} data-testid={`search-lesson-${l.lesson_id}`} onClick={() => goto(`/lessons/${l.lesson_id}`)} className="w-full min-h-11 text-left px-4 py-3 hover:bg-accent rounded-lg text-sm flex items-center gap-3">
              <BookOpen className="w-4 h-4 text-muted-foreground" /> {l.title}
            </button>
          )} />
          <Section title="Notebooks" items={data.notebooks} icon={FileText} render={(n) => (
            <button key={n.notebook_id} data-testid={`search-notebook-${n.notebook_id}`} onClick={() => goto(`/notebooks?notebook=${n.notebook_id}`)} className="w-full min-h-11 text-left px-4 py-3 hover:bg-accent rounded-lg text-sm flex items-center gap-3">
              <FileText className="w-4 h-4 text-muted-foreground" /> {n.title || "Untitled"}
            </button>
          )} />
          <Section title="Tasks" items={data.tasks} icon={ListTodo} render={(t) => (
            <button key={t.task_id} data-testid={`search-task-${t.task_id}`} onClick={() => goto(`/tasks?task=${t.task_id}`)} className="w-full min-h-11 text-left px-4 py-3 hover:bg-accent rounded-lg text-sm flex items-center gap-3">
              <ListTodo className="w-4 h-4 text-muted-foreground" /> {t.title}
            </button>
          )} />
        </div>
    </Modal>
  );
}

function Section({ title, items, render }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <h2 className="px-4 pt-3 pb-1 text-xs font-medium text-muted-foreground">{title}</h2>
      <div>{items.map(render)}</div>
    </div>
  );
}
