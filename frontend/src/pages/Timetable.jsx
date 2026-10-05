import React, { useEffect, useMemo, useState } from "react";
import { http, formatError } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { subjectClasses } from "@/lib/palette";
import { Plus, Trash2, Clock } from "lucide-react";
import Modal from "@/components/Modal";
import { Link, useSearchParams } from "react-router-dom";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function Timetable() {
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState(null);
  const [items, setItems] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const load = async (openFromLink = false) => {
    try {
      const [tt, s] = await Promise.all([http.get("/timetable"), http.get("/subjects")]);
      setItems(tt.data); setSubjects(s.data);
      if (openFromLink && params.get("edit")) { const block = tt.data.find(b => b.timetable_id === params.get("edit")); if (block) { setEditing(block); setShowNew(true); } }
      else if (openFromLink && params.has("new")) setShowNew(true);
    } catch (e) { setErr(formatError(e)); } finally { setLoading(false); }
  };
  useEffect(() => { load(true); }, []);

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
      <div className="page-header">
        <div>
          <div className="section-title mb-2">Your week</div>
          <h1 className="page-title">Timetable</h1>
          <p className="text-muted-foreground mt-2">A weekly rhythm for classes and study.</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowNew(true); }} data-testid="new-block-btn"><Plus className="w-4 h-4" /> New block</button>
      </div>

      {err && <div className="text-destructive text-sm">{err}</div>}
      <Link to="/planner" className="text-sm action-link">View dated Planner</Link>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {DAYS.map((d) => <div key={d} className="h-64 bg-muted rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {DAYS.map((label, dow) => (
            <div key={label} className="card p-4" data-testid={`day-column-${dow}`}>
              <h2 className="font-semibold text-sm mb-3">{label}</h2>
              <div className="space-y-2">
                {byDay[dow].length === 0 ? (
                  <div className="text-xs text-muted-foreground italic">Nothing scheduled.</div>
                ) : byDay[dow].map((b) => {
                  const sub = b.subject_id ? subMap[b.subject_id] : null;
                  const c = sub ? subjectClasses(sub.color, isDark) : null;
                  return (
                    <div
                      key={b.timetable_id}
                      className="border-l-2 pl-3 py-2 text-sm"
                      style={{ borderLeftColor: c?.dot }}
                      data-testid={`block-${b.timetable_id}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button className="action-link text-left" onClick={() => { setEditing(b); setShowNew(true); }}>{b.title}</button>
                        <button
                          className="btn btn-ghost btn-icon text-muted-foreground"
                          aria-label={`Delete ${b.title}`}
                          onClick={() => remove(b.timetable_id)}
                          data-testid={`block-delete-${b.timetable_id}`}
                          title="Delete"
                        ><Trash2 className="w-3 h-3" /></button>
                      </div>
                      <div className="mt-1 inline-flex items-center gap-1 opacity-80">
                        <Clock className="w-3 h-3" /> {b.start_time} to {b.end_time}
                      </div>
                      {sub && <div className="mt-0.5 opacity-80">{sub.name}</div>}
                      {b.recurrence === "none" && <div className="mt-1">{b.needs_date ? "Choose a date to show in Planner" : `${b.date}${b.end_date && b.end_date !== b.date ? ` → ${b.end_date}` : ""}`}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {showNew && <NewBlockModal subjects={subjects} block={editing} onClose={() => { setShowNew(false); setEditing(null); setParams({}); }} onCreated={load} />}
    </div>
  );
}

function NewBlockModal({ subjects, block, onClose, onCreated }) {
  const [title, setTitle] = useState(block?.title || "");
  const [subjectId, setSubjectId] = useState(block?.subject_id || "");
  const [dow, setDow] = useState(block?.day_of_week || 0);
  const [start, setStart] = useState(block?.start_time || "09:00");
  const [end, setEnd] = useState(block?.end_time || "10:00");
  const [kind, setKind] = useState(block?.kind || "class");
  const [recurrence, setRecurrence] = useState(block?.recurrence || "weekly");
  const [date, setDate] = useState(block?.date || "");
  const [offset, setOffset] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true); setErr("");
    try {
      const unchangedDatedTime = block?.recurrence === "none" && !block.needs_date && recurrence === block.recurrence && date === block.date && start === block.start_time && end === block.end_time && offset === "";
      if (end <= start && !unchangedDatedTime) throw new Error("End time must be after start. Split overnight activities into two blocks.");
      const body = {
        title: title.trim(), subject_id: subjectId || null, day_of_week: Number(dow),
        start_time: start, end_time: end, kind, recurrence, date: recurrence === "none" ? date : null,
        ...(offset !== "" && recurrence === "none" ? { utc_offset_minutes: Number(offset) } : {}),
      };
      if (block) await http.patch(`/timetable/${block.timetable_id}`, body);
      else await http.post("/timetable", body);
      onCreated(); onClose();
    } catch (e) { setErr(formatError(e)); } finally { setBusy(false); }
  };

  return (
    <Modal title={block ? "Edit block" : "New block"} onClose={onClose}>
      <form onSubmit={submit} data-testid="new-block-modal">
        <label className="text-xs">Repeats<select className="input mt-1 mb-3" value={recurrence} onChange={e => setRecurrence(e.target.value)}><option value="weekly">Every week</option><option value="none">Once, on a date</option></select></label>
        {recurrence === "none" && <label className="text-xs">Date<input type="date" required className="input mt-1 mb-3" value={date} onChange={e => setDate(e.target.value)} /></label>}
        {recurrence === "none" && block?.end_date && block.end_date !== block.date && <p className="text-xs text-muted-foreground mb-3">This saved activity ends on {block.end_date} in your timezone. Renaming keeps its time; split it into two blocks if changing the overnight times.</p>}
        <label className="text-xs text-muted-foreground" htmlFor="timetable-field-1">Title</label>
        <input id="timetable-field-1" className="input mt-1 mb-3" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Math class" autoFocus data-testid="new-block-title" />
        <label className="text-xs text-muted-foreground" htmlFor="timetable-field-2">Subject</label>
        <select id="timetable-field-2" className="input mt-1 mb-3" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} data-testid="new-block-subject">
          <option value="">No subject</option>
          {subjects.map((s) => <option key={s.subject_id} value={s.subject_id}>{s.name}</option>)}
        </select>
        <label className="text-xs text-muted-foreground" htmlFor="timetable-field-3">Day</label>
        <select id="timetable-field-3" className="input mt-1 mb-3" value={dow} onChange={(e) => setDow(e.target.value)} data-testid="new-block-day">
          {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
        </select>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground" htmlFor="timetable-field-4">Start</label>
            <input id="timetable-field-4" type="time" className="input mt-1" value={start} onChange={(e) => setStart(e.target.value)} data-testid="new-block-start" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground" htmlFor="timetable-field-5">End</label>
            <input id="timetable-field-5" type="time" className="input mt-1" value={end} onChange={(e) => setEnd(e.target.value)} data-testid="new-block-end" />
          </div>
        </div>
        <div className="mt-3">
          <div className="field-label" id="activity-kind">Kind</div>
          <div className="segmented-control" role="group" aria-labelledby="activity-kind">
            {["class", "study", "exam", "deadline"].map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k} className="segment" data-testid={`new-block-kind-${k}`}>
                {k[0].toUpperCase() + k.slice(1)}
              </button>
            ))}
          </div>
        </div>
        {recurrence === "none" && <details className="mt-3 text-xs"><summary>Daylight-saving time options</summary><label>UTC offset in minutes (only if this time occurs twice)<input className="input mt-1" type="number" min={-840} max={840} value={offset} onChange={e => setOffset(e.target.value)} placeholder="For example, -300" /></label></details>}
        {err && <div className="text-destructive text-sm mt-3">{err}</div>}
        <button className="btn btn-primary w-full mt-4" disabled={busy} data-testid="new-block-submit">
          {busy ? "Saving…" : block ? "Save block" : "Add block"}
        </button>
      </form>
    </Modal>
  );
}
