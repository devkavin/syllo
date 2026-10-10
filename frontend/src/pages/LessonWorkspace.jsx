import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { http, formatError } from "@/lib/api";
import { useResourceAutosave } from "@/hooks/useResourceAutosave";
import ReviewScheduler from "@/components/ReviewScheduler";
import { useAuth } from "@/lib/auth";
import { formatStudyTime } from "@/lib/studyTime";

async function loadLessonNotebook(id) {
  try { return (await http.get(`/lessons/${id}/notebook`)).data; }
  catch (e) {
    return { unavailable: true, trash: e?.response?.status === 409 && e.response.data?.detail?.notebook_id, error: formatError(e) };
  }
}

function lessonRecoveryKey(lessonId, accountId) {
  return `syllo.lesson-recovery.${encodeURIComponent(accountId)}.${lessonId}`;
}

function recoverLegacyLessonDraft(lesson, accountId) {
  let draft = null;
  try {
    if (!accountId) return null;
    const legacyKey = `syllo.draft.lesson.${lesson.lesson_id}`;
    const recoveryKey = lessonRecoveryKey(lesson.lesson_id, accountId);
    draft = JSON.parse(localStorage.getItem(recoveryKey) || sessionStorage.getItem(legacyKey) || "null");
    if (!draft || typeof draft !== "object" || Array.isArray(draft)) return null;
    if (typeof draft.notes === "string") localStorage.setItem(recoveryKey, JSON.stringify(draft));
    if (draft.status) {
      const statusKey = `syllo.draft.account.${encodeURIComponent(accountId)}.lesson-status.${lesson.lesson_id}`;
      if (!localStorage.getItem(statusKey)) localStorage.setItem(statusKey, JSON.stringify({ status: draft.status }));
    }
    sessionStorage.removeItem(legacyKey);
  } catch { /* Keep displaying the old draft if durable storage is unavailable. */ }
  return typeof draft?.notes === "string" ? draft : null;
}

export default function LessonWorkspace() {
  const { id } = useParams();
  const accountId = useAuth()?.user?.user_id;
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setData(null); setError("");
    (async () => {
      const lesson = (await http.get(`/lessons/${id}`)).data;
      const [subjects, units, tasks, notebooks, reviews, notebook] = await Promise.all([...(["/subjects", `/subjects/${lesson.subject_id}/units`, "/tasks", "/notebooks", "/reviews"].map(url => http.get(url).then(r => r.data))), loadLessonNotebook(id)]);
      if (live) setData({ lesson, notebook, accountId, subject: subjects.find(s => s.subject_id === lesson.subject_id), unit: units.find(u => u.unit_id === lesson.unit_id), tasks: tasks.filter(t => t.lesson_id === id), notebooks: notebooks.filter(n => n.lesson_id === id && n.notebook_id !== notebook?.notebook_id), review: reviews.find(r => r.lesson_id === id) });
    })().catch(e => { if (live) setError(formatError(e)); });
    return () => { live = false; };
  }, [id, accountId]);
  if (error) return <p role="alert" className="text-destructive">{error}</p>;
  if (!data || data.accountId !== accountId) return <p role="status">Opening lesson…</p>;
  return <LessonContent key={`${accountId}.${id}`} data={data} />;
}

function LessonContent({ data }) {
  const auth = useAuth(); const timezone = auth?.user?.timezone;
  const { lesson, subject, unit, tasks, notebooks } = data;
  const [legacyDraft, setLegacyDraft] = useState(() => recoverLegacyLessonDraft(lesson, auth?.user?.user_id));
  const [recoveredNotebook, setRecoveredNotebook] = useState(null);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryError, setRecoveryError] = useState("");
  const saveRecoveredNotebook = async () => {
    if (recoveryBusy) return; setRecoveryBusy(true); setRecoveryError("");
    try {
      const suffix = " (recovered copy)";
      const { data: recovered } = await http.post("/notebooks", { title: `${lesson.title.slice(0, 240 - suffix.length)}${suffix}`, content: legacyDraft.notes, rich_content: null, subject_id: lesson.subject_id, lesson_id: lesson.lesson_id });
      setRecoveredNotebook(recovered); setLegacyDraft(null);
      try { localStorage.removeItem(lessonRecoveryKey(lesson.lesson_id, auth?.user?.user_id)); } catch { /* The saved notebook remains available if cleanup fails. */ }
    } catch (e) { setRecoveryError(formatError(e)); }
    finally { setRecoveryBusy(false); }
  };
  const [notebook, setNotebook] = useState(data.notebook);
  const [notebookBusy, setNotebookBusy] = useState(false);
  const retryNotebook = async () => { setNotebookBusy(true); setNotebook(await loadLessonNotebook(lesson.lesson_id)); setNotebookBusy(false); };
  const [review, setReview] = useState(data.review);
  const [scheduling, setScheduling] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false), [reviewError, setReviewError] = useState(""), [reviewMessage, setReviewMessage] = useState("");
  const autosave = useResourceAutosave({ resourceKey: `lesson-status.${lesson.lesson_id}`, accountId: auth?.user?.user_id, initialValue: { status: lesson.status }, save: async patch => (await http.patch(`/lessons/${lesson.lesson_id}`, patch)).data });
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
    <p role="status" className="text-xs text-muted-foreground">{autosave.saveState === "saving" ? "Saving status…" : autosave.saveState === "saved" ? "Status saved" : autosave.error}</p>{autosave.saveState === "failed" && <button className="btn btn-outline" onClick={autosave.retry}>Retry save</button>}
    <section className="card p-5 space-y-3"><h2 className="font-medium">Lesson notes</h2><p className="text-sm text-muted-foreground">Write, focus and practise in this lesson’s notebook.</p>{notebook?.notebook_id && <Link className="btn btn-primary" to={`/notebooks?notebook=${notebook.notebook_id}`}>Open lesson notebook</Link>}{notebook?.unavailable && <div className="space-y-2"><p role="alert" className="text-sm text-destructive">{notebook.trash ? "This lesson’s notebook is in Trash. Restore it to continue writing." : notebook.error}</p>{notebook.trash ? <Link className="btn btn-outline" to="/notebooks?trash=1">Open notebook Trash</Link> : <button className="btn btn-outline" disabled={notebookBusy} onClick={retryNotebook}>{notebookBusy ? "Opening notebook…" : "Retry notebook"}</button>}</div>}{lesson.notes && <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Original lesson notes</summary><p className="text-xs text-muted-foreground mt-3">The original text is preserved here. Continue editing in the notebook.</p><textarea aria-label="Original lesson notes" className="input mt-2 min-h-32 leading-relaxed" value={lesson.notes} readOnly /></details>}</section>
    {legacyDraft && <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-5 space-y-3" aria-label="Recovered lesson draft"><h2 className="font-medium">Recovered lesson draft</h2><p className="text-sm">An unsaved draft from the previous lesson editor is kept on this device. Save a separate notebook to continue writing.</p><textarea aria-label="Recovered lesson notes" className="input min-h-32" value={legacyDraft.notes} readOnly /><button className="btn btn-primary" disabled={recoveryBusy} onClick={saveRecoveredNotebook}>{recoveryBusy ? "Saving recovered notebook…" : "Save recovered notebook"}</button>{recoveryError && <p role="alert" className="text-sm text-destructive">{recoveryError}</p>}</section>}
    {recoveredNotebook && <Link className="btn btn-outline" to={`/notebooks?notebook=${recoveredNotebook.notebook_id}`}>Open recovered notebook</Link>}
    {review && new Date(review.next_review_at) <= new Date() && <section aria-label="Complete review" className="space-y-3"><h2 className="font-medium">Ready for review</h2><p className="text-sm text-muted-foreground">Read your notes or practise a question. How did it go?</p><div className="flex flex-wrap gap-2"><button className="btn btn-primary" disabled={reviewBusy} onClick={() => markReview("good")}>Good · understood</button><button className="btn btn-outline" disabled={reviewBusy} onClick={() => markReview("again")}>Again · revisit tomorrow</button></div></section>}
    {reviewMessage && <p role="status" className="text-sm">{reviewMessage}</p>}
    {reviewError && <p role="alert" className="text-sm text-destructive">{reviewError} Your review is still due. Try again.</p>}
    <section><h2 className="font-medium mb-2">Related tasks</h2>{tasks.length ? <ul className="space-y-2">{tasks.map(t => <li key={t.task_id}><Link className="action-link" to={`/tasks?task=${t.task_id}`}>{t.title}{t.completed ? " · completed" : ""}</Link></li>)}</ul> : <p className="text-sm text-muted-foreground">No tasks linked yet.</p>}</section>
    {!!notebooks.length && <section><h2 className="font-medium mb-2">Related notebooks</h2>{notebooks.map(n => <Link key={n.notebook_id} className="block action-link py-1" to={`/notebooks?notebook=${n.notebook_id}`}>{n.title}</Link>)}</section>}
  </div>;
}
