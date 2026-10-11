import React, { useEffect, useRef, useState } from "react";
import { Plus, ArrowLeft, Pencil, Trash2, BookOpen, Check } from "lucide-react";
import { http, formatError } from "@/lib/api";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const emptyDraft = kind => ({ kind: kind === "mixed" ? "question" : kind, format: "basic", prompt: "", answer: "", mistake: "", correction: "", time_limit_seconds: "120", max_marks: "" });
const itemDraft = item => ({ ...emptyDraft(item.kind), ...item, answer: item.answer || "", mistake: item.mistake || "", correction: item.correction || "", format: item.format || "basic", time_limit_seconds: item.time_limit_seconds ?? "120", max_marks: item.max_marks ?? "" });
const savedAnswer = item => item.kind === "mistake" ? item.correction : item.answer;
const visiblePrompt = (item, revealed = false) => item.format === "reverse" ? item.answer || savedAnswer(item) : item.format === "cloze" ? item.prompt.replace(/\{\{([\s\S]*?)\}\}/g, (_, words) => revealed ? words : "[…]") : item.prompt;
const clockLabel = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/** Manual recall and mistake practice. Ratings are self-assessments, never AI grades. */
export default function NotebookPractice({ notebook, getSelectedText, beforeStart, dueOnly = false, lessonId = null, initialQuestionId = null }) {
  const [kind, setKind] = useState("question");
  const [due, setDue] = useState(dueOnly);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [retry, setRetry] = useState(0);
  const [form, setForm] = useState(null);
  const [editing, setEditing] = useState(null);
  const [editConflict, setEditConflict] = useState(null);
  const [practising, setPractising] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [response, setResponse] = useState("");
  const [session, setSession] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [earnedMarks, setEarnedMarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingRating, setPendingRating] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const liveScope = useRef(0);
  const mutation = useRef(false);
  const loadEpoch = useRef(0);
  const startedAt = useRef(0);
  const openedQuestion = useRef(null);
  const scope = `${notebook?.notebook_id || "all"}.${lessonId || "all"}.${initialQuestionId || "queue"}`;

  useEffect(() => {
    ++liveScope.current;
    setForm(null); setEditing(null); setEditConflict(null); setPractising(null); setPendingRating(null);
    setSession(null); openedQuestion.current = null; setDue(dueOnly && !initialQuestionId);
    setError(""); setMessage(""); setDeleting(null); setBusy(false); mutation.current = false;
  }, [scope]);

  useEffect(() => {
    const epoch = ++loadEpoch.current;
    let live = true; setLoading(true); setLoadError(""); setPractising(null); setPendingRating(null); setSession(null);
    http.get("/study/questions", { params: { ...(notebook?.notebook_id ? { notebook_id: notebook.notebook_id, ...(kind !== "mixed" ? { kind } : {}) } : {}), ...(lessonId ? { lesson_id: lessonId } : {}), ...(due && !initialQuestionId ? { due: true } : {}) } })
      .then(({ data }) => { if (live && epoch === loadEpoch.current) {
        setItems(data);
        if (initialQuestionId && openedQuestion.current !== initialQuestionId) {
          const linked = data.find(item => item.question_id === initialQuestionId);
          if (linked) { openedQuestion.current = initialQuestionId; practise(linked); }
          else setLoadError("This practice is no longer available in this scope.");
        }
      } })
      .catch(failure => { if (live && epoch === loadEpoch.current) { setItems([]); setLoadError(formatError(failure)); } })
      .finally(() => { if (live && epoch === loadEpoch.current) setLoading(false); });
    return () => { live = false; };
  }, [scope, kind, due, retry]);

  useEffect(() => {
    if (practising?.format !== "exam" || revealed) return;
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - startedAt.current) / 1000)));
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [practising?.question_id, revealed]);

  function openForm(item = null) {
    setError(""); setMessage(""); setEditing(item); setEditConflict(null);
    setForm(item ? itemDraft(item) : { ...emptyDraft(kind), prompt: getSelectedText?.()?.trim() || "" });
  }

  async function saveQuestion(event, asCopy = false) {
    event.preventDefault();
    if (mutation.current || (editConflict && !asCopy)) return;
    if (form.format === "cloze" && !/\{\{[^{}]+\}\}/.test(form.prompt)) { setError("Wrap at least one hidden word in {{double braces}} for cloze practice."); return; }
    const lifetime = liveScope.current;
    mutation.current = true; setBusy(true); setError("");
    try {
      if (beforeStart && !(await beforeStart())) { setError("Save your notebook or recover its draft before adding practice."); return; }
      const body = { kind: form.kind, format: form.format, prompt: form.prompt.trim(), answer: form.kind === "mistake" && form.format === "reverse" ? form.correction.trim() : form.answer.trim(), mistake: form.mistake.trim(), correction: form.correction.trim(), time_limit_seconds: form.format === "exam" ? Number(form.time_limit_seconds) : null, max_marks: form.format === "exam" && form.max_marks !== "" ? Number(form.max_marks) : null };
      const updating = editing && !asCopy;
      const { data } = updating ? await http.patch(`/study/questions/${editing.question_id}`, { ...body, expected_revision: editing.revision })
        : await http.post("/study/questions", { ...body, notebook_id: notebook.notebook_id, subject_id: notebook.subject_id || null, lesson_id: notebook.lesson_id || null });
      if (lifetime !== liveScope.current) return;
      ++loadEpoch.current;
      setItems(previous => updating ? previous.map(item => item.question_id === data.question_id ? data : item) : [data, ...previous]);
      setLoading(false); setLoadError(""); setRetry(value => value + 1);
      setForm(null); setEditing(null); setEditConflict(null); setMessage(updating ? "Practice updated." : form.kind === "mistake" ? "Mistake saved for another attempt." : "Question saved for practice.");
    } catch (failure) { if (lifetime === liveScope.current) {
      setError(formatError(failure));
      if (editing && failure.response?.status === 409) setEditConflict({ current: failure.response.data?.detail?.current });
    } }
    finally { if (lifetime === liveScope.current) { mutation.current = false; setBusy(false); } }
  }

  function practise(item, inSession = false) {
    setPractising(item); setRevealed(false); setResponse(""); setError(""); setMessage(""); setPendingRating(null);
    startedAt.current = Date.now(); setElapsed(0); setEarnedMarks("");
    if (!inSession) setSession(null);
  }

  function startSession() {
    if (!items.length || loading) return;
    setSession({ queue: [...items], index: 0, saved: 0 }); practise(items[0], true);
  }

  function reveal() {
    if (practising.format === "exam") setElapsed(Math.max(0, Math.floor((Date.now() - startedAt.current) / 1000)));
    setRevealed(true);
  }

  async function rate(quality, repeat = false) {
    if (mutation.current || !revealed || !practising) return;
    if (!repeat && earnedMarks !== "" && (!Number.isInteger(Number(earnedMarks)) || Number(earnedMarks) < 0 || Number(earnedMarks) > practising.max_marks)) { setError(`Enter whole marks from 0 to ${practising.max_marks}.`); return; }
    const lifetime = liveScope.current;
    const request = repeat ? pendingRating : { questionId: practising.question_id, body: { quality, expected_revision: practising.revision, request_id: crypto.randomUUID(), ...(practising.format === "exam" ? { elapsed_seconds: elapsed } : {}), ...(earnedMarks !== "" && practising.max_marks ? { earned_marks: Number(earnedMarks) } : {}) } };
    if (!request) return;
    mutation.current = true; setBusy(true); setError(""); setPendingRating(request);
    try {
      const { data } = await http.post(`/study/questions/${request.questionId}/attempt`, request.body);
      if (lifetime !== liveScope.current) return;
      setItems(previous => previous.flatMap(item => item.question_id !== data.question_id ? [item] : due && new Date(data.next_review_at) > new Date() ? [] : [data]));
      setPendingRating(null);
      if (session && session.index + 1 < session.queue.length) {
        setSession({ ...session, index: session.index + 1, saved: session.saved + 1 }); practise(session.queue[session.index + 1], true);
      } else {
        setPractising(null); setSession(null); setMessage(session ? `Session complete · ${session.saved + 1} reviews saved. Your next practice is scheduled.` : "Review saved. Your next practice is scheduled.");
      }
    } catch (failure) {
      if (lifetime !== liveScope.current) return;
      if (failure.response?.status >= 400 && failure.response.status < 500) {
        // Definite rejections end this attempt. Transport and gateway failures
        // can hide a committed response, so keep the same request for replay.
        setPendingRating(null);
        if (failure.response.status === 409) { setPractising(null); setSession(null); setRetry(value => value + 1); }
      }
      setError(formatError(failure));
    } finally { if (lifetime === liveScope.current) { mutation.current = false; setBusy(false); } }
  }

  async function remove() {
    if (mutation.current || !deleting) return;
    const lifetime = liveScope.current; const id = deleting.question_id;
    mutation.current = true; setBusy(true); setError("");
    try {
      await http.delete(`/study/questions/${id}`);
      if (lifetime !== liveScope.current) return;
      ++loadEpoch.current; setLoading(false);
      setItems(previous => previous.filter(item => item.question_id !== id)); setDeleting(null); setMessage("Practice removed. Your earlier practice results are kept.");
    } catch (failure) { if (lifetime === liveScope.current) setError(formatError(failure)); }
    finally { if (lifetime === liveScope.current) { mutation.current = false; setBusy(false); } }
  }

  return <section aria-label={notebook ? "Notebook practice" : lessonId ? "Lesson practice" : "Due practice"} className="space-y-4">
    {!practising && <>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-semibold text-lg">{notebook ? "Practice from your notes" : lessonId ? "Practise this lesson" : "Practise what’s due"}</h2>
        <button className="btn btn-primary sm:ml-auto" disabled={loading || !items.length || !!loadError} onClick={startSession}>Start practice</button>
      </div>
      <div className="flex flex-wrap gap-3 items-center text-sm text-muted-foreground">
        <p className="flex-1">{notebook ? kind === "mistake" ? "Keep the question, what went wrong, and the method to try next." : "Write a question, recall the answer, then check it. Selected note text becomes your question." : lessonId ? "Try questions and mistakes from this lesson before revealing your saved answers." : "Try answering before revealing your notes. Questions and mistakes appear here when due."}</p>
      </div>
      {notebook && <details><summary className="btn btn-ghost cursor-pointer text-sm w-fit">Practice options</summary><div className="flex flex-wrap gap-3 items-center py-3">
        <div className="segmented-control" role="group" aria-label="Practice type">{[["question", "Questions"], ["mistake", "Mistakes"], ["mixed", "Mixed"]].map(([value, label]) => <button key={value} className="segment" aria-pressed={kind === value} onClick={() => { setKind(value); setError(""); setMessage(""); }}>{label}</button>)}</div>
        <label className="inline-flex items-center gap-2 min-h-11"><input type="checkbox" checked={due} onChange={event => setDue(event.target.checked)} />Due only</label>
        <button className="btn btn-outline text-sm" onClick={() => openForm()}><Plus className="h-4 w-4" />{kind === "mistake" ? "Add mistake" : "Add question"}</button>
      </div></details>}
    </>}
    {loadError && <p role="alert" className="notice">{loadError}<button className="btn btn-outline text-sm" onClick={() => setRetry(value => value + 1)}>Retry practice</button></p>}
    {loading ? <p role="status" className="text-sm text-muted-foreground">Loading practice…</p> : practising ? <article className="rounded-xl border border-border bg-background/60 p-4 sm:p-5 space-y-4">
      <button className="btn btn-ghost -ml-3 text-sm" disabled={busy || !!pendingRating} onClick={() => { setPractising(null); setSession(null); setError(""); }}><ArrowLeft className="h-4 w-4" />{session ? "End session" : "Back to questions"}</button>
      {session && <p className="text-xs text-muted-foreground">Question {session.index + 1} of {session.queue.length} · {session.saved} reviews saved</p>}
      <div className="space-y-2"><p className="text-xs text-muted-foreground">{practising.format === "exam" ? "Timed exam practice" : practising.format === "reverse" ? "Reverse recall · identify the question" : practising.format === "cloze" ? "Cloze recall · fill the gaps" : practising.kind === "mistake" ? "Try this again" : "Recall from memory"}</p><h3 className="font-serif text-xl whitespace-pre-wrap break-words">{visiblePrompt(practising, revealed)}</h3></div>
      {practising.format === "exam" && <p className="text-sm text-muted-foreground">{revealed ? `Time taken ${clockLabel(elapsed)}` : practising.time_limit_seconds && elapsed >= practising.time_limit_seconds ? "Time is up. Finish your attempt, then reveal and rate it yourself." : practising.time_limit_seconds ? `Time remaining ${clockLabel(Math.max(0, practising.time_limit_seconds - elapsed))}` : `Time elapsed ${clockLabel(elapsed)}`}{practising.max_marks ? ` · ${practising.max_marks} available marks` : ""}</p>}
      <label className="block text-sm">Your attempt <span className="text-muted-foreground">(optional)</span><textarea className="input mt-2 min-h-24" placeholder="Try answering without looking at your notes…" maxLength={10000} value={response} disabled={busy || !!pendingRating} onChange={event => setResponse(event.target.value)} /></label>
      {!revealed ? <button className="btn btn-primary" onClick={reveal}>Reveal answer</button> : <>
        <div className="rounded-lg bg-accent/40 p-4 space-y-3">
          {practising.kind === "mistake" && practising.mistake && <div><p className="text-xs text-muted-foreground mb-1">What went wrong last time</p><p className="whitespace-pre-wrap break-words">{practising.mistake}</p></div>}
          <div><p className="text-xs font-medium text-primary mb-1">{practising.format === "reverse" ? "Original question" : practising.kind === "mistake" ? "Corrected method" : "Your saved answer"}</p><p className="whitespace-pre-wrap break-words">{practising.format === "reverse" ? practising.prompt : savedAnswer(practising)}</p></div>
        </div>
        {practising.format === "exam" && practising.max_marks && <div className="space-y-2"><label className="block text-sm">Self-marked earned marks (optional)<input className="input mt-1 max-w-40" type="number" min="0" max={practising.max_marks} step="1" value={earnedMarks} disabled={busy || !!pendingRating} onChange={event => setEarnedMarks(event.target.value)} /></label><p className="text-xs text-muted-foreground">Marks are your own assessment against your saved answer. No automatic grading.</p></div>}
        <p className="text-sm text-muted-foreground">How did you recall it? Your rating sets the next review; it isn’t an exam grade.</p>
        <div className="flex flex-wrap gap-2">{[["again", "Again · revisit"], ["hard", "Hard · uncertain"], ["good", "Good · recalled"]].map(([value, label]) => <button key={value} className={`btn ${value === "good" ? "btn-primary" : "btn-outline"}`} disabled={busy || !!pendingRating} onClick={() => rate(value)}>{label}</button>)}</div>
      </>}
    </article> : !loadError && (items.length ? <ul className="divide-y divide-border">{items.map(item => <li key={item.question_id} className="flex gap-2 items-start py-3">
      <button className="flex-1 min-w-0 min-h-11 text-left rounded-md hover:bg-accent/40 px-2 py-2 -ml-2 focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Practise: ${visiblePrompt(item)}`} onClick={() => practise(item)}><span className="block font-medium whitespace-pre-wrap break-words">{visiblePrompt(item)}</span><span className="block text-xs text-muted-foreground mt-1">{item.kind === "mistake" ? "Mistake · " : ""}{item.format && item.format !== "basic" ? `${item.format} · ` : ""}{new Date(item.next_review_at) <= new Date() ? "Ready to practise" : `Next review ${new Date(item.next_review_at).toLocaleDateString()}`}{item.attempts ? ` · ${item.attempts} attempts` : ""}</span></button>
      {notebook && <details className="relative shrink-0"><summary className="btn btn-ghost cursor-pointer text-sm" aria-label={`Options for ${visiblePrompt(item)}`}>Options</summary><div className="absolute z-20 top-full right-0 w-40 rounded-lg border border-border bg-popover p-1 shadow-md"><button className="btn btn-ghost w-full justify-start" onClick={event => { event.currentTarget.closest("details").open = false; openForm(item); }}><Pencil className="h-4 w-4" />Edit</button><button className="btn btn-ghost w-full justify-start" onClick={event => { event.currentTarget.closest("details").open = false; setError(""); setDeleting(item); }}><Trash2 className="h-4 w-4" />Remove</button></div></details>}
    </li>)}</ul> : <div className="py-5 text-center text-muted-foreground space-y-2"><BookOpen className="h-5 w-5 mx-auto" /><p className="text-sm">{due ? "Nothing due right now." : !notebook ? "No questions or mistakes saved for this lesson yet." : kind === "mistake" ? "Save a tricky question to try it again later." : "Add your first question to turn these notes into practice."}</p></div>)}
    {message && <p role="status" className="text-sm text-primary flex gap-2 items-center"><Check className="h-4 w-4 shrink-0" />{message}</p>}
    {error && !form && !deleting && <p role="alert" className="text-sm text-destructive">{error}{pendingRating && <button className="btn btn-outline text-sm ml-2" disabled={busy} onClick={() => rate(null, true)}>Retry review</button>}</p>}

    <Dialog open={!!form} onOpenChange={open => { if (!open && !busy) { setForm(null); setEditing(null); setError(""); } }}>
      <DialogContent onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onPointerDownOutside={event => { if (busy) event.preventDefault(); }}>
        <DialogHeader><DialogTitle>{editing ? "Edit practice" : form?.kind === "mistake" ? "Save a mistake" : "Make a question"}</DialogTitle><DialogDescription>Link this practice to your notebook. Keep it short enough to try from memory.</DialogDescription></DialogHeader>
        {form && <form onSubmit={saveQuestion} className="space-y-4">
          <label className="block text-sm">Format<select className="input mt-1" value={form.format} disabled={busy} onChange={event => setForm(previous => ({ ...previous, format: event.target.value }))}><option value="basic">Basic recall</option><option value="cloze">Cloze · hidden words</option><option value="reverse">Reverse recall</option><option value="exam">Timed exam practice</option></select></label>
          {form.format === "cloze" && <p className="text-xs text-muted-foreground">Wrap hidden words in double braces, for example: Water is {"{{H2O}}"}.</p>}
          {form.format === "reverse" && <p className="text-xs text-muted-foreground">{form.kind === "mistake" ? "Your corrected method becomes the prompt." : "Your saved answer becomes the prompt."} Reveal shows the original question.</p>}
          <label className="block text-sm">Question<textarea className="input mt-1 min-h-20" required maxLength={10000} value={form.prompt} disabled={busy} onChange={event => setForm(previous => ({ ...previous, prompt: event.target.value }))} /></label>
          {form.kind === "mistake" ? <><label className="block text-sm">What went wrong?<textarea className="input mt-1" maxLength={10000} value={form.mistake} disabled={busy} onChange={event => setForm(previous => ({ ...previous, mistake: event.target.value }))} /></label><label className="block text-sm">Corrected method<textarea className="input mt-1 min-h-24" required maxLength={10000} value={form.correction} disabled={busy} onChange={event => setForm(previous => ({ ...previous, correction: event.target.value }))} /></label></> : <label className="block text-sm">Answer<textarea className="input mt-1 min-h-24" required maxLength={10000} value={form.answer} disabled={busy} onChange={event => setForm(previous => ({ ...previous, answer: event.target.value }))} /></label>}
          {form.format === "exam" && <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm">Time limit (seconds)<input className="input mt-1" type="number" required min="30" max="7200" step="1" value={form.time_limit_seconds} disabled={busy} onChange={event => setForm(previous => ({ ...previous, time_limit_seconds: event.target.value }))} /></label><label className="block text-sm">Maximum marks (optional)<input className="input mt-1" type="number" min="1" max="1000" step="1" value={form.max_marks} disabled={busy} onChange={event => setForm(previous => ({ ...previous, max_marks: event.target.value }))} /></label></div>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {editConflict && <div className="rounded-lg border border-border p-3 text-sm space-y-3"><p>Your text is still here. Keep it as separate practice, or use the version saved on the server.</p><div className="flex flex-wrap gap-2"><button type="button" className="btn btn-outline" disabled={busy} onClick={event => saveQuestion(event, true)}>Save as a new question</button>{editConflict.current && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => { const current = editConflict.current; setEditing(current); setForm(itemDraft(current)); setEditConflict(null); setError(""); }}>Use saved version</button>}</div></div>}
          <div className="flex flex-wrap justify-end gap-2"><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => { setForm(null); setError(""); }}>Cancel</button><button className="btn btn-primary" disabled={busy || !!editConflict}>{busy ? "Saving…" : form.kind === "mistake" ? "Save mistake" : "Save question"}</button></div>
        </form>}
      </DialogContent>
    </Dialog>
    <Dialog open={!!deleting} onOpenChange={open => { if (!open && !busy) { setDeleting(null); setError(""); } }}>
      <DialogContent><DialogHeader><DialogTitle>Remove this practice?</DialogTitle><DialogDescription>The question will leave your practice queue. Earlier practice results will remain in Progress.</DialogDescription></DialogHeader>{error && <p role="alert" className="text-destructive text-sm">{error}</p>}<div className="flex justify-end gap-2"><button className="btn btn-ghost" disabled={busy} onClick={() => setDeleting(null)}>Keep it</button><button className="btn btn-outline" disabled={busy} onClick={remove}>Remove practice</button></div></DialogContent>
    </Dialog>
  </section>;
}
