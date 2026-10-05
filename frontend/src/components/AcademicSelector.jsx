import React, { useEffect, useState } from "react";
import { http, formatError } from "@/lib/api";

export default function AcademicSelector({ subjects: provided, value, onChange, disabled = false, hideSubject = false }) {
  const [subjects, setSubjects] = useState(provided || []);
  const [units, setUnits] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (provided) { setSubjects(provided); return; }
    let live = true;
    http.get("/subjects").then(r => { if (live) setSubjects(r.data); }).catch(e => { if (live) setError(formatError(e)); });
    return () => { live = false; };
  }, [provided]);
  useEffect(() => {
    let live = true;
    setUnits([]); setError("");
    if (value.subject_id) http.get(`/subjects/${value.subject_id}/units`).then(r => { if (live) setUnits(r.data); }).catch(e => { if (live) setError(formatError(e)); });
    return () => { live = false; };
  }, [value.subject_id]);
  useEffect(() => {
    let live = true;
    setLessons([]);
    if (value.unit_id) http.get(`/units/${value.unit_id}/lessons`).then(r => { if (live) setLessons(r.data); }).catch(e => { if (live) setError(formatError(e)); });
    return () => { live = false; };
  }, [value.unit_id]);
  return <div className="space-y-3 text-left">
    {!hideSubject && <label className="block text-sm">Subject<select aria-label="Subject" className="input mt-1" disabled={disabled} value={value.subject_id || ""} onChange={e => onChange({ subject_id: e.target.value || null, unit_id: null, lesson_id: null })}><option value="">No subject</option>{subjects.map(s => <option key={s.subject_id} value={s.subject_id}>{s.name}</option>)}</select></label>}
    {value.subject_id && <label className="block text-sm">Unit<select aria-label="Unit" className="input mt-1" disabled={disabled} value={value.unit_id || ""} onChange={e => onChange({ ...value, unit_id: e.target.value || null, lesson_id: null })}><option value="">No unit</option>{units.map(u => <option key={u.unit_id} value={u.unit_id}>{u.name}</option>)}</select></label>}
    {value.unit_id && <label className="block text-sm">Lesson<select aria-label="Lesson" className="input mt-1" disabled={disabled} value={value.lesson_id || ""} onChange={e => onChange({ ...value, lesson_id: e.target.value || null })}><option value="">No lesson</option>{lessons.map(l => <option key={l.lesson_id} value={l.lesson_id}>{l.title}</option>)}</select></label>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
