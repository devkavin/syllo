import React, { useEffect, useState } from "react";
import { http, formatError } from "@/lib/api";
import { dateInZone, localInstant } from "@/lib/studyTime";
const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export default function AvailabilitySettings({ timezone }) {
  const [data, setData] = useState(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [saved, setSaved] = useState(false), [retry, setRetry] = useState(0);
  const [start, setStart] = useState(""), [end, setEnd] = useState("");
  useEffect(() => { let live = true; http.get("/availability").then(r => { if (live) setData(r.data); }).catch(e => { if (live) setError(formatError(e)); }); return () => { live = false; }; }, [retry]);
  const update = patch => { setData(d => ({ ...d, ...patch })); setSaved(false); };
  const addExclusion = () => {
    try { const a = localInstant(start.slice(0, 10), start.slice(11), timezone), b = localInstant(end.slice(0, 10), end.slice(11), timezone); if (b <= a) throw new Error("End must follow start"); update({ exclusions: [...data.exclusions, { start: a, end: b }] }); setStart(""); setEnd(""); setError(""); }
    catch (e) { setError(e.message); }
  };
  return <section className="card p-5 space-y-4" aria-label="Study availability">
    <h2 className="font-serif text-xl">When could you study?</h2><p className="text-sm text-muted-foreground">Optional hours for Circle suggestions. Classes, accepted sessions and time off are excluded. Sharing is off until you enable it in each Circle.</p>
    {!data ? <button className="btn btn-outline" onClick={() => setRetry(n => n + 1)}>Load availability</button> : <>
      <p className="text-xs text-muted-foreground">Hours use your saved timezone: {timezone}. Save timezone changes before editing availability.</p>
      <div className="space-y-3">{data.windows.map((window, i) => <div key={i} className="flex flex-wrap gap-2 items-center">
        <label className="text-xs">Day<select className="input mt-1" value={window.day_of_week} disabled={busy} onChange={e => update({ windows: data.windows.map((w, n) => n === i ? { ...w, day_of_week: Number(e.target.value) } : w) })}>{days.map((day, n) => <option key={day} value={n}>{day}</option>)}</select></label>
        {["start_time", "end_time"].map(field => <label key={field} className="text-xs">{field === "start_time" ? "From" : "Until"}<input type="time" className="input mt-1" value={window[field]} disabled={busy} onChange={e => update({ windows: data.windows.map((w, n) => n === i ? { ...w, [field]: e.target.value } : w) })} /></label>)}
        <button className="btn btn-ghost self-end" disabled={busy} onClick={() => update({ windows: data.windows.filter((_, n) => n !== i) })}>Remove hours</button>
      </div>)}</div>
      <button className="btn btn-outline" disabled={busy || data.windows.length >= 28} onClick={() => update({ windows: [...data.windows, { day_of_week: 0, start_time: "18:00", end_time: "20:00" }] })}>Add available hours</button>
      <details><summary className="cursor-pointer text-sm">Time off · {data.exclusions.length}</summary><p className="text-xs mt-3 text-muted-foreground">Block a specific period without sharing why.</p><ul className="text-sm">{data.exclusions.map((e, i) => <li key={i} className="py-2 flex gap-3 flex-wrap">{dateInZone(e.start, timezone)} → {dateInZone(e.end, timezone)}<button disabled={busy} className="underline" onClick={() => update({ exclusions: data.exclusions.filter((_, n) => n !== i) })}>Remove time off</button></li>)}</ul>
        <div className="flex flex-wrap gap-2"><label className="text-xs">From<input type="datetime-local" className="input mt-1" value={start} onChange={e => setStart(e.target.value)} /></label><label className="text-xs">Until<input type="datetime-local" className="input mt-1" value={end} onChange={e => setEnd(e.target.value)} /></label><button className="btn btn-outline self-end" disabled={busy || !start || !end || data.exclusions.length >= 100} onClick={addExclusion}>Add time off</button></div>
      </details>
      <button className="btn btn-primary" disabled={busy} onClick={async () => { setBusy(true); setError(""); setSaved(false); try { await http.put("/availability", data); setSaved(true); } catch (e) { setError(formatError(e)); } finally { setBusy(false); } }}>{busy ? "Saving…" : "Save available hours"}</button>{saved && <p role="status" className="text-sm">Available hours saved. Sharing is controlled separately in each Circle.</p>}
    </>}{error && <p role="alert" className="text-destructive text-sm">{error}</p>}
  </section>;
}
