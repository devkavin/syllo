import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { http, formatError } from "@/lib/api";
import { Plus, FileText, Trash2, Loader2, Check, Sparkles, X, PanelLeftOpen, Maximize2, Minimize2 } from "lucide-react";
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
import ActiveFocusBar from "@/components/ActiveFocusBar";
import NotebookPractice from "@/components/NotebookPractice";
import NotebookRecovery from "@/components/NotebookRecovery";
import NotebookHistory from "@/components/NotebookHistory";
import NewNoteDialog from "@/components/NewNoteDialog";
import { useAuth } from "@/lib/auth";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useNotebookLayout } from "@/lib/workspaceLayout";
import { TimerAlarmControls } from "@/components/TimerAlarm";

export default function Notebooks() {
  const accountId = useAuth()?.user?.user_id;
  return <NotebookWorkspace key={accountId || "unavailable"} accountId={accountId} />;
}

function NotebookWorkspace({ accountId }) {
  const [params, setParams] = useSearchParams();
  const { expanded, setExpanded } = useNotebookLayout();
  const [listOpen, setListOpen] = useState(() => params.get("trash") === "1");
  const [optionsOpen, setOptionsOpen] = useState(false);
  const scrollBeforeLayout = useRef(null);
  const notebookMenuTrigger = useRef(null);
  const optionsTrigger = useRef(null);
  const changeExpanded = useCallback(value => { scrollBeforeLayout.current = window.scrollY; setExpanded(value); }, [setExpanded]);
  useLayoutEffect(() => {
    if (scrollBeforeLayout.current !== null) {
      window.scrollTo({ top: scrollBeforeLayout.current, behavior: "instant" });
      scrollBeforeLayout.current = null;
    }
  }, [expanded]);
  const location = useLocation();
  const requestedId = params.get("notebook");
  const requestedTrash = params.get("trash") === "1";
  const trashIntent = useRef(requestedTrash);
  trashIntent.current = requestedTrash;
  useEffect(() => { if (requestedTrash) setListOpen(true); }, [requestedTrash, location.key]);
  const requestedNew = params.get("new") === "1";
  const [newNoteOpen, setNewNoteOpen] = useState(false);
  useEffect(() => {
    if (!expanded) return;
    const exitOnEscape = event => {
      if (event.key === "Escape" && !event.defaultPrevented && !event.isComposing && !listOpen && !optionsOpen && !newNoteOpen &&
          event.target?.tagName !== "SELECT" && !document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]')) changeExpanded(false);
    };
    window.addEventListener("keydown", exitOnEscape);
    return () => window.removeEventListener("keydown", exitOnEscape);
  }, [expanded, listOpen, optionsOpen, newNoteOpen, changeExpanded]);
  const commandNavigation = useRef(null);
  const commandActive = useRef(true);
  const [list, setList] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const listRequest = useRef(0);
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
  const [mode, setMode] = useState("write");
  const [online, setOnline] = useState(() => navigator.onLine !== false);
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
  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine !== false);
    window.addEventListener("online", updateOnline); window.addEventListener("offline", updateOnline);
    return () => { window.removeEventListener("online", updateOnline); window.removeEventListener("offline", updateOnline); };
  }, []);
  const deviceDraftSaved = !online && saveState === "failed" && autosave.deviceSaved;

  const load = async () => {
    const request = ++listRequest.current;
    setLoadingList(true); setLoadError(null);
    try {
      const [ls, ss] = await Promise.all([http.get("/notebooks"), http.get("/subjects")]);
      if (request !== listRequest.current) return;
      setList(ls.data);
      setSubjects(ss.data);
      setLoaded(true);
    } catch (e) { if (request === listRequest.current) setLoadError({ message: formatError(e) }); }
    finally { if (request === listRequest.current) setLoadingList(false); }
  };
  useEffect(() => { commandActive.current = true; load(); return () => { selectionRequest.current += 1; listRequest.current += 1; commandActive.current = false; }; }, []);
  useEffect(() => {
    if (!requestedNew || busy || commandNavigation.current === location.key) return;
    commandNavigation.current = location.key;
    setParams(previous => { const next = new URLSearchParams(previous); next.delete("new"); return next; }, { replace: true });
    void (async () => {
      const saved = await autosave.flush();
      if (!commandActive.current) return;
      if (!saved) { setErr("Save or recover your current draft before creating a notebook."); return; }
      setNewNoteOpen(true);
    })();
  }, [requestedNew, location.key, busy]);
  useEffect(() => {
    if (!loaded) return;
    const id = requestedId || (!activeId ? list[0]?.notebook_id : null);
    if (!id || id === activeId) return;
    if (busy) { deferredSelection.current = id; return; }
    void selectNotebook(id, { fromRoute: true });
  }, [requestedId, loaded]);
  useEffect(() => {
    if (!busy && deferredSelection.current) {
      const id = deferredSelection.current; deferredSelection.current = null;
      if (id !== activeId) void selectNotebook(id, { fromRoute: true });
    }
  }, [busy]);

  const adoptNotebook = (data, { keepMenuOpen = false } = {}) => {
    if (!keepMenuOpen) setListOpen(false);
    setOptionsOpen(false);
    deferredSelection.current = null;
    setNotebook(data); setActiveId(data.notebook_id); setSummary(null); setErr(""); setLoadError(null);
    setHistory(null); setHistoryLoading(false); setHistoryError(""); setRecoveryError(""); setEditorVersion(0); setPracticeOpen(false); setMode("write");
    setParams(previous => { const next = new URLSearchParams(previous); next.set("notebook", data.notebook_id); if (!keepMenuOpen) next.delete("trash"); return next; }, { replace: true });
  };

  const selectNotebook = async (id, { fromRoute = false } = {}) => {
    const request = ++selectionRequest.current;
    const canKeepDeviceDraft = navigator.onLine === false && autosave.canKeepDeviceDraft();
    if (activeId && id !== activeId && !canKeepDeviceDraft && !(await autosave.flush())) { setErr("Save or retry your current draft before switching notebooks."); return; }
    if (request !== selectionRequest.current) return;
    setLoadError(null);
    try {
      const { data } = await http.get(`/notebooks/${id}`);
      if (request !== selectionRequest.current) return;
      // Draft edits or another tab's storage write can happen while loading the next note.
      const draftStillSafe = navigator.onLine === false && autosave.canKeepDeviceDraft();
      if (activeId && id !== activeId && !draftStillSafe && !(await autosave.flush())) { setErr("Save or retry your current draft before switching notebooks."); return; }
      if (request !== selectionRequest.current) return;
      adoptNotebook(data, { keepMenuOpen: fromRoute && trashIntent.current });
    } catch (e) { if (request === selectionRequest.current) setLoadError({ message: formatError(e), notebookId: id }); }
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
    <div className="flex flex-col gap-3 min-h-[75dvh] w-full min-w-0" data-testid="notebooks-page" data-expanded={expanded}>
      <h1 className="sr-only">Notebooks</h1>
      <div className={`notebook-workspace-toolbar sticky ${expanded ? "top-0" : "top-16 md:top-0"} z-30 flex items-center gap-2 bg-background/95 border-b border-border py-2 backdrop-blur-sm`}>
      <Sheet open={listOpen} onOpenChange={setListOpen}>
        <SheetTrigger asChild><button ref={notebookMenuTrigger} className="btn btn-outline min-h-11" aria-label="Notebooks"><PanelLeftOpen className="w-4 h-4" /><span>Notebooks</span></button></SheetTrigger>
        <SheetContent side="left" className="w-80 max-w-[90vw] p-4 overflow-y-auto" closeLabel="Close notebooks" aria-describedby={undefined}>
      <aside className="pt-8">
        <SheetTitle className="font-serif text-2xl mb-4">Notebooks</SheetTitle>
        <div className="space-y-1">
          {loadingList && <p role="status" className="text-sm text-muted-foreground py-3">Loading notebooks…</p>}
          {!loadingList && !loadError && list.length === 0 && <div className="text-sm text-muted-foreground py-6 text-center">Start with a blank page.</div>}
          {list.map((nb) => {
            const sub = nb.subject_id ? subjectMap[nb.subject_id] : null;
            const c = sub ? subjectClasses(sub.color, isDark) : null;
            const active = nb.notebook_id === activeId;
            return (
              <button
                key={nb.notebook_id}
                onClick={() => { setListOpen(false); void selectNotebook(nb.notebook_id); }}
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
          <summary className="btn btn-ghost cursor-pointer text-sm text-muted-foreground w-fit">Trash</summary>
          <div className="mt-3 space-y-3 text-sm">
            {trashLoading ? <p role="status">Loading Trash…</p> : trash.length ? trash.map(nb => <div key={nb.notebook_id} className="flex items-center gap-2"><span className="flex-1 min-w-0 truncate">{nb.title || "Untitled"}</span><button className="action-link text-xs" disabled={busy} aria-label={`Restore ${nb.title || "Untitled"}`} onClick={() => restoreTrash(nb)}>Restore</button></div>) : <p className="text-muted-foreground">Trash is empty.</p>}
            {trashError && <p role="alert" className="text-destructive">{trashError}</p>}
            <button className="action-link text-xs" disabled={trashLoading} onClick={loadTrash}>Refresh Trash</button>
          </div>
        </details>
      </aside>
        </SheetContent>
      </Sheet>
      <button className="btn btn-ghost btn-icon min-h-11" disabled={busy} onClick={newNotebook} data-testid="new-notebook-btn" aria-label="New notebook" title="New notebook"><Plus className="w-4 h-4" /></button>
      <button className="btn btn-ghost min-h-11 ml-auto" aria-label={expanded ? "Exit expanded view" : "Expand notebook"} aria-pressed={expanded} onMouseDown={event => event.preventDefault()} onClick={() => changeExpanded(!expanded)}>
        {expanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}{expanded ? <><span className="sm:hidden">Exit</span><span className="hidden sm:inline">Exit expanded view</span></> : <span>Expand</span>}
      </button>
      </div>

      <section className="flex-1 min-w-0">
        {!notebook && <ActiveFocusBar userId={accountId} />}
        {!notebook ? (
          <div className="card h-full grid place-items-center p-10 text-center text-muted-foreground">
            <div>
              <div className="font-serif text-xl mb-1">{loaded && list.length === 0 ? "Start with a blank page." : "Pick a notebook"}</div>
              <div className="text-sm">Or create a new one to start writing.</div>
            </div>
          </div>
        ) : (
          <div inert={busy || undefined} aria-busy={busy} className="notebook-paper paper card p-3 sm:p-4 lg:p-5 min-h-[70dvh] flex flex-col relative min-w-0" data-testid="notebook-editor" data-paper-style={notebook.paper_style || "plain"} data-font-style={notebook.font_style || "sans"} ref={editorRef}>
            <NotebookFocus notebook={notebook} beforeStart={autosave.flush} />
            {autosave.conflict && <NotebookRecovery busy={busy} error={recoveryError} onCopy={recoverCopy} onLoadServer={loadServer} />}
            <div className="flex flex-wrap gap-3 items-center justify-between mb-4 text-sm text-muted-foreground">
              <div className="segmented-control" role="group" aria-label="Notebook mode">
                <button className="segment" aria-pressed={mode === "write"} onMouseDown={event => event.preventDefault()} onClick={() => setMode("write")}>Write</button>
                <button className="segment" aria-pressed={mode === "practice"} onMouseDown={event => event.preventDefault()} onClick={() => { setPracticeOpen(true); setMode("practice"); }}>Practice</button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span role="status" data-testid="notebook-autosave-indicator" className="inline-flex items-center gap-1">
                  {saveState === "saving" && <><Loader2 className="w-3 h-3 animate-spin" /> Saving</>}
                  {saveState === "saved" && <><Check className="w-3 h-3" /> Saved</>}
                  {saveState === "failed" && <button className="action-link min-h-11" onClick={autosave.retry}>{deviceDraftSaved ? "Saved on device · pending sync" : "Not saved · Retry"}</button>}
                  {saveState === "conflict" && <span className="text-amber-700 dark:text-amber-300">Draft needs recovery</span>}
                </span>
                <Sheet open={optionsOpen} onOpenChange={setOptionsOpen}><SheetTrigger asChild><button ref={optionsTrigger} aria-label="Notebook options" className="btn btn-ghost min-h-11 text-sm"><span className="sm:hidden">Options</span><span className="hidden sm:inline">Notebook options</span></button></SheetTrigger><SheetContent onCloseAutoFocus={event => { event.preventDefault(); const trigger = optionsTrigger.current; if (trigger?.isConnected && !trigger.closest("[inert]")) trigger.focus(); else notebookMenuTrigger.current?.focus(); }} side="right" className="w-96 max-w-[95vw] overflow-y-auto p-4 pt-12" closeLabel="Close notebook options" aria-describedby={undefined}><SheetTitle className="mb-4">Notebook options</SheetTitle><div className="space-y-3">
                  <NotebookLinks key={activeId} notebook={notebook} subjects={subjects} update={autosave.update} />
                  <fieldset className="border-t border-border pt-3 space-y-2"><legend className="text-xs text-muted-foreground">Page settings</legend><div className="flex flex-wrap gap-3">
                    <label className="flex items-center gap-2">Paper<select aria-label="Notebook paper" className="input w-auto! text-sm" value={notebook.paper_style || "plain"} onChange={e => autosave.update({ paper_style: e.target.value })}><option value="plain">Plain</option><option value="ruled">Ruled</option><option value="dotted">Dotted</option></select></label>
                    <label className="flex items-center gap-2">Font<select aria-label="Notebook font" className="input w-auto! text-sm" value={notebook.font_style || "sans"} onChange={e => autosave.update({ font_style: e.target.value })}><option value="sans">Sans</option><option value="serif">Serif</option><option value="mono">Mono</option></select></label>
                  </div></fieldset>
                  <button className="btn btn-ghost w-full justify-start text-sm" onClick={() => { setOptionsOpen(false); void loadHistory(); }}>Version history</button>
                  <button className="btn btn-ghost w-full justify-start text-sm" onClick={() => { setOptionsOpen(false); exportNotebook(); }}>Export JSON</button>
                  <button className="btn btn-ghost w-full justify-start text-sm text-destructive" disabled={busy} onClick={() => { setOptionsOpen(false); void removeNotebook(notebook.notebook_id); }} data-testid="notebook-delete-btn"><Trash2 className="w-3.5 h-3.5" /> Move to Trash</button>
                  <button className="btn btn-outline w-full justify-start text-sm" onClick={() => { setOptionsOpen(false); void summarize(); }} disabled={summarizing} data-testid="notebook-summarize-btn" aria-label="Summarize with Study Companion" title="Summarize with Study Companion">{summarizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}Summarize</button>
                  <AiPrivacyNote />
                <TimerAlarmControls /></div></SheetContent></Sheet>
              </div>
            </div>
            {saveState === "failed" && autosave.error && <p className="mb-3 text-xs text-muted-foreground">{autosave.error}</p>}
            {history !== null && <div className="mb-4"><NotebookHistory versions={history} loading={historyLoading} busy={busy} error={historyError} onRestore={restoreVersion} onRetry={loadHistory} /></div>}
            <input
              aria-label="Notebook title"
              className="bg-transparent w-full font-display text-2xl sm:text-3xl border-none placeholder:text-muted-foreground mb-4 rounded-md p-1"
              placeholder="A quiet title"
              value={notebook.title || ""}
              onChange={onTitleChange}
              data-testid="notebook-title-input"
            />
            <div className="flex-1 min-w-0" ref={notesRef} hidden={mode !== "write"}>
              <NotebookEditor key={`${activeId}.${editorVersion}`} notebook={notebook} theme={theme} editorRef={richEditorRef} onChange={autosave.update} />
            </div>
            {practiceOpen && <div id="notebook-practice" hidden={mode !== "practice"} className="mt-2"><NotebookPractice key={activeId} notebook={notebook} getSelectedText={getSelectedText} beforeStart={autosave.flush} /></div>}
            {mode === "write" && <ExplainPopover
              key={activeId}
              textareaRef={notesRef}
              getSelectedText={getSelectedText}
              containerRef={editorRef}
              subjectName={notebook.subject_id ? subjectMap[notebook.subject_id]?.name : null}
            />}
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
        {loadError && <div role="alert" className="text-destructive text-sm mt-2 space-y-2"><p>{loadError.message}</p><button className="btn btn-outline" disabled={loadingList} onClick={() => { if (loadError.notebookId) void selectNotebook(loadError.notebookId); else void load(); }}>Retry loading</button></div>}
      </section>
      {newNoteOpen && <NewNoteDialog subjects={{ data: subjects, loading: loadingList, failed: !!loadError && !loaded, retry: load }} onClose={() => { setNewNoteOpen(false); void load(); }} />}
    </div>
  );
}

function NotebookLinks({ notebook, subjects, update }) {
  const [unitId, setUnitId] = useState(null);
  useEffect(() => { let live = true; if (notebook.lesson_id) http.get(`/lessons/${notebook.lesson_id}`).then(r => { if (live) setUnitId(r.data.unit_id); }).catch(() => {}); return () => { live = false; }; }, [notebook.lesson_id]);
  return <section className="space-y-2"><h2 className="text-xs text-muted-foreground">{notebook.lesson_id ? "Linked lesson" : "Link to a subject or lesson"}</h2><AcademicSelector subjects={subjects} value={{ subject_id: notebook.subject_id, unit_id: unitId, lesson_id: notebook.lesson_id }} onChange={v => { setUnitId(v.unit_id); update({ subject_id: v.subject_id, lesson_id: v.lesson_id }); }} />{notebook.lesson_id && <Link className="btn btn-ghost w-full justify-start" to={`/lessons/${notebook.lesson_id}`}>Open lesson</Link>}</section>;
}
