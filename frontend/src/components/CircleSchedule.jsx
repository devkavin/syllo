import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { http, formatError } from "@/lib/api";
import { browserTimezone, dateInZone, formatStudyTime, localInstant, shiftDate } from "@/lib/studyTime";

export default function CircleSchedule({ circle, user, onRefresh }) {
  const timezone = user?.timezone || browserTimezone();
  const [events, setEvents] = useState(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0), [slots, setSlots] = useState(null);
  const [participants, setParticipants] = useState([user.user_id]);
  const [duration, setDuration] = useState(45), [topic, setTopic] = useState("");
  const [day, setDay] = useState(() => shiftDate(dateInZone(new Date(), timezone), 1)), [clock, setClock] = useState("18:00");
  const [rescheduling, setRescheduling] = useState(null);
  const [selectedStart, setSelectedStart] = useState(null);
  const url = `/circles/${circle.id}/sessions`;
  useEffect(() => {
    let live = true;
    http.get(url).then(r => { if (live) setEvents(r.data); }).catch(e => { if (live) setError(formatError(e)); });
    return () => { live = false; };
  }, [url, version]);
  const act = async fn => {
    if (busy) return; setBusy(true); setError("");
    try { await fn(); setVersion(n => n + 1); }
    catch (e) { setError(formatError(e)); }
    finally { setBusy(false); }
  };
  const propose = () => act(async () => {
    const start = selectedStart || localInstant(day, clock, timezone), end = new Date(Date.parse(start) + Number(duration) * 60000).toISOString();
    if (rescheduling) await http.patch(`${url}/${rescheduling.id}`, { start, end, revision: rescheduling.revision });
    else await http.post(url, { topic: topic.trim(), participants: participants.filter(id => circle.members.some(m => m.id === id)), start, end });
    setRescheduling(null); setTopic(""); setSlots(null); setSelectedStart(null);
  });
  return <section className="space-y-5 border-t border-border pt-6" aria-label="Study together">
    <h3 className="font-serif text-2xl">Find time to study together</h3>
    <p className="text-sm text-muted-foreground">Agree on a time. Each person keeps their own notes and focus timer.</p>
    <label className="flex gap-3 items-start text-sm"><input type="checkbox" checked={!!circle.share_availability} disabled={busy} onChange={e => { const checked = e.target.checked; act(async () => { await http.patch(`/circles/${circle.id}/privacy`, { share_availability: checked }); await onRefresh(); }); }} /><span>Share my availability for common-time suggestions. Off by default.</span></label>
    <p className="text-xs text-muted-foreground">Only matching slots are shared, never calendar details. <Link className="underline" to="/settings">Set my available hours</Link></p>
    <fieldset disabled={busy} className="space-y-3"><legend className="text-sm font-medium mb-2">Who will study?</legend><div className="flex flex-wrap gap-4">{circle.members.map(m => <label key={m.id} className="flex gap-2 text-sm items-center"><input type="checkbox" disabled={m.id === user.user_id} checked={participants.includes(m.id)} onChange={e => { setSlots(null); setSelectedStart(null); setParticipants(ids => e.target.checked ? [...ids, m.id] : ids.filter(id => id !== m.id)); }} />{m.name}{m.id === user.user_id ? " (you)" : ""}</label>)}</div></fieldset>
    <form onSubmit={e => { e.preventDefault(); propose(); }} className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <label className="text-sm">Date<input type="date" className="input mt-1" required value={day} disabled={busy} onChange={e => { setDay(e.target.value); setSlots(null); setSelectedStart(null); }} /></label>
        <label className="text-sm">Minutes<input type="number" min={15} max={240} className="input mt-1 w-24" required value={duration} disabled={busy} onChange={e => { setDuration(e.target.value); setSlots(null); setSelectedStart(null); }} /></label>
        <button type="button" className="btn btn-outline self-end" disabled={busy || !day} onClick={() => act(async () => { const { data } = await http.post(`/circles/${circle.id}/availability`, { participants, duration_minutes: Number(duration), start: localInstant(day, "00:00", timezone), end: localInstant(shiftDate(day, 7), "00:00", timezone) }); setSlots(data); })}>Find common time</button>
      </div>
      {slots && <div role="status" className="space-y-2">{slots.reason && <p className="text-sm text-muted-foreground">{slots.reason}</p>}<div className="flex flex-wrap gap-2">{slots.slots.map(slot => <button type="button" key={slot.start} className="btn btn-outline text-sm" disabled={busy} onClick={() => { setSelectedStart(slot.start); setDay(dateInZone(slot.start, timezone)); setClock(new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(slot.start))); }}>{formatStudyTime(slot.start, timezone, true, true)}</button>)}</div></div>}
      <p className="text-sm text-muted-foreground">Or propose a time yourself. Everyone else confirms before it goes in their Planner.</p>
      {!rescheduling && <label className="block text-sm">Study topic<input className="input mt-1 max-w-md" required maxLength={160} value={topic} disabled={busy} onChange={e => setTopic(e.target.value)} placeholder="For example: practise limits" /></label>}
      <label className="block text-sm">Start time ({timezone})<input type="time" className="input mt-1 max-w-44" required value={clock} disabled={busy} onChange={e => { setClock(e.target.value); setSelectedStart(null); }} /></label>
      {selectedStart && <p className="text-xs text-muted-foreground">Selected: {formatStudyTime(selectedStart, timezone, true, true)}</p>}
      <div className="flex flex-wrap gap-2"><button className="btn btn-primary" disabled={busy}>{rescheduling ? "Reschedule and ask everyone to confirm" : "Propose session"}</button>{rescheduling && <button type="button" className="btn btn-outline" onClick={() => setRescheduling(null)}>Keep current time</button>}</div>
    </form>
    {error && <div role="alert" className="text-sm text-destructive">{error} <button className="btn btn-outline ml-2" onClick={() => { setError(""); setVersion(n => n + 1); }}>Refresh sessions</button></div>}
    <section><h4 className="font-medium mb-3">Upcoming sessions</h4>{events === null ? <p role="status">Loading sessions…</p> : !events.length ? <p className="text-sm text-muted-foreground">No sessions planned yet.</p> : <ul className="divide-y divide-border">{events.map(event => <li key={event.id} className="space-y-2 py-4">
      <p className="font-medium">{event.topic}</p><p className="text-sm text-muted-foreground">{formatStudyTime(event.start, timezone, true)} · {Math.round((Date.parse(event.end) - Date.parse(event.start)) / 60000)} minutes</p>
      <p className="text-sm">{event.my_status === "invited" ? "Invitation · confirm this time" : event.my_status === "accepted" ? "Confirmed in your Planner" : event.my_status === "declined" ? "Declined" : "Not invited"}</p>
      <div className="flex flex-wrap gap-2">
        {event.my_status && event.my_status !== "accepted" && <button className="btn btn-primary" disabled={busy} onClick={() => act(() => http.post(`${url}/${event.id}/respond`, { status: "accepted", revision: event.revision }))}>Accept</button>}
        {event.my_status && event.my_status !== "declined" && <button className="btn btn-outline" disabled={busy} onClick={() => act(() => http.post(`${url}/${event.id}/respond`, { status: "declined", revision: event.revision }))}>Decline</button>}
        {event.my_status === "accepted" && <Link className="btn btn-outline" to={`/timer?event=${event.id}`}>Start studying</Link>}
        {event.organizer_id === user.user_id && <><button className="btn btn-outline" disabled={busy} onClick={() => { setRescheduling(event); setSelectedStart(event.start); setDay(dateInZone(event.start, timezone)); setClock(new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(event.start))); setDuration(Math.round((Date.parse(event.end) - Date.parse(event.start)) / 60000)); }}>Change time</button><button className="btn btn-ghost" disabled={busy} onClick={() => { if (window.confirm("Cancel this Circle session? Recorded study stays private and is kept.")) act(() => http.delete(`${url}/${event.id}`)); }}>Cancel session</button></>}
      </div>
    </li>)}</ul>}</section>
  </section>;
}
