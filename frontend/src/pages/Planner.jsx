import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { http, formatError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import AgendaList from "@/components/AgendaList";
import { browserTimezone, dateInZone, localInstant, shiftDate } from "@/lib/studyTime";
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
  return <div className="max-w-3xl space-y-8">
    <header><h1 className="font-serif text-4xl">Planner</h1><p className="mt-2 text-muted-foreground">Classes, study and due work, together.</p></header>
    <div className="flex flex-wrap gap-3 items-center">
      {["Day", "Week"].map(v => <button key={v} aria-pressed={v === view} className={`btn ${view === v ? "btn-primary" : "btn-outline"}`} onClick={() => setView(v)}>{v}</button>)}
      <label className="text-sm">Starting date <input type="date" className="input mt-1" value={day} onChange={e => e.target.value && setDay(e.target.value)} /></label>
      <Link className="btn btn-outline" to="/timetable?new=1">Add activity</Link><Link className="text-sm underline" to="/timetable">Weekly timetable</Link>
    </div>
    <p className="text-xs text-muted-foreground">Times in {timezone}. <Link to="/settings" className="underline">Change timezone</Link></p>
    {error && <div role="alert">{error} <button className="btn btn-outline" onClick={() => setRetry(n => n + 1)}>Retry</button></div>}
    {!data && !error && <p role="status">Loading your agenda…</p>}
    {data && <><AgendaList items={data.items} timezone={timezone} withDate={view === "Week"} />{data.warnings?.map(w => <p key={w.id} role="status" className="text-sm text-muted-foreground">{w.message} <Link className="underline" to={w.href || "/timetable"}>Check timetable</Link></p>)}</>}
  </div>;
}
