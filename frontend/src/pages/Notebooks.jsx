import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import NotebookEditor from "@/components/NotebookEditor";
import NotebookFocus from "@/components/NotebookFocus";
import NotebookPractice from "@/components/NotebookPractice";
import NotebookRecovery from "@/components/NotebookRecovery";
import NotebookHistory from "@/components/NotebookHistory";
import { useAuth } from "@/lib/auth";
import { Link, useSearchParams } from "react-router-dom";

export default function Notebooks() {
  const accountId = useAuth()?.user?.user_id;
  return <NotebookWorkspace key={accountId || "unavailable"} accountId={accountId} />;
}

function NotebookWorkspace({ accountId }) {
  const [params, setParams] = useSearchParams();
  const requestedId = params.get("notebook");
  const [list, setList] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [trash, setTrash] = useState([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [trashError, setTrashError] = useState("");
  const [history, setHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [busy, setBusy] = useState(false);
  const [recoveryError, setRecoveryError] = useState("");
  const [editorVersion, setEditorVersion] = useState(0);
  const [practiceOpen, setPracticeOpen] = useState(false);
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
  const notesRef = useRef(null);
  const richEditorRef = useRef(null);
  const getSelectedText = useCallback(() => richEditorRef.current?.getSelectedText() || "", []);
  const selectionRequest = useRef(0);
  const deferredSelection = useRef(null);
  const autosave = useResourceAutosave({ resourceKey: activeId ? `notebook.${activeId}` : null, accountId, versioned: true, initialValue: loadedNotebook, save: async patch => {
    const { data } = await http.patch(`/notebooks/${activeId}`, patch);
    setList(prev => prev.map(n => n.notebook_id === data.notebook_id ? { ...n, ...data } : n));
    return data;
  } });
  const notebook = activeId ? autosave.draft : null;
  const { saveState } = autosave;

  const load = async () => {
    try {
      const [ls, ss] = await Promise.all([http.get("/notebooks"), http.get("/subjects")]);
      setList(ls.data);
      setSubjects(ss.data);
      setLoaded(true);
    } catch (e) { setErr(formatError(e)); }
  };
  useEffect(() => { load(); return () => { selectionRequest.current += 1; }; }, []);
  useEffect(() => {
    if (!loaded) return;
    const id = requestedId || (!activeId ? list[0]?.notebook_id : null);
    if (!id || id === activeId) return;
    if (busy) { deferredSelection.current = id; return; }
    void selectNotebook(id);
  }, [requestedId, loaded]);
  useEffect(() => {
    if (!busy && deferredSelection.current) {
      const id = deferredSelection.current; deferredSelection.current = null;
      if (id !== activeId) void selectNotebook(id);
    }
  }, [busy]);

  const adoptNotebook = data => {
    deferredSelection.current = null;
    setNotebook(data); setActiveId(data.notebook_id); setSummary(null); setErr("");
    setHistory(null); setHistoryLoading(false); setHistoryError(""); setRecoveryError(""); setEditorVersion(0); setPracticeOpen(false);
    setParams(previous => { const next = new URLSearchParams(previous); next.set("notebook", data.notebook_id); return next; }, { replace: true });
  };

  const selectNotebook = async (id) => {
    const request = ++selectionRequest.current;
    if (activeId && id !== activeId && !(await autosave.flush())) { setErr("Save or retry your current draft before switching notebooks."); return; }
    if (request !== selectionRequest.current) return;
    try {
      const { data } = await http.get(`/notebooks/${id}`);
      if (request !== selectionRequest.current) return;
      adoptNotebook(data);
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
  const newNotebook = async () => {
    if (busy) return;
    if (!(await autosave.flush())) { setErr("Save or recover your current draft before creating a notebook."); return; }
    setBusy(true); setErr("");
    try { const { data } = await http.post("/notebooks", { title: "Untitled", content: "" }); setList(l => [data, ...l]); adoptNotebook(data); }
    catch (e) { setErr(formatError(e)); }
    finally { setBusy(false); }
  };
  const removeNotebook = async (id) => {
    if (busy || !window.confirm("Move this notebook to Trash? You can restore it later.")) return;
    setBusy(true); setErr("");
    try {
      if (!(await autosave.flush())) { setErr("Save or recover your draft before moving it to Trash."); return; }
      await http.delete(`/notebooks/${id}`);
      setList(l => l.filter(n => n.notebook_id !== id));
      await loadTrash();
      if (activeId === id) { setActiveId(null); setNotebook(null); setParams(previous => { const next = new URLSearchParams(previous); next.delete("notebook"); return next; }, { replace: true }); }
    } catch (e) { setErr(formatError(e)); }
    finally { setBusy(false); }
  };

  const loadTrash = async () => {
    setTrashLoading(true); setTrashError("");
    try { setTrash((await http.get("/notebooks?trash=true")).data); }
    catch (e) { setTrashError(formatError(e)); }
    finally { setTrashLoading(false); }
  };
  const restoreTrash = async nb => {
    if (busy) return; setBusy(true); setTrashError("");
    try {
      if (!(await autosave.flush())) { setTrashError("Save or recover your current draft first."); return; }
      const { data } = await http.post(`/notebooks/${nb.notebook_id}/restore`, { expected_revision: nb.revision ?? 1 });
      setList(l => [data, ...l.filter(n => n.notebook_id !== data.notebook_id)]);
      setTrash(l => l.filter(n => n.notebook_id !== nb.notebook_id)); adoptNotebook(data);
    } catch (e) { setTrashError(e?.response?.status === 409 ? "This notebook changed. Refresh Trash before restoring." : formatError(e)); }
    finally { setBusy(false); }
  };
  const loadHistory = async () => {
    const request = selectionRequest.current;
    setHistoryLoading(true); setHistoryError(""); setHistory([]);
    try { const { data } = await http.get(`/notebooks/${activeId}/history`); if (request === selectionRequest.current) setHistory(data); }
    catch (e) { if (request === selectionRequest.current) setHistoryError(formatError(e)); }
    finally { if (request === selectionRequest.current) setHistoryLoading(false); }
  };
  const restoreVersion = async version => {
    if (busy) return; setBusy(true); setHistoryError("");
    try {
      if (!(await autosave.flush())) { setHistoryError("Save or recover your current draft before restoring history."); return; }
      const { data } = await http.post(`/notebooks/${activeId}/history/${version.version_id}/restore`, { expected_revision: autosave.getDraft().revision ?? 1 });
      autosave.replace(data); setNotebook(data); setEditorVersion(v => v + 1);
      setList(l => l.map(n => n.notebook_id === data.notebook_id ? { ...n, ...data } : n));
      await loadHistory();
    } catch (e) {
      const current = e?.response?.status === 409 ? e.response.data?.detail?.current : null;
      if (current) autosave.conflictWith(current);
      else setHistoryError(formatError(e));
    } finally { setBusy(false); }
  };
  const loadServer = () => {
    const current = autosave.conflict.current;
    autosave.replace(current); setNotebook(current); setEditorVersion(v => v + 1); setRecoveryError(""); setErr("");
    setList(l => l.map(n => n.notebook_id === current.notebook_id ? { ...n, ...current } : n));
  };
  const recoverCopy = async () => {
    if (busy) return; setBusy(true); setRecoveryError("");
    try {
      const draft = autosave.getDraft();
      const suffix = " (recovered copy)";
      const { data } = await http.post("/notebooks", { title: `${(draft.title || "Untitled").slice(0, 240 - suffix.length)}${suffix}`, content: draft.content || "", rich_content: draft.rich_content ?? null, paper_style: draft.paper_style || "plain", font_style: draft.font_style || "sans", subject_id: draft.subject_id ?? null, lesson_id: draft.lesson_id ?? null });
      autosave.replace(autosave.conflict.current); setList(l => [data, ...l]); adoptNotebook(data);
    } catch (e) { setRecoveryError(formatError(e)); }
    finally { setBusy(false); }
  };
  const exportNotebook = () => {
    try {
      const draft = autosave.getDraft();
      const url = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = `${(draft.title || "notebook").replace(/[<>:"/\\|?*]/g, "_")}.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (e) { setErr(formatError(e)); }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 min-h-[75vh]" data-testid="notebooks-page">
      <aside className="lg:w-60 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h1 className="font-serif text-2xl">Notebooks</h1>
          <button className="btn btn-outline btn-icon" disabled={busy} onClick={newNotebook} data-testid="new-notebook-btn" aria-label="New notebook" title="New notebook"><Plus className="w-4 h-4" /></button>
        </div>
        <div className="space-y-1 max-h-48 lg:max-h-none overflow-y-auto">
          {list.length === 0 && <div className="text-sm text-muted-foreground py-6 text-center">Start with a blank page.</div>}
          {list.map((nb) => {
            const sub = nb.subject_id ? subjectMap[nb.subject_id] : null;
            const c = sub ? subjectClasses(sub.color, isDark) : null;
            const active = nb.notebook_id === activeId;
            return (
              <button
                key={nb.notebook_id}
                onClick={() => selectNotebook(nb.notebook_id)}
                disabled={busy}
                aria-pressed={active}
                data-testid={`notebook-item-${nb.notebook_id}`}
                className={`w-full text-left flex items-start gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${active ? "bg-accent" : "hover:bg-accent/60"}`}
              >
                <FileText className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{nb.title || "Untitled"}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                    {sub && <span className="subject-dot w-1.5! h-1.5!" style={{ background: c.dot }} />}
                    <span className="truncate">{sub?.name || "No subject"}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        <details open={params.get("trash") === "1" || undefined} className="mt-5 border-t border-border pt-3" onToggle={e => { if (e.currentTarget.open) void loadTrash(); }}>
          <summary className="cursor-pointer text-sm text-muted-foreground">Trash</summary>
          <div className="mt-3 space-y-3 text-sm">
            {trashLoading ? <p role="status">Loading Trash…</p> : trash.length ? trash.map(nb => <div key={nb.notebook_id} className="flex items-center gap-2"><span className="flex-1 min-w-0 truncate">{nb.title || "Untitled"}</span><button className="action-link text-xs" disabled={busy} aria-label={`Restore ${nb.title || "Untitled"}`} onClick={() => restoreTrash(nb)}>Restore</button></div>) : <p className="text-muted-foreground">Trash is empty.</p>}
            {trashError && <p role="alert" className="text-destructive">{trashError}</p>}
            <button className="action-link text-xs" disabled={trashLoading} onClick={loadTrash}>Refresh Trash</button>
          </div>
        </details>
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
          <div inert={busy || undefined} aria-busy={busy} className="notebook-paper paper card p-4 sm:p-6 lg:p-8 min-h-[70vh] flex flex-col relative" data-testid="notebook-editor" data-paper-style={notebook.paper_style || "plain"} data-font-style={notebook.font_style || "sans"} ref={editorRef}>
            <NotebookFocus notebook={notebook} beforeStart={autosave.flush} />
            {autosave.conflict && <NotebookRecovery busy={busy} error={recoveryError} onCopy={recoverCopy} onLoadServer={loadServer} />}
            <div className="flex flex-wrap gap-3 items-start justify-between mb-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-3">
                <NotebookLinks key={activeId} notebook={notebook} subjects={subjects} update={autosave.update} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  className="btn btn-outline py-1! px-2! text-xs"
                  onClick={summarize}
                  disabled={summarizing}
                  data-testid="notebook-summarize-btn"
                  aria-label="Summarize with Study Companion" title="Summarize with Study Companion"
                >
                  {summarizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  Summarize
                </button>
                <span role="status" data-testid="notebook-autosave-indicator" className="inline-flex items-center gap-1">
                  {saveState === "saving" && <><Loader2 className="w-3 h-3 animate-spin" /> Saving</>}
                  {saveState === "saved" && <><Check className="w-3 h-3" /> Saved</>}
                  {saveState === "failed" && <button className="text-destructive action-link" onClick={autosave.retry}>Not saved · Retry</button>}
                  {saveState === "conflict" && <span className="text-amber-700 dark:text-amber-300">Draft needs recovery</span>}
                </span>
                <details key={activeId} className="relative"><summary className="cursor-pointer rounded-md px-2 py-1 hover:bg-accent text-xs">Notebook options</summary><div className="absolute right-0 z-30 mt-2 w-72 max-w-[calc(100vw-3rem)] rounded-xl border border-border bg-background p-3 shadow-lg space-y-2">
                  <button className="btn btn-ghost w-full justify-start text-sm" onClick={loadHistory}>Version history</button>
                  <button className="btn btn-ghost w-full justify-start text-sm" onClick={exportNotebook}>Export JSON</button>
                  <button className="btn btn-ghost w-full justify-start text-sm text-destructive" disabled={busy} onClick={() => removeNotebook(notebook.notebook_id)} data-testid="notebook-delete-btn"><Trash2 className="w-3.5 h-3.5" /> Move to Trash</button>
                  {history !== null && <NotebookHistory versions={history} loading={historyLoading} busy={busy} error={historyError} onRestore={restoreVersion} onRetry={loadHistory} />}
                </div></details>
              </div>
            </div>
            <AiPrivacyNote className="mb-3 text-right" />
            {saveState === "failed" && autosave.error && <p className="mb-3 text-xs text-muted-foreground">{autosave.error}</p>}
            <details className="mb-4 text-xs text-muted-foreground"><summary className="cursor-pointer w-fit rounded-md px-2 py-1 hover:bg-accent">Page settings</summary><div className="flex flex-wrap gap-3 items-center mt-3">
              <label className="flex items-center gap-2 whitespace-nowrap">
                Paper
                <select aria-label="Notebook paper" className="input w-auto! py-1! text-xs" value={notebook.paper_style || "plain"} onChange={e => autosave.update({ paper_style: e.target.value })}>
                  <option value="plain">Plain</option>
                  <option value="ruled">Ruled</option>
                  <option value="dotted">Dotted</option>
                </select>
              </label>
              <label className="flex items-center gap-2 whitespace-nowrap">
                Font
                <select aria-label="Notebook font" className="input w-auto! py-1! text-xs" value={notebook.font_style || "sans"} onChange={e => autosave.update({ font_style: e.target.value })}>
                  <option value="sans">Sans</option>
                  <option value="serif">Serif</option>
                  <option value="mono">Mono</option>
                </select>
              </label>
            </div></details>
            <input
              aria-label="Notebook title"
              className="bg-transparent w-full font-display text-2xl sm:text-3xl border-none placeholder:text-muted-foreground mb-4 rounded-md p-1"
              placeholder="A quiet title"
              value={notebook.title || ""}
              onChange={onTitleChange}
              data-testid="notebook-title-input"
            />
            <div className="flex-1 min-w-0" ref={notesRef}>
              <NotebookEditor key={`${activeId}.${editorVersion}`} notebook={notebook} theme={theme} editorRef={richEditorRef} onChange={autosave.update} />
            </div>
            <details id="notebook-practice" key={`practice.${activeId}`} className="mt-5 border-t border-border pt-4" onToggle={e => setPracticeOpen(e.currentTarget.open)}><summary className="cursor-pointer font-medium text-sm">Practice</summary>{practiceOpen && <div className="mt-4"><NotebookPractice key={activeId} notebook={notebook} getSelectedText={getSelectedText} beforeStart={autosave.flush} /></div>}</details>
            <ExplainPopover
              key={activeId}
              textareaRef={notesRef}
              getSelectedText={getSelectedText}
              containerRef={editorRef}
              subjectName={notebook.subject_id ? subjectMap[notebook.subject_id]?.name : null}
            />
            {summary && (
              <div className="mt-4 rounded-lg border border-border p-4 bg-accent/40" data-testid="notebook-summary">
                <div className="flex items-center justify-between mb-2">
                  <div className="inline-flex items-center gap-1.5 text-xs section-title mb-0!"><Sparkles className="w-3.5 h-3.5" /> Study Companion</div>
                  <button aria-label="Close summary" className="btn btn-ghost btn-icon" onClick={() => setSummary(null)}><X className="w-3.5 h-3.5" /></button>
                </div>
                <StudyResponse text={summary} />
                <AiPrivacyNote className="mt-3" />
              </div>
            )}
          </div>
        )}
        {err && <div role="alert" className="text-destructive text-sm mt-2">{err}</div>}
      </section>
    </div>
  );
}

function NotebookLinks({ notebook, subjects, update }) {
  const [unitId, setUnitId] = useState(null);
  useEffect(() => { let live = true; if (notebook.lesson_id) http.get(`/lessons/${notebook.lesson_id}`).then(r => { if (live) setUnitId(r.data.unit_id); }).catch(() => {}); return () => { live = false; }; }, [notebook.lesson_id]);
  return <details><summary className="cursor-pointer">{notebook.lesson_id ? "Linked lesson" : "Link to a subject or lesson"}</summary><div className="mt-3"><AcademicSelector subjects={subjects} value={{ subject_id: notebook.subject_id, unit_id: unitId, lesson_id: notebook.lesson_id }} onChange={v => { setUnitId(v.unit_id); update({ subject_id: v.subject_id, lesson_id: v.lesson_id }); }} />{notebook.lesson_id && <Link className="block action-link mt-2" to={`/lessons/${notebook.lesson_id}`}>Open lesson</Link>}</div></details>;
}
