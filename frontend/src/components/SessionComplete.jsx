import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { http } from "@/lib/api";
import ReviewScheduler from "./ReviewScheduler";
import { useResourceAutosave } from "@/hooks/useResourceAutosave";

export default function SessionComplete({ session, lessonTitle, onFinish, timezone }) {
  const navigate = useNavigate();
  const mounted = useRef(true);
  const mutation = useRef(false);
  const [circleId, setCircleId] = useState(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!session.circle_event_id) return;
    let live = true;
    http.get(`/circle-sessions/${encodeURIComponent(session.circle_event_id)}`).then(({ data }) => { if (live) setCircleId(data.circle_id); }).catch(() => { /* The personal completion stays available if a circle was removed. */ });
    return () => { live = false; };
  }, [session.circle_event_id]);
  const note = useResourceAutosave({ resourceKey: `session.${session.session_id}`, initialValue: { note: session.note || "" }, save: async patch => (await http.patch(`/sessions/${session.session_id}`, patch)).data });
  const [busy, setBusy] = useState(false);
  const [reviewSaved, setReviewSaved] = useState("");
  const save = async (finish = false, href = null) => { if (mutation.current) return; mutation.current = true; setBusy(true); try { if (await note.flush() && mounted.current) { if (finish) onFinish(); if (href) navigate(href); } } finally { mutation.current = false; if (mounted.current) setBusy(false); } };
  const next = circleId ? { label: "Update my goal", href: `/circles?circle=${encodeURIComponent(circleId)}&tab=goals` } : session.lesson_id ? { label: "Review what I learned", href: `/reviews?lesson=${encodeURIComponent(session.lesson_id)}` } : null;
  return <section className="max-w-2xl mx-auto mb-8 rounded-xl border border-primary/25 bg-accent/40 p-5 space-y-4" aria-label="Session complete">
    <h2 className="font-serif text-2xl">Session complete</h2>
    <p>{Math.round(session.duration_seconds / 60 * 10) / 10} minutes focused{lessonTitle ? ` · ${lessonTitle}` : ""}</p>
    <details><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">Add a private note</summary><form className="space-y-2 pt-2" onSubmit={e => { e.preventDefault(); void save(); }}><label className="block text-sm">Private session note<textarea className="input mt-1" maxLength={10000} placeholder="What clicked today? (optional)" value={note.draft.note} disabled={busy} onChange={e => note.update({ note: e.target.value })} /></label><button className="btn btn-outline min-h-11" disabled={busy || !session.session_id}>Save note</button></form></details>
    {session.lesson_id && !reviewSaved && <details><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">Schedule a review</summary><ReviewScheduler timezone={timezone} lessonId={session.lesson_id} onSaved={() => setReviewSaved("Review scheduled.")} onSkip={() => setReviewSaved("Your existing review schedule is unchanged.")} /></details>}
    {reviewSaved && <p role="status" className="text-sm">{reviewSaved}</p>}
    {note.error && <p role="alert" className="text-destructive">{note.error} Use Save note to retry.</p>}
    {note.saveState === "saved" && <p role="status" className="text-sm">Note saved.</p>}
    {circleId && <details><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">More study options</summary><button className="btn btn-ghost min-h-11" disabled={busy} onClick={() => save(true, `/circles?circle=${encodeURIComponent(circleId)}&repeat=${encodeURIComponent(session.circle_event_id)}`)}>Plan the next session</button>{session.lesson_id && <button className="btn btn-ghost min-h-11" disabled={busy} onClick={() => save(true, `/reviews?lesson=${encodeURIComponent(session.lesson_id)}`)}>Review what I learned</button>}</details>}
    <div className="flex flex-wrap gap-2">{next && <button className="btn btn-primary min-h-11" disabled={busy} onClick={() => save(true, next.href)}>{next.label}</button>}<button className={`btn min-h-11 ${next ? "btn-ghost" : "btn-primary"}`} disabled={busy} onClick={() => save(true)}>Finish</button></div>
  </section>;
}
