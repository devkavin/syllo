import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { http, formatError } from "@/lib/api";
import { useResourceAutosave } from "@/hooks/useResourceAutosave";
import ReviewScheduler from "@/components/ReviewScheduler";
import { useAuth } from "@/lib/auth";
import { formatStudyTime } from "@/lib/studyTime";

export default function LessonWorkspace() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setData(null); setError("");
    (async () => {
      const lesson = (await http.get(`/lessons/${id}`)).data;
      const [subjects, units, tasks, notebooks, reviews] = await Promise.all(["/subjects", `/subjects/${lesson.subject_id}/units`, "/tasks", "/notebooks", "/reviews"].map(url => http.get(url).then(r => r.data)));
      if (live) setData({ lesson, subject: subjects.find(s => s.subject_id === lesson.subject_id), unit: units.find(u => u.unit_id === lesson.unit_id), tasks: tasks.filter(t => t.lesson_id === id), notebooks: notebooks.filter(n => n.lesson_id === id), review: reviews.find(r => r.lesson_id === id) });
    })().catch(e => { if (live) setError(formatError(e)); });
    return () => { live = false; };
  }, [id]);
  if (error) return <p role="alert" className="text-destructive">{error}</p>;
  if (!data) return <p role="status">Opening lesson…</p>;
  return <LessonContent key={id} data={data} />;
}

function LessonContent({ data }) {
  const auth = useAuth(); const timezone = auth?.user?.timezone;
  const { lesson, subject, unit, tasks, notebooks } = data;
  const [review, setReview] = useState(data.review);
  const [scheduling, setScheduling] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false), [reviewError, setReviewError] = useState(""), [reviewMessage, setReviewMessage] = useState("");
  const autosave = useResourceAutosave({ resourceKey: `lesson.${lesson.lesson_id}`, initialValue: { notes: lesson.notes, status: lesson.status }, save: async patch => (await http.patch(`/lessons/${lesson.lesson_id}`, patch)).data });
  const markReview = async quality => {
    if (reviewBusy) return; setReviewBusy(true); setReviewError("");
    try {
      if (!(await autosave.flush())) return;
      const { data: updated } = await http.post(`/reviews/${review.review_id}/mark`, { quality });
      setReview(updated); setReviewMessage("Review complete. Your next review is scheduled.");
    } catch (e) { setReviewError(formatError(e)); }
    finally { setReviewBusy(false); }
  };
  return <div className="max-w-4xl mx-auto space-y-6">
    <nav aria-label="Lesson breadcrumbs" className="flex flex-wrap gap-2 items-center text-sm text-muted-foreground"><Link className="action-link" to={`/subjects/${lesson.subject_id}`}>{subject?.name || "Subject"}</Link><span aria-hidden="true">/</span><span>{unit?.name || "Unit"}</span></nav>
    <header><h1 className="page-title">{lesson.title}</h1><div className="mt-3 flex flex-wrap gap-3"><Link className="btn btn-primary" to={`/timer?lesson=${lesson.lesson_id}`}>Start studying</Link><button className="btn btn-outline" onClick={() => setScheduling(!scheduling)}>Schedule review</button><Link className="btn btn-ghost" to={`/tasks?lesson=${lesson.lesson_id}`}>Add task</Link></div></header>
    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground"><span>{Math.round(lesson.total_seconds / 60)} minutes studied</span><span>{lesson.last_studied_at ? `Last studied ${formatStudyTime(lesson.last_studied_at, timezone, true)}` : "Not studied yet"}</span><span>{review ? `Next review ${formatStudyTime(review.next_review_at, timezone, true)}` : "No review scheduled"}</span></div>
    {scheduling && <ReviewScheduler timezone={timezone} lessonId={lesson.lesson_id} onSaved={r => { setReview(r); setScheduling(false); }} onSkip={() => setScheduling(false)} />}
    <label className="block text-sm">Lesson status<select className="input mt-1 max-w-xs" value={autosave.draft.status} onChange={e => autosave.update({ status: e.target.value })}>{[["not_started", "Not started"], ["in_progress", "Learning"], ["learning", "Learning"], ["reviewed", "Reviewed"], ["done", "Completed"], ["completed", "Completed"]].map(([v, label]) => <option value={v} key={v}>{label}</option>)}</select></label>
    <section className="border-y border-border py-6"><label htmlFor="lesson-notes" className="font-medium">Lesson notes</label><textarea id="lesson-notes" className="mt-3 w-full min-h-[45vh] resize-y bg-transparent text-base leading-relaxed outline-hidden focus-visible:ring-2 focus-visible:ring-ring rounded-xs p-2 font-serif" placeholder="Write what you want to remember…" value={autosave.draft.notes || ""} onChange={e => autosave.update({ notes: e.target.value })} /><p role="status" className="text-xs text-muted-foreground">{autosave.saveState === "saving" ? "Saving…" : autosave.saveState === "saved" ? "Saved" : autosave.error}</p>{autosave.saveState === "failed" && <button className="btn btn-outline" onClick={autosave.retry}>Retry save</button>}</section>
    {review && new Date(review.next_review_at) <= new Date() && <section aria-label="Complete review" className="space-y-3"><h2 className="font-medium">Ready for review</h2><p className="text-sm text-muted-foreground">Read your notes or practise a question. How did it go?</p><div className="flex flex-wrap gap-2"><button className="btn btn-primary" disabled={reviewBusy} onClick={() => markReview("good")}>Good · understood</button><button className="btn btn-outline" disabled={reviewBusy} onClick={() => markReview("again")}>Again · revisit tomorrow</button></div></section>}
    {reviewMessage && <p role="status" className="text-sm">{reviewMessage}</p>}
    {reviewError && <p role="alert" className="text-sm text-destructive">{reviewError} Your review is still due. Try again.</p>}
    <section><h2 className="font-medium mb-2">Related tasks</h2>{tasks.length ? <ul className="space-y-2">{tasks.map(t => <li key={t.task_id}><Link className="action-link" to={`/tasks?task=${t.task_id}`}>{t.title}{t.completed ? " · completed" : ""}</Link></li>)}</ul> : <p className="text-sm text-muted-foreground">No tasks linked yet.</p>}</section>
    {!!notebooks.length && <section><h2 className="font-medium mb-2">Related notebooks</h2>{notebooks.map(n => <Link key={n.notebook_id} className="block action-link py-1" to={`/notebooks?notebook=${n.notebook_id}`}>{n.title}</Link>)}</section>}
  </div>;
}
