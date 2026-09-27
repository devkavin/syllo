import React, { useEffect, useMemo, useState } from "react";
import { http, formatError } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { subjectClasses } from "@/lib/palette";
import { Plus, Trash2, X, Clock } from "lucide-react";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function Timetable() {
  const [items, setItems] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const load = async () => {
    try {
      const [tt, s] = await Promise.all([http.get("/timetable"), http.get("/subjects")]);
      setItems(tt.data); setSubjects(s.data);
    } catch (e) { setErr(formatError(e)); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const subMap = useMemo(() => Object.fromEntries(subjects.map((x) => [x.subject_id, x])), [subjects]);
  const byDay = useMemo(() => {
    const map = Object.fromEntries(DAYS.map((_, i) => [i, []]));
    items.forEach((b) => map[b.day_of_week]?.push(b));
    Object.values(map).forEach((arr) => arr.sort((a, b) => a.start_time.localeCompare(b.start_time)));
    return map;
  }, [items]);

  const remove = async (id) => {
    if (!window.confirm("Delete this block?")) return;
    await http.delete(`/timetable/${id}`);
    load();
  };

  return (
    <div className="space-y-8" data-testid="timetable-page">
      <div className="hero-glow relative rise flex items-end justify-between">
        <div>
          <div className="section-title mb-2">Your week</div>
          <h1 className="font-serif text-4xl tracking-tight">Timetable</h1>
          <p className="text-muted-foreground mt-2">A weekly rhythm for classes and study.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)} data-testid="new-block-btn"><Plus className="w-4 h-4" /> New block</button>
      </div>

      {err && <div className="text-destructive text-sm">{err}</div>}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
          {DAYS.map((d) => <div key={d} className="h-64 bg-muted rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
          {DAYS.map((label, dow) => (
            <div key={label} className="card p-3 min-h-[240px]" data-testid={`day-column-${dow}`}>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">{label}</div>
              <div className="space-y-2">
                {byDay[dow].length === 0 ? (
                  <div className="text-xs text-muted-foreground italic">Nothing scheduled.</div>
                ) : byDay[dow].map((b) => {
                  const sub = b.subject_id ? subMap[b.subject_id] : null;
                  const c = sub ? subjectClasses(sub.color, isDark) : null;
                  return (
                    <div
                      key={b.timetable_id}
                      className="rounded-lg p-2 text-xs border border-border group"
                      style={{ background: c?.bg, color: c?.text }}
                      data-testid={`block-${b.timetable_id}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-medium">{b.title}</div>
                        <button
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => remove(b.timetable_id)}
                          data-testid={`block-delete-${b.timetable_id}`}
                          title="Delete"
                        ><Trash2 className="w-3 h-3" /></button>
                      </div>
                      <div className="mt-1 inline-flex items-center gap-1 opacity-80">
                        <Clock className="w-3 h-3" /> {b.start_time} to {b.end_time}
                      </div>
                      {sub && <div className="mt-0.5 opacity-80">{sub.name}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {showNew && <NewBlockModal subjects={subjects} onClose={() => setShowNew(false)} onCreated={load} />}
    </div>
  );
}

function NewBlockModal({ subjects, onClose, onCreated }) {
  const [title, setTitle] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [dow, setDow] = useState(0);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");
  const [kind, setKind] = useState("class");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true); setErr("");
    try {
      await http.post("/timetable", {
        title: title.trim(), subject_id: subjectId || null, day_of_week: Number(dow),
        start_time: start, end_time: end, kind,
      });
      onCreated(); onClose();
    } catch (e) { setErr(formatError(e)); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <form onSubmit={submit} className="relative card p-6 w-full max-w-md" data-testid="new-block-modal">
        <button type="button" className="btn btn-ghost !p-1 absolute right-2 top-2" onClick={onClose}><X className="w-4 h-4" /></button>
        <h2 className="font-serif text-xl mb-4">New block</h2>
        <label className="text-xs text-muted-foreground">Title</label>
        <input className="input mt-1 mb-3" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Math class" autoFocus data-testid="new-block-title" />
        <label className="text-xs text-muted-foreground">Subject</label>
        <select className="input mt-1 mb-3" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} data-testid="new-block-subject">
          <option value="">No subject</option>
          {subjects.map((s) => <option key={s.subject_id} value={s.subject_id}>{s.name}</option>)}
        </select>
        <label className="text-xs text-muted-foreground">Day</label>
        <select className="input mt-1 mb-3" value={dow} onChange={(e) => setDow(e.target.value)} data-testid="new-block-day">
          {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Start</label>
            <input type="time" className="input mt-1" value={start} onChange={(e) => setStart(e.target.value)} data-testid="new-block-start" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">End</label>
            <input type="time" className="input mt-1" value={end} onChange={(e) => setEnd(e.target.value)} data-testid="new-block-end" />
          </div>
        </div>
        <div className="mt-3">
          <label className="text-xs text-muted-foreground">Kind</label>
          <div className="flex gap-2 mt-1">
            {["class", "study"].map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)} className={`btn text-xs ${kind === k ? "btn-primary" : "btn-outline"}`} data-testid={`new-block-kind-${k}`}>
                {k === "class" ? "Class" : "Study block"}
              </button>
            ))}
          </div>
        </div>
        {err && <div className="text-destructive text-sm mt-3">{err}</div>}
        <button className="btn btn-primary w-full mt-4" disabled={busy} data-testid="new-block-submit">
          {busy ? "Adding" : "Add block"}
        </button>
      </form>
    </div>
  );
}
