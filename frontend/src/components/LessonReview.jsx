import React, { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, ChevronDown } from "lucide-react";
import { http, formatError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { formatStudyTime } from "@/lib/studyTime";
import NotebookPractice from "@/components/NotebookPractice";

const NotebookEditor = lazy(() => import("@/components/NotebookEditor"));

export default function LessonReview({ review, onSaved, backHref = "/reviews" }) {
  const { theme } = useTheme();
  const timezone = useAuth()?.user?.timezone;
  const [attempt, setAttempt] = useState("");
  const [checking, setChecking] = useState(false);
  const [notes, setNotes] = useState(null);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState("");
  const [notesTrashed, setNotesTrashed] = useState(false);
  const [notesRetry, setNotesRetry] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(null);
  const [alreadyUpdated, setAlreadyUpdated] = useState(false);
  const mutation = useRef(false);
  const mounted = useRef(true);
  const headingRef = useRef(null);
  const due = new Date(review.next_review_at) <= new Date();

  useEffect(() => {
    mounted.current = true;
    headingRef.current?.focus();
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => { if (saved) headingRef.current?.focus(); }, [saved]);

  useEffect(() => {
    if (!checking) return;
    let live = true;
    setNotesLoading(true); setNotesError(""); setNotesTrashed(false);
    http.get(`/lessons/${review.lesson_id}/notebook`)
      .then(({ data }) => { if (live) setNotes(data); })
      .catch(failure => { if (live) { const trashed = failure?.response?.status === 409; setNotesTrashed(trashed); setNotesError(trashed ? "This lesson’s notebook is in Trash. Restore it to check your notes." : formatError(failure)); } })
      .finally(() => { if (live) setNotesLoading(false); });
    return () => { live = false; };
  }, [checking, review.lesson_id, notesRetry]);

  async function finish(quality) {
    if (mutation.current || saved || !due) return;
    mutation.current = true; setBusy(true); setError("");
    try {
      const { data } = await http.post(`/reviews/${review.review_id}/mark`, { quality, expected_next_review_at: review.next_review_at });
      if (mounted.current) { setSaved(data); onSaved(data); }
    } catch (failure) { if (mounted.current) {
      const current = failure.response?.data?.detail?.current;
      if (failure.response?.status === 409 && current?.review_id === review.review_id) {
        setAlreadyUpdated(true); setSaved(current); onSaved(current);
      } else setError(formatError(failure));
    } }
    finally { if (mounted.current) { mutation.current = false; setBusy(false); } }
  }

  return <section className="max-w-4xl mx-auto space-y-6" aria-label="Guided lesson review">
    <Link className="btn btn-ghost -ml-3 w-fit" to={backHref} aria-disabled={busy || undefined} onClick={event => { if (busy) event.preventDefault(); }}><ArrowLeft className="w-4 h-4" />Back to reviews</Link>
    {saved ? <div className="card p-5 sm:p-6 space-y-3" role="status">
      <Check className="h-6 w-6 text-primary" aria-hidden="true" />
      <h2 ref={headingRef} tabIndex={-1} className="font-serif text-2xl outline-none">{alreadyUpdated ? "Review already updated" : "Review saved"}</h2>
      <p>{alreadyUpdated ? "This schedule was updated by an earlier save or another device. Its saved date has been kept." : `You revisited ${review.lesson_title || "this lesson"}.`}</p>
      <p className="text-sm text-muted-foreground">Next review: {formatStudyTime(saved.next_review_at, timezone, true, true)}.</p>
      <Link className="btn btn-primary" to={backHref}>Continue to reviews</Link>
    </div> : <>
      <header className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">{checking ? "2 · Check and rate" : "1 · Recall from memory"}</p>
        <h1 ref={headingRef} tabIndex={-1} className="font-serif text-2xl sm:text-3xl outline-none">Review {review.lesson_title || "this lesson"}</h1>
        <p className="text-sm text-muted-foreground">Explain the key ideas or solve an example before looking at your notes. You can also answer on paper or out loud.</p>
        {!due && <p className="notice">This review is scheduled for {formatStudyTime(review.next_review_at, timezone, true)}. You can practise now; its review date stays the same.</p>}
      </header>
      <label className="block text-sm font-medium">What can you remember? <span className="font-normal text-muted-foreground">(optional)</span>
        <textarea className="input mt-2 min-h-36" value={attempt} maxLength={10000} disabled={busy} onChange={event => setAttempt(event.target.value)} placeholder="Key ideas, a formula, or the steps you would use…" />
      </label>
      <p className="text-xs text-muted-foreground">This scratch space lasts while this review is open. Your rating saves the review result.</p>
      {!checking ? <button className="btn btn-primary" onClick={() => setChecking(true)}>Check my recall</button> : <>
        <section className="card p-4 sm:p-5 space-y-4" aria-label="Check lesson notes">
          <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-medium">Compare with your notes</h3>{notes?.notebook_id && <Link className="action-link text-sm" to={`/notebooks?notebook=${encodeURIComponent(notes.notebook_id)}`} target="_blank" rel="noopener noreferrer">Open lesson notebook<span className="sr-only"> (opens in a new tab)</span></Link>}</div>
          {notesLoading ? <p role="status" className="text-sm text-muted-foreground">Opening notes…</p> : notesError ? <div className="space-y-2"><p className="text-sm text-destructive">{notesError}</p><button className="btn btn-outline text-sm" onClick={() => setNotesRetry(value => value + 1)}>Retry notes</button>{notesTrashed && <Link className="action-link text-sm ml-3" target="_blank" rel="noopener noreferrer" to="/notebooks?trash=1">Open notebook Trash</Link>}</div> : notes?.notebook_id && (notes.content || notes.rich_content?.length) ? <div className="max-h-[50dvh] overflow-auto rounded-lg bg-background p-2 sm:p-3"><Suspense fallback={<p role="status">Opening notes…</p>}><NotebookEditor key={notes.notebook_id} notebook={notes} theme={theme} readOnly /></Suspense></div> : <p className="text-sm text-muted-foreground">No notes saved yet. Check your textbook or class notes, then rate what you recalled.</p>}
        </section>
        <details className="group border-y border-border py-3"><summary className="cursor-pointer text-sm font-medium min-h-11 flex items-center justify-between gap-3">Practise saved questions<ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" /></summary><div className="pt-3"><NotebookPractice lessonId={review.lesson_id} /></div></details>
        {due && <section className="space-y-3" aria-label="Rate lesson recall"><h3 className="font-medium">How did you recall it?</h3><p className="text-sm text-muted-foreground">Recalled it schedules a later review. Review again brings it back tomorrow. This is your own assessment.</p><div className="flex flex-wrap gap-2"><button className="btn btn-primary min-h-11" disabled={busy} onClick={() => finish("good")}>{busy ? "Saving…" : "Recalled it"}</button><button className="btn btn-outline min-h-11" disabled={busy} onClick={() => finish("again")}>Review again tomorrow</button></div>{error && <p role="alert" className="text-sm text-destructive">{error} Your attempt is still here. Try saving again.</p>}</section>}
      </>}
    </>}
  </section>;
}
