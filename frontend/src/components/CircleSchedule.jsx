import React, { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CalendarDays, Plus, Clock } from "lucide-react";
import { http, formatError } from "@/lib/api";
import { browserTimezone, dateInZone, formatStudyTime, localInstant, shiftDate } from "@/lib/studyTime";
import Modal from "./Modal";
import { CircleActions } from "./CircleControls";

export default function CircleSchedule({ circle, user }) {
  const timezone = user?.timezone || browserTimezone();
  const [events, setEvents] = useState(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0), [slots, setSlots] = useState(null);
  const [participants, setParticipants] = useState([user.user_id]);
  const [duration, setDuration] = useState(45), [topic, setTopic] = useState("");
  const [day, setDay] = useState(() => shiftDate(dateInZone(new Date(), timezone), 1)), [clock, setClock] = useState("18:00");
  const [rescheduling, setRescheduling] = useState(null);
  const [selectedStart, setSelectedStart] = useState(null);
  const [open, setOpen] = useState(false);
  const lock = useRef(false);
  const planButton = useRef(null);
  const [params, setParams] = useSearchParams();
  const repeatId = params.get("repeat");
  const url = `/circles/${circle.id}/sessions`;
  const primaryEvent = events?.find(event => event.my_status === "invited") || events?.find(event => event.my_status === "accepted");
  const repeat = event => {
    setRescheduling(null); setSelectedStart(null); setSlots(null); setError("");
    setTopic(event.topic);
    setParticipants([...new Set([user.user_id, ...(event.participants || []).map(part => part.user_id).filter(id => circle.members.some(member => member.id === id))])]);
    setDuration(Math.round((Date.parse(event.end) - Date.parse(event.start)) / 60000));
    setDay(shiftDate(dateInZone(new Date(), timezone), 1));
    setClock(new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(event.start)));
    setOpen(true);
  };
  useEffect(() => {
    if (!repeatId) return;
    let live = true;
    http.get(`/circle-sessions/${encodeURIComponent(repeatId)}`).then(({ data }) => {
      if (!live) return;
      if (data.circle_id !== circle.id) throw new Error("This session belongs to another circle.");
      repeat(data);
    }).catch(error => { if (live) setError(formatError(error)); }).finally(() => {
      if (live) setParams(previous => { const next = new URLSearchParams(previous); next.delete("repeat"); return next; }, { replace: true });
    });
    return () => { live = false; };
  }, [repeatId, circle.id]);
  useEffect(() => {
    let live = true;
    http.get(url).then(result => { if (live) setEvents(result.data); }).catch(error => { if (live) setError(formatError(error)); });
    return () => { live = false; };
  }, [url, version]);
  const act = async (fn, refresh = true) => {
    if (lock.current) return; lock.current = true; setBusy(true); setError("");
    try { await fn(); if (refresh) setVersion(n => n + 1); }
    catch (error) { setError(formatError(error)); }
    finally { lock.current = false; setBusy(false); }
  };
  const propose = () => act(async () => {
    const start = selectedStart || localInstant(day, clock, timezone), end = new Date(Date.parse(start) + Number(duration) * 60000).toISOString();
    if (rescheduling) await http.patch(`${url}/${rescheduling.id}`, { start, end, revision: rescheduling.revision });
    else await http.post(url, { topic: topic.trim(), participants: participants.filter(id => circle.members.some(member => member.id === id)), start, end });
    setOpen(false); setRescheduling(null); setTopic(""); setSlots(null); setSelectedStart(null);
  });
  const changeTime = event => {
    setError(""); setSlots(null); setRescheduling(event); setSelectedStart(event.start); setDay(dateInZone(event.start, timezone));
    setClock(new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(event.start)));
    setDuration(Math.round((Date.parse(event.end) - Date.parse(event.start)) / 60000)); setOpen(true);
  };
  const errorView = error && <div role="alert" className="text-sm text-destructive">{error} <button type="button" className="btn btn-outline min-h-11 mt-2" disabled={busy} onClick={() => act(async () => { const { data } = await http.get(url); setEvents(data); setRescheduling(null); setOpen(false); }, false)}>Refresh sessions</button></div>;
  return <section className="space-y-5" aria-label="Study together">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Your next study session</h2><p className="mt-1 text-sm text-muted-foreground">Agree on a time. Each person keeps their own notes and focus timer.</p></div><button ref={planButton} className={`btn min-h-11 ${events?.length === 0 && circle.members.length > 1 ? "btn-primary" : "btn-outline"}`} disabled={busy || !!repeatId} onClick={() => { setRescheduling(null); setSelectedStart(null); setSlots(null); setError(""); setOpen(true); }}><Plus aria-hidden="true" size={16} />Plan session</button></header>
    {!open && errorView}
    {events === null ? <p role="status">Loading sessions…</p> : !events.length ? <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center"><CalendarDays aria-hidden="true" size={30} className="mx-auto mb-3 text-primary" /><h3 className="font-medium">No sessions planned yet.</h3><p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">Pick a topic and a time. Your friends can accept the invitation to add it to their Planner.</p></div> : <ul className="space-y-3">{events.map(event => <li key={event.id} className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words font-semibold">{event.topic}</p><p className="mt-2 flex items-start gap-2 text-sm text-muted-foreground"><Clock aria-hidden="true" size={16} className="mt-0.5 shrink-0" /><span>{formatStudyTime(event.start, timezone, true)} · {Math.round((Date.parse(event.end) - Date.parse(event.start)) / 60000)} minutes</span></p></div>
      <CircleActions label={`Options for session ${event.topic}`} disabled={busy || !!repeatId} items={[{ label: "Plan again", action: () => repeat(event) }, ...(event.my_status === "accepted" && event.organizer_id !== user.user_id ? [{ label: "Decline session", action: () => act(() => http.post(`${url}/${event.id}/respond`, { status: "declined", revision: event.revision })) }] : []), ...(event.organizer_id === user.user_id ? [{ label: "Change time", action: () => changeTime(event) }, { label: "Cancel session", destructive: true, action: () => { if (window.confirm("Cancel this Circle session? Recorded study stays private and is kept.")) act(() => http.delete(`${url}/${event.id}`)); } }] : [])]} /></div>
      <p className={`mt-3 text-sm ${event.my_status === "invited" ? "font-medium text-primary" : "text-muted-foreground"}`}>{event.my_status === "invited" ? "Invitation · confirm this time" : event.my_status === "accepted" ? "Confirmed in your Planner" : event.my_status === "declined" ? "Declined" : "Not invited"}</p>
      {!!event.participants?.length && <details className="mt-2 text-sm"><summary className="min-h-11 cursor-pointer py-3 text-muted-foreground">{event.participants.filter(part => part.status === "accepted").length} accepted · {event.participants.filter(part => part.status === "invited").length} awaiting reply{event.participants.some(part => part.status === "declined") ? ` · ${event.participants.filter(part => part.status === "declined").length} declined` : ""}</summary><ul className="space-y-2 pb-3">{event.participants.map(part => <li key={part.user_id} className="flex justify-between gap-3"><span className="break-words">{circle.members.find(member => member.id === part.user_id)?.name || "Member"}</span><span className="shrink-0 text-muted-foreground">{part.status === "invited" ? "Awaiting reply" : part.status === "accepted" ? "Accepted" : "Declined"}</span></li>)}</ul></details>}
      <div className="mt-3 flex flex-wrap gap-2">{event.my_status && event.my_status !== "accepted" && <button className={`btn min-h-11 ${event.id === primaryEvent?.id && circle.members.length > 1 ? "btn-primary" : "btn-outline"}`} disabled={busy} onClick={() => act(() => http.post(`${url}/${event.id}/respond`, { status: "accepted", revision: event.revision }))}>Accept</button>}{event.my_status === "invited" && <button className="btn btn-ghost min-h-11" disabled={busy} onClick={() => act(() => http.post(`${url}/${event.id}/respond`, { status: "declined", revision: event.revision }))}>Decline</button>}{event.my_status === "accepted" && <Link className={`btn min-h-11 ${event.id === primaryEvent?.id && circle.members.length > 1 ? "btn-primary" : "btn-outline"}`} to={`/timer?event=${event.id}`}>Start studying</Link>}</div>
    </li>)}</ul>}
    {open && <Modal fallbackFocusRef={planButton} title={rescheduling ? `Change time: ${rescheduling.topic}` : "Plan a study session"} description="Others confirm before the session appears in their Planner." className="max-h-[90dvh] overflow-y-auto" onClose={() => { if (!busy) { setOpen(false); setError(""); } }}>
      <form onSubmit={event => { event.preventDefault(); propose(); }} className="space-y-4">
        {!rescheduling && <label className="block text-sm font-medium">Study topic<input className="input mt-2" required maxLength={160} value={topic} disabled={busy} onChange={event => setTopic(event.target.value)} placeholder="e.g. Practise limits together" /></label>}
        {!rescheduling && <fieldset disabled={busy}><legend className="mb-2 text-sm font-medium">Who will study?</legend><div className="flex flex-wrap gap-x-4 gap-y-1">{circle.members.map(member => <label key={member.id} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" disabled={member.id === user.user_id} checked={participants.includes(member.id)} onChange={event => { setSlots(null); setSelectedStart(null); setParticipants(ids => event.target.checked ? [...ids, member.id] : ids.filter(id => id !== member.id)); }} />{member.name}{member.id === user.user_id ? " (you)" : ""}</label>)}</div></fieldset>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><label className="min-w-0 text-sm">Date<input type="date" className="input mt-2 w-full min-w-0" required value={day} disabled={busy} onChange={event => { setDay(event.target.value); setSlots(null); setSelectedStart(null); }} /></label><label className="min-w-0 text-sm">Start time<input type="time" className="input mt-2 w-full min-w-0" required value={clock} disabled={busy} onChange={event => { setClock(event.target.value); setSelectedStart(null); }} /></label><label className="text-sm">Minutes<input type="number" min={15} max={240} className="input mt-2" required value={duration} disabled={busy} onChange={event => { setDuration(event.target.value); setSlots(null); setSelectedStart(null); }} /></label></div>
        <p className="text-xs text-muted-foreground">Times shown in {timezone}.</p>
        {!rescheduling && <details className="rounded-lg border border-border"><summary className="min-h-11 cursor-pointer px-3 py-3 text-sm font-medium">Find a time everyone can make</summary><div className="space-y-3 border-t border-border p-3"><p className="text-sm text-muted-foreground">Suggestions use only availability each selected member has chosen to share. Enable yours in Circle settings, and <Link className="action-link" to="/settings">set available hours</Link>. You can always propose a time yourself.</p><button type="button" className="btn btn-outline min-h-11" disabled={busy || !day || Number(duration) < 15 || Number(duration) > 240} onClick={() => act(async () => { const { data } = await http.post(`/circles/${circle.id}/availability`, { participants, duration_minutes: Number(duration), start: localInstant(day, "00:00", timezone), end: localInstant(shiftDate(day, 7), "00:00", timezone) }); setSlots(data); }, false)}>Find common time</button>
          {slots && <div role="status" className="space-y-2">{slots.reason && <p className="text-sm text-muted-foreground">{slots.reason}</p>}{slots.available && !slots.slots.length && <p className="text-sm text-muted-foreground">No shared times found this week. Try another date or propose a time.</p>}<div className="flex flex-wrap gap-2">{slots.slots.map(slot => <button type="button" key={slot.start} aria-pressed={selectedStart === slot.start} className="btn btn-outline min-h-11 text-sm" disabled={busy} onClick={() => { setSelectedStart(slot.start); setDay(dateInZone(slot.start, timezone)); setClock(new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(slot.start))); }}>{formatStudyTime(slot.start, timezone, true, true)}</button>)}</div></div>}
        </div></details>}
        {selectedStart && <p className="text-xs text-muted-foreground">Selected: {formatStudyTime(selectedStart, timezone, true, true)}</p>}
        {errorView}
        <button className="btn btn-primary min-h-11 w-full" disabled={busy}>{busy ? "Saving…" : rescheduling ? "Reschedule and ask everyone to confirm" : "Propose session"}</button>
      </form>
    </Modal>}
  </section>;
}
