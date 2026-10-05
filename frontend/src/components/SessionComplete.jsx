import React, { useState } from "react";
import { http } from "@/lib/api";
import ReviewScheduler from "./ReviewScheduler";
import { useResourceAutosave } from "@/hooks/useResourceAutosave";

export default function SessionComplete({ session, lessonTitle, onFinish, timezone }) {
  const note = useResourceAutosave({ resourceKey: `session.${session.session_id}`, initialValue: { note: session.note || "" }, save: async patch => (await http.patch(`/sessions/${session.session_id}`, patch)).data });
  const [busy, setBusy] = useState(false);
  const [reviewSaved, setReviewSaved] = useState("");
  const save = async (finish = false) => { setBusy(true); try { if (await note.flush()) { if (finish) onFinish(); } } finally { setBusy(false); } };
  return <section className="max-w-2xl mx-auto mb-8 rounded-xl border border-primary/25 bg-accent/40 p-5 space-y-4" aria-label="Session complete">
    <h2 className="font-serif text-2xl">Session complete</h2>
    <p>{Math.round(session.duration_seconds / 60 * 10) / 10} minutes focused{lessonTitle ? ` · ${lessonTitle}` : ""}</p>
    <form className="space-y-2" onSubmit={e => { e.preventDefault(); void save(); }}><label className="block text-sm">Private session note<textarea className="input mt-1" maxLength={10000} placeholder="What clicked today? (optional)" value={note.draft.note} disabled={busy} onChange={e => note.update({ note: e.target.value })} /></label><button className="btn btn-outline" disabled={busy || !session.session_id}>Save note</button></form>
    {session.lesson_id && !reviewSaved && <ReviewScheduler timezone={timezone} lessonId={session.lesson_id} onSaved={() => setReviewSaved("Review scheduled.")} onSkip={() => setReviewSaved("Your existing review schedule is unchanged.")} />}
    {reviewSaved && <p role="status" className="text-sm">{reviewSaved}</p>}
    {note.error && <p role="alert" className="text-destructive">{note.error} Use Save note to retry.</p>}
    {note.saveState === "saved" && <p role="status" className="text-sm">Note saved.</p>}
    <button className="btn btn-primary" disabled={busy} onClick={() => save(true)}>Finish</button>
  </section>;
}
