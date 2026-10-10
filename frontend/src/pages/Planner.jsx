import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { http, formatError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import AgendaList from "@/components/AgendaList";
import { ChevronLeft, ChevronRight, Plus, Settings2 } from "lucide-react";
import { browserTimezone, dateInZone, localInstant, shiftDate } from "@/lib/studyTime";
import RevisionPlans from "./RevisionPlans";
export default function Planner() {
  const { user } = useAuth(); const timezone = user?.timezone || browserTimezone();
  const [day, setDay] = useState(() => dateInZone(new Date(), timezone));
  const [view, setView] = useState("Day"); const [data, setData] = useState(null); const [error, setError] = useState(""); const [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true; setData(null); setError("");
    try {
      const start = localInstant(day, "00:00", timezone), end = localInstant(shiftDate(day, view === "Week" ? 7 : 1), "00:00", timezone);
      http.get("/agenda", { params: { start, end } }).then(r => { if (live) setData(r.data); }).catch(e => { if (live) setError(formatError(e)); });
    } catch (e) { setError(e.message); }
    return () => { live = false; };
  }, [day, view, timezone, retry]);
  return <div className="max-w-4xl space-y-6" data-testid="planner-page">
    <header className="page-header"><div><h1 className="page-title">Planner</h1><p className="mt-2 text-muted-foreground">Classes, study and due work, together.</p></div><Link className="btn btn-primary" to="/timetable?new=1"><Plus className="h-4 w-4" />Add activity</Link></header>
    <div className="page-toolbar border-b border-border pb-5">
      <div className="segmented-control" role="group" aria-label="Planner view">
        {["Day", "Week"].map(v => <button key={v} aria-pressed={v === view} className="segment" onClick={() => setView(v)}>{v}</button>)}
      </div>
      <div className="basis-full min-w-0 sm:basis-auto">
        <label htmlFor="planner-date" className="field-label">Starting date</label>
        <div className="flex gap-1 items-center">
          <button className="btn btn-ghost btn-icon" aria-label={`Previous ${view.toLowerCase()}`} onClick={() => setDay(d => shiftDate(d, view === "Week" ? -7 : -1))}><ChevronLeft className="h-4 w-4" /></button>
          <input id="planner-date" type="date" className="input w-full sm:w-44" value={day} onChange={e => e.target.value && setDay(e.target.value)} />
          <button className="btn btn-ghost btn-icon" aria-label={`Next ${view.toLowerCase()}`} onClick={() => setDay(d => shiftDate(d, view === "Week" ? 7 : 1))}><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
      <Link className="btn btn-outline sm:ml-auto" to="/timetable">Weekly timetable</Link>
    </div>
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground"><span>Times in {timezone}</span><Link to="/settings" className="action-link"><Settings2 className="h-4 w-4" />Change timezone</Link></div>
    {error && <div role="alert" className="notice">{error} <button className="btn btn-outline" onClick={() => setRetry(n => n + 1)}>Retry</button></div>}
    {!data && !error && <p role="status">Loading your agenda…</p>}
    {data && <>{data.items.length ? <AgendaList items={data.items} timezone={timezone} withDate={view === "Week"} /> : <section className="empty-state space-y-3"><h2>A little room in your {view.toLowerCase()}</h2><p>No activities planned. Add a class or make time to study.</p><Link className="btn btn-outline" to="/timetable?new=1">Plan an activity</Link></section>}{data.warnings?.map(w => <p key={w.id} role="status" className="notice">{w.message} <Link className="action-link" to={w.href || "/timetable"}>Check timetable</Link></p>)}</>}
    <RevisionPlans timezone={timezone} onChange={() => setRetry(value => value + 1)} />
  </div>;
}
