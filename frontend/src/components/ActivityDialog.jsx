import React, { useEffect, useState } from "react";
import { http, formatError } from "@/lib/api";
import Modal from "@/components/Modal";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function ActivityDialog({ subjects: provided, block, defaults = {}, fallbackFocusRef, onClose, onCreated }) {
  const [subjects, setSubjects] = useState(provided || []);
  const [subjectsError, setSubjectsError] = useState("");
  const [subjectsLoading, setSubjectsLoading] = useState(!provided);
  const [subjectVersion, setSubjectVersion] = useState(0);
  useEffect(() => {
    if (provided) { setSubjects(provided); setSubjectsLoading(false); return; }
    let live = true;
    setSubjectsError(""); setSubjectsLoading(true);
    http.get("/subjects").then(r => { if (live) setSubjects(r.data); }).catch(() => { if (live) setSubjectsError("Couldn't load your subjects. You can still save without a subject."); }).finally(() => { if (live) setSubjectsLoading(false); });
    return () => { live = false; };
  }, [provided, subjectVersion]);
  const [title, setTitle] = useState(block?.title || "");
  const [subjectId, setSubjectId] = useState(block?.subject_id || "");
  const [dow, setDow] = useState(block?.day_of_week || 0);
  const [start, setStart] = useState(block?.start_time ?? defaults.start_time ?? "09:00");
  const [end, setEnd] = useState(block?.end_time ?? defaults.end_time ?? "10:00");
  const [kind, setKind] = useState(block?.kind || defaults.kind || "class");
  const [recurrence, setRecurrence] = useState(block?.recurrence || defaults.recurrence || "weekly");
  const [date, setDate] = useState(block?.date || defaults.date || "");
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
    <Modal title={block ? "Edit block" : defaults.kind === "study" ? "Plan study time" : "New block"} fallbackFocusRef={fallbackFocusRef} onClose={onClose}>
      <form onSubmit={submit} data-testid="new-block-modal">
        <label className="text-xs">Repeats<select className="input mt-1 mb-3" value={recurrence} onChange={e => setRecurrence(e.target.value)}><option value="weekly">Every week</option><option value="none">Once, on a date</option></select></label>
        {recurrence === "none" && <label className="text-xs">Date<input type="date" required className="input mt-1 mb-3" value={date} onChange={e => setDate(e.target.value)} /></label>}
        {recurrence === "none" && block?.end_date && block.end_date !== block.date && <p className="text-xs text-muted-foreground mb-3">This saved activity ends on {block.end_date} in your timezone. Renaming keeps its time; split it into two blocks if changing the overnight times.</p>}
        <label className="text-xs text-muted-foreground" htmlFor="timetable-field-1">Title</label>
        <input id="timetable-field-1" className="input mt-1 mb-3" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder={kind === "study" ? "What will you study?" : "Math class"} autoFocus data-testid="new-block-title" />
        <label className="text-xs text-muted-foreground" htmlFor="timetable-field-2">Subject</label>
        {subjectsLoading && <p role="status" className="text-sm text-muted-foreground">Loading subjects…</p>}
        {subjectsError && <div role="alert" className="text-sm mb-2">{subjectsError}<button type="button" className="action-link ml-2" onClick={() => setSubjectVersion(n => n + 1)}>Retry subjects</button></div>}
        <select id="timetable-field-2" className="input mt-1 mb-3" disabled={subjectsLoading} value={subjectId} onChange={(e) => setSubjectId(e.target.value)} data-testid="new-block-subject">
          <option value="">No subject</option>
          {subjects.map((s) => <option key={s.subject_id} value={s.subject_id}>{s.name}</option>)}
        </select>
        {recurrence === "weekly" && <><label className="text-xs text-muted-foreground" htmlFor="timetable-field-3">Day</label>
        <select id="timetable-field-3" className="input mt-1 mb-3" value={dow} onChange={(e) => setDow(e.target.value)} data-testid="new-block-day">
          {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
        </select></>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground" htmlFor="timetable-field-4">Start</label>
            <input id="timetable-field-4" type="time" required className="input mt-1" value={start} onChange={(e) => setStart(e.target.value)} data-testid="new-block-start" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground" htmlFor="timetable-field-5">End</label>
            <input id="timetable-field-5" type="time" required className="input mt-1" value={end} onChange={(e) => setEnd(e.target.value)} data-testid="new-block-end" />
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
        {err && <div role="alert" className="text-destructive text-sm mt-3">{err}</div>}
        <button className="btn btn-primary w-full mt-4" disabled={busy} data-testid="new-block-submit">
          {busy ? "Saving…" : block ? "Save block" : defaults.kind === "study" ? "Add study time" : "Add block"}
        </button>
      </form>
    </Modal>
  );
}
