import React, { useState } from "react";
import { http, formatError } from "@/lib/api";
import { browserTimezone, localInstant } from "@/lib/studyTime";

export default function ReviewScheduler({ lessonId, onSaved, onSkip, timezone = browserTimezone() }) {
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const schedule = async date => {
    if (!date || !Number.isFinite(date.getTime()) || date <= new Date()) { setError("Choose a future review time."); return; }
    setBusy(true); setError("");
    try { const { data } = await http.put(`/lessons/${lessonId}/review`, { next_review_at: date.toISOString() }); onSaved?.(data); }
    catch (e) { setError(formatError(e)); }
    finally { setBusy(false); }
  };
  return <section className="space-y-3 border-t border-border pt-4" aria-label="Schedule review">
    <h3 className="font-medium">When would you like to revisit this?</h3>
    <div className="flex flex-wrap gap-2">{[["30 minutes", 30], ["Tomorrow", 1440], ["3 days", 4320], ["1 week", 10080]].map(([label, minutes]) => <button key={label} className="btn btn-outline min-h-11" disabled={busy} onClick={() => schedule(new Date(Date.now() + minutes * 60000))}>{label}</button>)}</div>
    <p className="text-xs text-muted-foreground">Custom times use {timezone}.</p>
    <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); try { void schedule(new Date(localInstant(custom.slice(0, 10), custom.slice(11), timezone))); } catch (err) { setError(err.message); } }}><label className="text-sm">Custom time <input type="datetime-local" className="input mt-1" value={custom} onChange={e => setCustom(e.target.value)} required /></label><button className="btn btn-outline self-end" disabled={busy}>Schedule</button></form>
    {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
    {onSkip && <button className="btn btn-ghost" onClick={onSkip} disabled={busy}>Not now</button>}
  </section>;
}
