import React, { useEffect, useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { http, formatError } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { subjectClasses } from "@/lib/palette";
import { Plus, ChevronDown, ChevronRight, Timer, Check, StickyNote } from "lucide-react";
import ExplainPopover from "@/components/ExplainPopover";
import { useResourceAutosave } from "@/hooks/useResourceAutosave";
import Modal from "@/components/Modal";

export default function SubjectDetail() {
  const { id } = useParams();
  const [subject, setSubject] = useState(null);
  const [units, setUnits] = useState([]);
  const [lessonsByUnit, setLessonsByUnit] = useState({});
  const [openUnits, setOpenUnits] = useState({});
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(null);
  const [newName, setNewName] = useState("");
  const [creatingBusy, setCreatingBusy] = useState(false);
  const [createError, setCreateError] = useState("");
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const load = async () => {
    try {
      const [subs, unitsRes] = await Promise.all([http.get("/subjects"), http.get(`/subjects/${id}/units`)]);
      const s = subs.data.find((x) => x.subject_id === id);
      setSubject(s);
      setUnits(unitsRes.data);
      const lessonsRes = await Promise.all(unitsRes.data.map((u) => http.get(`/units/${u.unit_id}/lessons`)));
      const map = {};
      unitsRes.data.forEach((u, i) => { map[u.unit_id] = lessonsRes[i].data; });
      setLessonsByUnit(map);
      // open first unit by default
      if (unitsRes.data[0]) setOpenUnits({ [unitsRes.data[0].unit_id]: true });
    } catch (e) { setErr(formatError(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [id]);

  const openCreate = value => { setNewName(""); setCreateError(""); setCreating(value); };
  const addUnit = () => openCreate({ kind: "unit" });
  const addLesson = unitId => openCreate({ kind: "lesson", unitId });
  const submitCreate = async event => {
    event.preventDefault();
    if (!newName.trim() || creatingBusy) return;
    setCreatingBusy(true); setCreateError("");
    try {
      if (creating.kind === "unit") await http.post("/units", { subject_id: id, name: newName.trim(), order: units.length });
      else await http.post("/lessons", { unit_id: creating.unitId, title: newName.trim(), order: (lessonsByUnit[creating.unitId] || []).length });
      setCreating(null); await load();
    } catch (error) { setCreateError(formatError(error)); }
    finally { setCreatingBusy(false); }
  };
  const cycleStatus = async (lesson) => {
    const next = lesson.status === "not_started" ? "in_progress" : lesson.status === "in_progress" ? "done" : "not_started";
    setLessonsByUnit((m) => ({ ...m, [lesson.unit_id]: m[lesson.unit_id].map((l) => l.lesson_id === lesson.lesson_id ? { ...l, status: next } : l) }));
    try { await http.patch(`/lessons/${lesson.lesson_id}`, { status: next }); } catch (e) { setErr(formatError(e)); load(); }
  };

  const savePreset = async (focus, brk) => {
    setSubject((s) => ({ ...s, focus_minutes: focus, break_minutes: brk }));
    try { await http.patch(`/subjects/${id}`, { focus_minutes: focus, break_minutes: brk }); }
    catch (e) { setErr(formatError(e)); }
  };

  if (loading) return <div className="animate-pulse space-y-4"><div className="h-8 w-64 bg-muted rounded-sm" /><div className="h-64 bg-muted rounded-xl" /></div>;
  if (!subject) return <div>Subject not found. <Link to="/subjects" className="action-link">Go back</Link></div>;

  const c = subjectClasses(subject.color, isDark);

  return (
    <div className="space-y-6" data-testid="subject-detail-page">
      <div>
        <Link to="/subjects" className="text-sm text-muted-foreground hover:text-foreground">Subjects</Link>
        <div className="flex items-center gap-3 mt-2">
          <span className="subject-dot w-3! h-3!" style={{ background: c.dot }} />
          <h1 className="page-title">{subject.name}</h1>
        </div>
        {subject.description && <p className="text-muted-foreground mt-1">{subject.description}</p>}
      </div>

      <div className="flex justify-between items-center">
        <h2 className="font-serif text-xl">Units</h2>
        <button className="btn btn-outline" onClick={addUnit} data-testid="new-unit-btn"><Plus className="w-4 h-4" /> New unit</button>
      </div>

      <PresetCard subject={subject} onSave={savePreset} />

      {err && <div className="text-destructive text-sm">{err}</div>}

      {units.length === 0 ? (
        <div className="card p-10 text-center text-muted-foreground text-sm">
          No units yet. Add your first one to begin.
        </div>
      ) : (
        <div className="space-y-2">
          {units.map((u) => {
            const open = !!openUnits[u.unit_id];
            const lessons = lessonsByUnit[u.unit_id] || [];
            return (
              <div key={u.unit_id} className="card" data-testid={`unit-${u.unit_id}`}>
                <button
                  className="w-full flex items-center gap-3 px-4 py-4 text-left rounded-lg hover:bg-accent/40"
                  aria-expanded={open}
                  onClick={() => setOpenUnits((o) => ({ ...o, [u.unit_id]: !open }))}
                  data-testid={`unit-toggle-${u.unit_id}`}
                >
                  {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  <div className="flex-1">
                    <div className="font-medium">{u.name}</div>
                    <div className="text-xs text-muted-foreground">{lessons.length} lesson{lessons.length === 1 ? "" : "s"}</div>
                  </div>
                </button>
                {open && (
                  <div className="border-t border-border px-4 py-3 space-y-1">
                    {lessons.length === 0 ? (
                      <div className="text-sm text-muted-foreground py-2">No lessons yet.</div>
                    ) : lessons.map((l) => {
                      const statusMeta =
                        l.status === "done"      ? { label: "Done",        color: "hsl(var(--primary))" } :
                        l.status === "in_progress" ? { label: "In progress", color: "hsl(var(--foreground))" } :
                                                     { label: "Not started", color: "hsl(var(--muted-foreground))" };
                      return (
                      <LessonRow
                        key={l.lesson_id}
                        lesson={l}
                        statusMeta={statusMeta}
                        subjectName={subject.name}
                        onStatus={() => cycleStatus(l)}
                        onNotesSaved={(nl) => setLessonsByUnit((m) => ({ ...m, [l.unit_id]: m[l.unit_id].map((x) => x.lesson_id === l.lesson_id ? nl : x) }))}
                      />
                    );})}
                    <button className="btn btn-ghost text-xs mt-1" onClick={() => addLesson(u.unit_id)} data-testid={`add-lesson-${u.unit_id}`}>
                      <Plus className="w-3.5 h-3.5" /> Add a lesson
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {creating && <Modal title={creating.kind === "unit" ? "New unit" : "New lesson"} onClose={() => setCreating(null)}>
        <form onSubmit={submitCreate} className="space-y-4">
          <label className="block text-sm font-medium">{creating.kind === "unit" ? "Unit name" : "Lesson title"}<input className="input mt-2" required autoFocus maxLength={200} value={newName} onChange={e => setNewName(e.target.value)} /></label>
          {createError && <p role="alert" className="text-destructive text-sm">{createError}</p>}
          <button className="btn btn-primary w-full" disabled={creatingBusy}>{creatingBusy ? "Saving…" : creating.kind === "unit" ? "Add unit" : "Add lesson"}</button>
        </form>
      </Modal>}
    </div>
  );
}

function StatusIcon({ status }) {  if (status === "done") {
    return (
      <svg viewBox="0 0 20 20" className="w-4 h-4" aria-hidden="true">
        <circle cx="10" cy="10" r="8.25" fill="currentColor" />
        <path d="M6 10.2 L9 13 L14 7.5" stroke="hsl(var(--card))" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (status === "in_progress") {
    return (
      <svg viewBox="0 0 20 20" className="w-4 h-4" aria-hidden="true">
        <circle cx="10" cy="10" r="8.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10 1.75 A8.25 8.25 0 0 1 10 18.25 Z" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4" aria-hidden="true">
      <circle cx="10" cy="10" r="8.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function LessonRow({ lesson, statusMeta, subjectName, onStatus, onNotesSaved }) {
  const [open, setOpen] = useState(false);
  const autosave = useResourceAutosave({ resourceKey: `lesson.${lesson.lesson_id}`, initialValue: { notes: lesson.notes || "" }, save: async patch => {
    const { data } = await http.patch(`/lessons/${lesson.lesson_id}`, patch);
    onNotesSaved?.(data);
    return { notes: data.notes };
  } });
  const notes = autosave.draft.notes;
  const { saveState } = autosave;
  const containerRef = useRef(null);
  const textareaRef = useRef(null);

  const onChange = (e) => autosave.update({ notes: e.target.value });

  return (
    <div data-testid={`lesson-${lesson.lesson_id}`}>
      <div className="flex items-center gap-3 py-1.5">
        <button
          onClick={onStatus}
          data-testid={`lesson-status-${lesson.lesson_id}`}
          title={`Status: ${statusMeta.label}. Click to change.`}
          className="btn btn-ghost btn-icon text-muted-foreground"
          style={{ color: statusMeta.color }}
          aria-label={`Status: ${statusMeta.label}`}
        >
          <StatusIcon status={lesson.status} />
        </button>
        <div className={`text-sm flex-1 min-w-0 flex items-center gap-2 ${lesson.status === "done" ? "text-muted-foreground line-through" : ""}`}>
          <Link className="action-link min-w-0" to={`/lessons/${lesson.lesson_id}`}>{lesson.title}</Link>
          {lesson.status !== "not_started" && (
            <span
              className="badge shrink-0"
              style={{
                background: `${statusMeta.color}14`,
                color: statusMeta.color,
                borderColor: `${statusMeta.color}33`,
              }}
              data-testid={`lesson-status-pill-${lesson.lesson_id}`}
            >
              {statusMeta.label}
            </span>
          )}
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          data-testid={`lesson-notes-toggle-${lesson.lesson_id}`}
          className={`btn btn-ghost btn-icon ${(lesson.notes && lesson.notes.trim()) ? "text-primary" : "text-muted-foreground"}`}
          title={open ? "Hide notes" : "Open notes"}
          aria-label={open ? "Hide notes" : "Open notes"}
          aria-expanded={open}
        >
          <StickyNote className="w-3.5 h-3.5" />
        </button>
        <div className="text-xs text-muted-foreground font-mono">{Math.round((lesson.total_seconds || 0) / 60)}m</div>
      </div>
      {open && (
        <div ref={containerRef} className="ml-7 mt-1 mb-3 p-3 rounded-lg border border-border bg-accent/20 relative" data-testid={`lesson-notes-panel-${lesson.lesson_id}`}>
          <textarea
            ref={textareaRef}
            aria-label={`Notes for ${lesson.title}`}
            className="w-full resize-y min-h-[80px] bg-transparent text-base leading-relaxed placeholder:text-muted-foreground rounded-md p-2"
            placeholder="Notes for this lesson. Select text to explain it."
            value={notes}
            onChange={onChange}
            data-testid={`lesson-notes-textarea-${lesson.lesson_id}`}
          />
          <div role="status" className="text-xs text-muted-foreground mt-1">
            {saveState === "saving" ? "Saving..." : saveState === "saved" ? "Saved" : ""}
            {saveState === "failed" && <button onClick={autosave.retry}>Not saved · Retry</button>}
          </div>
          <ExplainPopover textareaRef={textareaRef} containerRef={containerRef} subjectName={subjectName} extraTestId={`explain-popover-${lesson.lesson_id}`} />
        </div>
      )}
    </div>
  );
}

function PresetCard({ subject, onSave }) {
  const [focus, setFocus] = React.useState(subject.focus_minutes || 25);
  const [brk, setBrk] = React.useState(subject.break_minutes || 5);
  const [saved, setSaved] = React.useState(false);
  React.useEffect(() => {
    setFocus(subject.focus_minutes || 25);
    setBrk(subject.break_minutes || 5);
  }, [subject.subject_id, subject.focus_minutes, subject.break_minutes]);

  const dirty = focus !== (subject.focus_minutes || 25) || brk !== (subject.break_minutes || 5);
  const save = async () => {
    await onSave(Number(focus) || 25, Number(brk) || 5);
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  return (
    <div className="card-elevated p-5" data-testid="preset-card">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-md grid place-items-center bg-secondary text-primary">
          <Timer className="w-4 h-4" />
        </div>
        <span className="section-title">Focus preset</span>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Pick the focus and break lengths that fit this subject. The timer will pick them up when you study.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <PresetSlider label="Focus" value={focus} onChange={setFocus} min={5} max={90} step={5} testid="preset-focus" />
        <PresetSlider label="Break" value={brk} onChange={setBrk} min={1} max={30} step={1} testid="preset-break" />
      </div>
      <div className="flex justify-end mt-4">
        {saved && <span className="text-xs text-primary inline-flex items-center gap-1 mr-3" data-testid="preset-saved"><Check className="w-3 h-3" /> Saved</span>}
        <button className="btn btn-primary" onClick={save} disabled={!dirty} data-testid="preset-save">Save preset</button>
      </div>
    </div>
  );
}

function PresetSlider({ label, value, onChange, min, max, step, testid }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="text-xs text-muted-foreground">{label}</label>
        <span className="font-mono text-base">{value}m</span>
      </div>
      <input
        aria-label={`${label} duration`}
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full mt-2"
        data-testid={testid}
      />
    </div>
  );
}
