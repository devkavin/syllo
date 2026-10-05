import React, { useEffect, useMemo, useState } from "react";
import { http, formatError } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { subjectClasses } from "@/lib/palette";
import { Plus, Trash2, Clock } from "lucide-react";
import ActivityDialog from "@/components/ActivityDialog";
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

      {showNew && <ActivityDialog subjects={subjects} block={editing} onClose={() => { setShowNew(false); setEditing(null); setParams({}); }} onCreated={load} />}
    </div>
  );
}
