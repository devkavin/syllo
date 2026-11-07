import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { http } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import ReviewScheduler from "./ReviewScheduler";
import { useResourceAutosave } from "@/hooks/useResourceAutosave";

export default function SessionComplete({ session, lessonTitle, onFinish, timezone }) {
  const navigate = useNavigate();
  const auth = useAuth();
  const userId = auth?.user?.user_id;
  const mounted = useRef(true);
  const mutation = useRef(false);
  const [circleId, setCircleId] = useState(null);
  const [circleGoals, setCircleGoals] = useState([]);
  const [goalBusy, setGoalBusy] = useState(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!session.circle_event_id) return;
    let live = true;
    http.get(`/circle-sessions/${encodeURIComponent(session.circle_event_id)}`).then(({ data }) => {
      if (!live) return;
      setCircleId(data.circle_id);
      if (data.circle_id) {
        http.get(`/circles/${encodeURIComponent(data.circle_id)}`).then(res => {
          if (!live || !Array.isArray(res?.data?.goals)) return;
          setCircleGoals(res.data.goals.filter(g => !userId || g.user_id === userId));
        }).catch(() => {});
      }
    }).catch(() => { /* The personal completion stays available if a circle was removed. */ });
    return () => { live = false; };
  }, [session.circle_event_id, userId]);
  const toggleGoal = async (goal, completed) => {
    if (!circleId || goalBusy) return;
    setGoalBusy(goal.id);
    try {
      await http.patch(`/circles/${encodeURIComponent(circleId)}/goals/${encodeURIComponent(goal.id)}`, { completed });
      if (mounted.current) setCircleGoals(prev => prev.map(g => g.id === goal.id ? { ...g, completed } : g));
    } catch {} finally { if (mounted.current) setGoalBusy(null); }
  };
  const note = useResourceAutosave({ resourceKey: `session.${session.session_id}`, initialValue: { note: session.note || "" }, save: async patch => (await http.patch(`/sessions/${session.session_id}`, patch)).data });
  const [busy, setBusy] = useState(false);
  const [reviewSaved, setReviewSaved] = useState("");
  const save = async (finish = false, href = null) => { if (mutation.current) return; mutation.current = true; setBusy(true); try { if (await note.flush() && mounted.current) { if (finish) onFinish(); if (href) navigate(href); } } finally { mutation.current = false; if (mounted.current) setBusy(false); } };
  const next = circleId ? { label: "Update my goal", href: `/circles?circle=${encodeURIComponent(circleId)}&tab=goals` } : session.lesson_id ? { label: "Review what I learned", href: `/reviews?lesson=${encodeURIComponent(session.lesson_id)}` } : null;
  return <section className="max-w-2xl mx-auto mb-8 rounded-xl border border-primary/25 bg-accent/40 p-5 space-y-4" aria-label="Session complete">
    <h2 className="font-serif text-2xl">Session complete</h2>
    <p>{Math.round(session.duration_seconds / 60 * 10) / 10} minutes focused{lessonTitle ? ` · ${lessonTitle}` : ""}</p>
    {circleGoals.length > 0 && <div className="space-y-2 rounded-lg border border-border bg-card p-3.5" aria-label="Your circle goals">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your circle goals</p>
      <div className="flex flex-wrap gap-3">
        {circleGoals.map(goal => <label key={goal.id} className="flex min-h-9 items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={!!goal.completed} disabled={busy || goalBusy === goal.id} onChange={e => toggleGoal(goal, e.target.checked)} />
          <span className={goal.completed ? "line-through text-muted-foreground" : "font-medium"}>{goal.title}</span>
        </label>)}
      </div>
      <p className="text-xs text-muted-foreground">Update circle goals instantly without leaving your workspace.</p>
    </div>}
    <details><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">Add a private note</summary><form className="space-y-2 pt-2" onSubmit={e => { e.preventDefault(); void save(); }}><label className="block text-sm">Private session note<textarea className="input mt-1" maxLength={10000} placeholder="What clicked today? (optional)" value={note.draft.note} disabled={busy} onChange={e => note.update({ note: e.target.value })} /></label><button className="btn btn-outline min-h-11" disabled={busy || !session.session_id}>Save note</button></form></details>
    {session.lesson_id && !reviewSaved && <details><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">Schedule a review</summary><ReviewScheduler timezone={timezone} lessonId={session.lesson_id} onSaved={() => setReviewSaved("Review scheduled.")} onSkip={() => setReviewSaved("Your existing review schedule is unchanged.")} /></details>}
    {reviewSaved && <p role="status" className="text-sm">{reviewSaved}</p>}
    {note.error && <p role="alert" className="text-destructive">{note.error} Use Save note to retry.</p>}
    {note.saveState === "saved" && <p role="status" className="text-sm">Note saved.</p>}
    {circleId && <details><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">More study options</summary><button className="btn btn-ghost min-h-11" disabled={busy} onClick={() => save(true, `/circles?circle=${encodeURIComponent(circleId)}&repeat=${encodeURIComponent(session.circle_event_id)}`)}>Plan the next session</button>{session.lesson_id && <button className="btn btn-ghost min-h-11" disabled={busy} onClick={() => save(true, `/reviews?lesson=${encodeURIComponent(session.lesson_id)}`)}>Review what I learned</button>}</details>}
    <div className="flex flex-wrap gap-2">{next && <button className="btn btn-primary min-h-11" disabled={busy} onClick={() => save(true, next.href)}>{next.label}</button>}<button className={`btn min-h-11 ${next ? "btn-ghost" : "btn-primary"}`} disabled={busy} onClick={() => save(true)}>Finish</button></div>
  </section>;
}
