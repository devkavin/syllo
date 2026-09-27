import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { http, formatError } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { subjectClasses } from "@/lib/palette";
import { Plus, ChevronDown, ChevronRight, Circle, CheckCircle2, Loader2, Timer, Check } from "lucide-react";

export default function SubjectDetail() {
  const { id } = useParams();
  const [subject, setSubject] = useState(null);
  const [units, setUnits] = useState([]);
  const [lessonsByUnit, setLessonsByUnit] = useState({});
  const [openUnits, setOpenUnits] = useState({});
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
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

  const addUnit = async () => {
    const name = prompt("Unit name");
    if (!name) return;
    await http.post("/units", { subject_id: id, name, order: units.length });
    load();
  };
  const addLesson = async (unitId) => {
    const title = prompt("Lesson title");
    if (!title) return;
    const l = lessonsByUnit[unitId] || [];
    await http.post("/lessons", { unit_id: unitId, title, order: l.length });
    load();
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

  if (loading) return <div className="animate-pulse space-y-4"><div className="h-8 w-64 bg-muted rounded" /><div className="h-64 bg-muted rounded-xl" /></div>;
  if (!subject) return <div>Subject not found. <Link to="/subjects" className="underline">Go back</Link></div>;

  const c = subjectClasses(subject.color, isDark);

  return (
    <div className="space-y-6" data-testid="subject-detail-page">
      <div>
        <Link to="/subjects" className="text-sm text-muted-foreground hover:text-foreground">Subjects</Link>
        <div className="flex items-center gap-3 mt-2">
          <span className="subject-dot !w-3 !h-3" style={{ background: c.dot }} />
          <h1 className="font-serif text-3xl tracking-tight">{subject.name}</h1>
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
                  className="w-full flex items-center gap-3 px-4 py-3 text-left"
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
                    ) : lessons.map((l) => (
                      <div key={l.lesson_id} className="flex items-center gap-3 py-1.5" data-testid={`lesson-${l.lesson_id}`}>
                        <button onClick={() => cycleStatus(l)} data-testid={`lesson-status-${l.lesson_id}`} className="text-muted-foreground hover:text-foreground">
                          {l.status === "done" ? <CheckCircle2 className="w-4 h-4 text-primary" />
                            : l.status === "in_progress" ? <Loader2 className="w-4 h-4" />
                            : <Circle className="w-4 h-4" />}
                        </button>
                        <div className={`text-sm flex-1 ${l.status === "done" ? "text-muted-foreground line-through" : ""}`}>{l.title}</div>
                        <div className="text-xs text-muted-foreground font-mono">{Math.round((l.total_seconds || 0) / 60)}m</div>
                      </div>
                    ))}
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
        <div className="w-7 h-7 rounded-md grid place-items-center" style={{ background: "hsl(133 24% 92%)", color: "hsl(133 30% 24%)" }}>
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
