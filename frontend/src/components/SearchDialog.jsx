import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { http, formatError } from "@/lib/api";
import { Search as SearchIcon, BookOpen, FileText, ListTodo, GraduationCap } from "lucide-react";
import Modal from "@/components/Modal";

const emptyResults = () => ({ subjects: [], lessons: [], notebooks: [], tasks: [], questions: [] });
const COMMANDS = [
  { label: "New note", href: "/notebooks?new=1" },
  { label: "Add task", href: "/tasks?new=1" },
  { label: "Start Focus", href: "/timer" },
  { label: "Due practice", href: "/reviews" },
  { label: "Open Planner", href: "/planner" },
  { label: "Exam overview", href: "/exams" },
];

export default function SearchDialog({ open, onClose, fallbackFocusRef }) {
  const [q, setQ] = useState("");
  const [data, setData] = useState(emptyResults);
  const [err, setErr] = useState("");
  const request = useRef(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    if (!open) return;
    setQ(""); setData(emptyResults()); setErr(""); setSearched(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const id = ++request.current;
    setErr(""); setSearched(false); setData(emptyResults());
    if (q.trim().length === 0) { setLoading(false); return; }
    setLoading(true);
    const timer = setTimeout(async () => {
      try { const { data } = await http.get(`/search?q=${encodeURIComponent(q)}`); if (request.current === id) { setData({ ...emptyResults(), ...data }); setSearched(true); } }
      catch (e) { if (request.current === id) setErr(formatError(e)); }
      finally { if (request.current === id) setLoading(false); }
    }, 220);
    return () => { clearTimeout(timer); request.current++; };
  }, [q, open]);

  if (!open) return null;
  const commands = COMMANDS.filter(command => command.label.toLowerCase().includes(q.trim().toLowerCase()));
  const empty = searched && !loading && !err && !commands.length && !Object.values(data).some(items => items?.length);

  const goto = (path) => { onClose(); nav(path); };

  return (
    <Modal title="Search" onClose={onClose} fallbackFocusRef={fallbackFocusRef} className="max-w-xl" data-testid="search-dialog">
        <div className="flex items-center gap-3 rounded-lg border border-input px-3">
          <SearchIcon className="w-4 h-4 text-muted-foreground" />
          <input
            className="bg-transparent min-w-0 flex-1 py-3 text-base"
            aria-label="Search your workspace"
            aria-busy={loading}
            placeholder="Search notes, questions, tasks or commands"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
            data-testid="search-input"
          />
        </div>
        <div className="max-h-[50dvh] overflow-y-auto">
          {err && <div role="alert" className="p-4 text-sm text-destructive">{err}</div>}
          {loading && <p role="status" className="p-4 text-sm text-muted-foreground">Searching…</p>}
          <Section title="Quick commands" items={commands} render={command => <button key={command.href} className="w-full min-h-11 text-left px-4 py-3 hover:bg-accent rounded-lg text-sm" onClick={() => goto(command.href)}>{command.label}</button>} />
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
          <Section title="Questions & mistakes" items={data.questions} render={question => <button key={question.question_id} className="w-full min-h-11 text-left px-4 py-3 hover:bg-accent rounded-lg text-sm" onClick={() => goto(`/reviews?question=${encodeURIComponent(question.question_id)}`)}><span className="block break-words">{question.prompt}</span><span className="text-xs text-muted-foreground">{question.kind === "mistake" ? "Mistake" : "Practice question"}</span></button>} />
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
