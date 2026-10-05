import React, { useEffect, useMemo, useRef, useState } from "react";
import { http, formatError } from "@/lib/api";
import { Plus, FileText, Trash2, Loader2, Check, Sparkles, X } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { subjectClasses } from "@/lib/palette";
import { useUsage } from "@/lib/usage";
import ExplainPopover from "@/components/ExplainPopover";
import AiPrivacyNote from "@/components/AiPrivacyNote";
import StudyResponse from "@/components/StudyResponse";
import { useResourceAutosave } from "@/hooks/useResourceAutosave";
import AcademicSelector from "@/components/AcademicSelector";
import { Link, useSearchParams } from "react-router-dom";

export default function Notebooks() {
  const [params] = useSearchParams();
  const [list, setList] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [loadedNotebook, setNotebook] = useState(null);
  const [err, setErr] = useState("");
  const [summary, setSummary] = useState(null);
  const [summarizing, setSummarizing] = useState(false);
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { setRemaining } = useUsage();
  const editorRef = useRef(null);
  const textareaRef = useRef(null);
  const selectionRequest = useRef(0);
  const autosave = useResourceAutosave({ resourceKey: activeId ? `notebook.${activeId}` : null, initialValue: loadedNotebook, save: async patch => {
    const { data } = await http.patch(`/notebooks/${activeId}`, patch);
    setList(prev => prev.map(n => n.notebook_id === data.notebook_id ? { ...n, title: data.title, updated_at: data.updated_at } : n));
    return data;
  } });
  const notebook = activeId ? autosave.draft : null;
  const { saveState } = autosave;

  const load = async () => {
    try {
      const [ls, ss] = await Promise.all([http.get("/notebooks"), http.get("/subjects")]);
      setList(ls.data);
      setSubjects(ss.data);
      if (!activeId && ls.data.length > 0) selectNotebook(ls.data.find(n => n.notebook_id === params.get("notebook"))?.notebook_id || ls.data[0].notebook_id);
    } catch (e) { setErr(formatError(e)); }
  };
  useEffect(() => { load(); return () => { selectionRequest.current += 1; }; }, []);

  const selectNotebook = async (id) => {
    const request = ++selectionRequest.current;
    if (activeId && id !== activeId && !(await autosave.flush())) { setErr("Save or retry your current draft before switching notebooks."); return; }
    if (request !== selectionRequest.current) return;
    try {
      const { data } = await http.get(`/notebooks/${id}`);
      if (request !== selectionRequest.current) return;
      setActiveId(id);
      setNotebook(data);
      setSummary(null);
    } catch (e) { if (request === selectionRequest.current) setErr(formatError(e)); }
  };

  const summarize = async () => {
    if (!notebook?.content?.trim()) { setErr("Add some notes first."); return; }
    setSummarizing(true); setErr("");
    try {
      const { data } = await http.post("/ai/summarize", { text: notebook.content });
      setSummary(data.text);
      setRemaining(data.credits_remaining);
    } catch (e) { setErr(formatError(e)); }
    finally { setSummarizing(false); }
  };

  const subjectMap = useMemo(() => Object.fromEntries(subjects.map((s) => [s.subject_id, s])), [subjects]);

  const onTitleChange = (e) => autosave.update({ title: e.target.value });
  const onContentChange = (e) => autosave.update({ content: e.target.value });

  const newNotebook = async () => {
    const { data } = await http.post("/notebooks", { title: "Untitled", content: "" });
    setList((l) => [data, ...l]);
    selectNotebook(data.notebook_id);
  };
  const removeNotebook = async (id) => {
    if (!window.confirm("Delete this notebook?")) return;
    await http.delete(`/notebooks/${id}`);
    setList((l) => l.filter((n) => n.notebook_id !== id));
    if (activeId === id) { setActiveId(null); setNotebook(null); }
  };

  return (
    <div className="flex flex-col md:flex-row gap-6 min-h-[75vh]" data-testid="notebooks-page">
      <aside className="md:w-72 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h1 className="font-serif text-2xl">Notebooks</h1>
          <button className="btn btn-outline !p-2" onClick={newNotebook} data-testid="new-notebook-btn" title="New notebook"><Plus className="w-4 h-4" /></button>
        </div>
        <div className="space-y-1">
          {list.length === 0 && <div className="text-sm text-muted-foreground py-6 text-center">Start with a blank page.</div>}
          {list.map((nb) => {
            const sub = nb.subject_id ? subjectMap[nb.subject_id] : null;
            const c = sub ? subjectClasses(sub.color, isDark) : null;
            const active = nb.notebook_id === activeId;
            return (
              <button
                key={nb.notebook_id}
                onClick={() => selectNotebook(nb.notebook_id)}
                data-testid={`notebook-item-${nb.notebook_id}`}
                className={`w-full text-left flex items-start gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${active ? "bg-accent" : "hover:bg-accent/60"}`}
              >
                <FileText className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{nb.title || "Untitled"}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                    {sub && <span className="subject-dot !w-1.5 !h-1.5" style={{ background: c.dot }} />}
                    <span className="truncate">{sub?.name || "No subject"}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="flex-1 min-w-0">
        {!notebook ? (
          <div className="card h-full grid place-items-center p-10 text-center text-muted-foreground">
            <div>
              <div className="font-serif text-xl mb-1">Pick a notebook</div>
              <div className="text-sm">Or create a new one to start writing.</div>
            </div>
          </div>
        ) : (
          <div className="paper card p-6 md:p-10 min-h-[70vh] flex flex-col relative" data-testid="notebook-editor" ref={editorRef}>
            <div className="flex items-center justify-between mb-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-3">
                <NotebookLinks key={activeId} notebook={notebook} subjects={subjects} update={autosave.update} />
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="btn btn-outline !py-1 !px-2 text-xs"
                  onClick={summarize}
                  disabled={summarizing}
                  data-testid="notebook-summarize-btn"
                  title="Summarize with Study Companion"
                >
                  {summarizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  Summarize
                </button>
                <span data-testid="notebook-autosave-indicator" className="inline-flex items-center gap-1">
                  {saveState === "saving" && <><Loader2 className="w-3 h-3 animate-spin" /> Saving</>}
                  {saveState === "saved" && <><Check className="w-3 h-3" /> Saved</>}
                  {saveState === "failed" && <button className="text-destructive underline" onClick={autosave.retry}>Not saved · Retry</button>}
                </span>
                <button className="btn btn-ghost !p-1.5" onClick={() => removeNotebook(notebook.notebook_id)} data-testid="notebook-delete-btn" title="Delete">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <AiPrivacyNote className="mb-3 text-right" />
            <input
              className="bg-transparent w-full font-serif text-3xl outline-none border-none placeholder:text-muted-foreground/60 mb-4"
              placeholder="A quiet title"
              value={notebook.title || ""}
              onChange={onTitleChange}
              data-testid="notebook-title-input"
            />
            <textarea
              className="bg-transparent w-full flex-1 resize-none outline-none border-none text-base leading-relaxed placeholder:text-muted-foreground/60 font-serif"
              placeholder="Begin here. Autosave will keep up. Select any text to explain it."
              value={notebook.content || ""}
              onChange={onContentChange}
              data-testid="notebook-content-textarea"
              ref={textareaRef}
            />
            <ExplainPopover
              textareaRef={textareaRef}
              containerRef={editorRef}
              subjectName={notebook.subject_id ? subjectMap[notebook.subject_id]?.name : null}
            />
            {summary && (
              <div className="mt-4 rounded-lg border border-border p-4 bg-accent/40" data-testid="notebook-summary">
                <div className="flex items-center justify-between mb-2">
                  <div className="inline-flex items-center gap-1.5 text-xs section-title !mb-0"><Sparkles className="w-3.5 h-3.5" /> Study Companion</div>
                  <button className="btn btn-ghost !p-1" onClick={() => setSummary(null)}><X className="w-3.5 h-3.5" /></button>
                </div>
                <StudyResponse text={summary} />
                <AiPrivacyNote className="mt-3" />
              </div>
            )}
          </div>
        )}
        {err && <div className="text-destructive text-sm mt-2">{err}</div>}
      </section>
    </div>
  );
}

function NotebookLinks({ notebook, subjects, update }) {
  const [unitId, setUnitId] = useState(null);
  useEffect(() => { let live = true; if (notebook.lesson_id) http.get(`/lessons/${notebook.lesson_id}`).then(r => { if (live) setUnitId(r.data.unit_id); }).catch(() => {}); return () => { live = false; }; }, [notebook.lesson_id]);
  return <details><summary className="cursor-pointer">{notebook.lesson_id ? "Linked lesson" : "Link to a subject or lesson"}</summary><div className="mt-3"><AcademicSelector subjects={subjects} value={{ subject_id: notebook.subject_id, unit_id: unitId, lesson_id: notebook.lesson_id }} onChange={v => { setUnitId(v.unit_id); update({ subject_id: v.subject_id, lesson_id: v.lesson_id }); }} />{notebook.lesson_id && <Link className="block underline mt-2" to={`/lessons/${notebook.lesson_id}`}>Open lesson</Link>}</div></details>;
}
