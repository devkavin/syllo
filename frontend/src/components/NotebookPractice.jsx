import React, { useEffect, useRef, useState } from "react";
import { Plus, ArrowLeft, Pencil, Trash2, BookOpen, Check } from "lucide-react";
import { http, formatError } from "@/lib/api";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const emptyDraft = kind => ({ kind, prompt: "", answer: "", mistake: "", correction: "" });

/** Manual recall and mistake practice. Ratings are self-assessments, never AI grades. */
export default function NotebookPractice({ notebook, getSelectedText, beforeStart, dueOnly = false }) {
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
  const [busy, setBusy] = useState(false);
  const [pendingRating, setPendingRating] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const liveScope = useRef(0);
  const mutation = useRef(false);
  const loadEpoch = useRef(0);
  const scope = notebook?.notebook_id || "all";

  useEffect(() => {
    ++liveScope.current;
    setForm(null); setEditing(null); setEditConflict(null); setPractising(null); setPendingRating(null);
    setError(""); setMessage(""); setDeleting(null); setBusy(false); mutation.current = false;
  }, [scope]);

  useEffect(() => {
    const epoch = ++loadEpoch.current;
    let live = true; setLoading(true); setLoadError(""); setPractising(null); setPendingRating(null);
    http.get("/study/questions", { params: { ...(notebook?.notebook_id ? { notebook_id: notebook.notebook_id, kind } : {}), ...(due ? { due: true } : {}) } })
      .then(({ data }) => { if (live && epoch === loadEpoch.current) setItems(data); })
      .catch(failure => { if (live && epoch === loadEpoch.current) { setItems([]); setLoadError(formatError(failure)); } })
      .finally(() => { if (live && epoch === loadEpoch.current) setLoading(false); });
    return () => { live = false; };
  }, [scope, kind, due, retry]);

  function openForm(item = null) {
    setError(""); setMessage(""); setEditing(item); setEditConflict(null);
    setForm(item ? { kind: item.kind, prompt: item.prompt, answer: item.answer || "", mistake: item.mistake || "", correction: item.correction || "" } : { ...emptyDraft(kind), prompt: getSelectedText?.()?.trim() || "" });
  }

  async function saveQuestion(event, asCopy = false) {
    event.preventDefault();
    if (mutation.current || (editConflict && !asCopy)) return;
    const lifetime = liveScope.current;
    mutation.current = true; setBusy(true); setError("");
    try {
      if (beforeStart && !(await beforeStart())) { setError("Save your notebook or recover its draft before adding practice."); return; }
      const body = { ...form, prompt: form.prompt.trim(), answer: form.answer.trim(), mistake: form.mistake.trim(), correction: form.correction.trim() };
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

  function practise(item) {
    setPractising(item); setRevealed(false); setResponse(""); setError(""); setMessage(""); setPendingRating(null);
  }

  async function rate(quality, repeat = false) {
    if (mutation.current || !revealed || !practising) return;
    const lifetime = liveScope.current;
    const request = repeat ? pendingRating : { questionId: practising.question_id, body: { quality, expected_revision: practising.revision, request_id: crypto.randomUUID() } };
    if (!request) return;
    mutation.current = true; setBusy(true); setError(""); setPendingRating(request);
    try {
      const { data } = await http.post(`/study/questions/${request.questionId}/attempt`, request.body);
      if (lifetime !== liveScope.current) return;
      setItems(previous => previous.flatMap(item => item.question_id !== data.question_id ? [item] : due && new Date(data.next_review_at) > new Date() ? [] : [data]));
      setPendingRating(null); setPractising(null); setMessage("Review saved. Your next practice is scheduled.");
    } catch (failure) {
      if (lifetime !== liveScope.current) return;
      if (failure.response?.status >= 400 && failure.response.status < 500) {
        // Definite rejections end this attempt. Transport and gateway failures
        // can hide a committed response, so keep the same request for replay.
        setPendingRating(null);
        if (failure.response.status === 409) { setPractising(null); setRetry(value => value + 1); }
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

  return <section aria-label={notebook ? "Notebook practice" : "Due practice"} className="space-y-4">
    {!practising && <>
      <div className="flex flex-wrap items-center gap-3">
        {notebook ? <div className="segmented-control" role="group" aria-label="Practice type">{[["question", "Questions"], ["mistake", "Mistakes"]].map(([value, label]) => <button key={value} className="segment" aria-pressed={kind === value} onClick={() => { setKind(value); setError(""); setMessage(""); }}>{label}</button>)}</div> : <h2 className="font-semibold text-lg">Practise what’s due</h2>}
        {notebook && <button className="btn btn-outline text-sm sm:ml-auto" onClick={() => openForm()}><Plus className="h-4 w-4" />{kind === "mistake" ? "Add mistake" : "Add question"}</button>}
      </div>
      <div className="flex flex-wrap gap-3 items-center text-sm text-muted-foreground">
        <p className="flex-1">{notebook ? kind === "mistake" ? "Keep the question, what went wrong, and the method to try next." : "Write a question, recall the answer, then check it. Selected note text becomes your question." : "Try answering before revealing your notes. Questions and mistakes appear here when due."}</p>
        {notebook && <label className="inline-flex items-center gap-2 shrink-0"><input type="checkbox" checked={due} onChange={event => setDue(event.target.checked)} />Due only</label>}
      </div>
    </>}
    {loadError && <p role="alert" className="notice">{loadError}<button className="btn btn-outline text-sm" onClick={() => setRetry(value => value + 1)}>Retry practice</button></p>}
    {loading ? <p role="status" className="text-sm text-muted-foreground">Loading practice…</p> : practising ? <article className="rounded-xl border border-border bg-background/60 p-4 sm:p-5 space-y-4">
      <button className="btn btn-ghost -ml-3 text-sm" disabled={busy || !!pendingRating} onClick={() => { setPractising(null); setError(""); }}><ArrowLeft className="h-4 w-4" />Back to questions</button>
      <div className="space-y-2"><p className="text-xs text-muted-foreground">{practising.kind === "mistake" ? "Try this again" : "Recall from memory"}</p><h3 className="font-serif text-xl whitespace-pre-wrap break-words">{practising.prompt}</h3></div>
      <label className="block text-sm">Your attempt <span className="text-muted-foreground">(optional)</span><textarea className="input mt-2 min-h-24" placeholder="Try answering without looking at your notes…" maxLength={10000} value={response} disabled={busy} onChange={event => setResponse(event.target.value)} /></label>
      {!revealed ? <button className="btn btn-primary" onClick={() => setRevealed(true)}>Reveal answer</button> : <>
        <div className="rounded-lg bg-accent/40 p-4 space-y-3">
          {practising.kind === "mistake" && practising.mistake && <div><p className="text-xs text-muted-foreground mb-1">What went wrong last time</p><p className="whitespace-pre-wrap break-words">{practising.mistake}</p></div>}
          <div><p className="text-xs font-medium text-primary mb-1">{practising.kind === "mistake" ? "Corrected method" : "Your saved answer"}</p><p className="whitespace-pre-wrap break-words">{practising.kind === "mistake" ? practising.correction : practising.answer}</p></div>
        </div>
        <p className="text-sm text-muted-foreground">How did you recall it? Your rating sets the next review; it isn’t an exam grade.</p>
        <div className="flex flex-wrap gap-2">{[["again", "Again · revisit"], ["hard", "Hard · uncertain"], ["good", "Good · recalled"]].map(([value, label]) => <button key={value} className={`btn ${value === "good" ? "btn-primary" : "btn-outline"}`} disabled={busy || !!pendingRating} onClick={() => rate(value)}>{label}</button>)}</div>
      </>}
    </article> : !loadError && (items.length ? <ul className="divide-y divide-border">{items.map(item => <li key={item.question_id} className="flex gap-2 items-start py-3">
      <button className="flex-1 min-w-0 text-left rounded-md hover:bg-accent/40 px-2 py-1 -ml-2 focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Practise: ${item.prompt}`} onClick={() => practise(item)}><span className="block font-medium whitespace-pre-wrap break-words">{item.prompt}</span><span className="block text-xs text-muted-foreground mt-1">{item.kind === "mistake" ? "Mistake · " : ""}{new Date(item.next_review_at) <= new Date() ? "Ready to practise" : `Next review ${new Date(item.next_review_at).toLocaleDateString()}`}{item.attempts ? ` · ${item.attempts} attempts` : ""}</span></button>
      {notebook && <details className="relative shrink-0"><summary className="btn btn-ghost cursor-pointer text-sm" aria-label={`Options for ${item.prompt}`}>Options</summary><div className="absolute z-20 top-full right-0 w-40 rounded-lg border border-border bg-popover p-1 shadow-md"><button className="btn btn-ghost w-full justify-start" onClick={event => { event.currentTarget.closest("details").open = false; openForm(item); }}><Pencil className="h-4 w-4" />Edit</button><button className="btn btn-ghost w-full justify-start" onClick={event => { event.currentTarget.closest("details").open = false; setError(""); setDeleting(item); }}><Trash2 className="h-4 w-4" />Remove</button></div></details>}
    </li>)}</ul> : <div className="py-5 text-center text-muted-foreground space-y-2"><BookOpen className="h-5 w-5 mx-auto" /><p className="text-sm">{due ? "Nothing due right now." : kind === "mistake" ? "Save a tricky question to try it again later." : "Add your first question to turn these notes into practice."}</p></div>)}
    {message && <p role="status" className="text-sm text-primary flex gap-2 items-center"><Check className="h-4 w-4 shrink-0" />{message}</p>}
    {error && !form && !deleting && <p role="alert" className="text-sm text-destructive">{error}{pendingRating && <button className="btn btn-outline text-sm ml-2" disabled={busy} onClick={() => rate(null, true)}>Retry review</button>}</p>}

    <Dialog open={!!form} onOpenChange={open => { if (!open && !busy) { setForm(null); setEditing(null); setError(""); } }}>
      <DialogContent onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onPointerDownOutside={event => { if (busy) event.preventDefault(); }}>
        <DialogHeader><DialogTitle>{editing ? "Edit practice" : form?.kind === "mistake" ? "Save a mistake" : "Make a question"}</DialogTitle><DialogDescription>Link this practice to your notebook. Keep it short enough to try from memory.</DialogDescription></DialogHeader>
        {form && <form onSubmit={saveQuestion} className="space-y-4">
          <label className="block text-sm">Question<textarea className="input mt-1 min-h-20" required maxLength={10000} value={form.prompt} disabled={busy} onChange={event => setForm(previous => ({ ...previous, prompt: event.target.value }))} /></label>
          {form.kind === "mistake" ? <><label className="block text-sm">What went wrong?<textarea className="input mt-1" maxLength={10000} value={form.mistake} disabled={busy} onChange={event => setForm(previous => ({ ...previous, mistake: event.target.value }))} /></label><label className="block text-sm">Corrected method<textarea className="input mt-1 min-h-24" required maxLength={10000} value={form.correction} disabled={busy} onChange={event => setForm(previous => ({ ...previous, correction: event.target.value }))} /></label></> : <label className="block text-sm">Answer<textarea className="input mt-1 min-h-24" required maxLength={10000} value={form.answer} disabled={busy} onChange={event => setForm(previous => ({ ...previous, answer: event.target.value }))} /></label>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {editConflict && <div className="rounded-lg border border-border p-3 text-sm space-y-3"><p>Your text is still here. Keep it as separate practice, or use the version saved on the server.</p><div className="flex flex-wrap gap-2"><button type="button" className="btn btn-outline" disabled={busy} onClick={event => saveQuestion(event, true)}>Save as a new question</button>{editConflict.current && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => { const current = editConflict.current; setEditing(current); setForm({ kind: current.kind, prompt: current.prompt, answer: current.answer || "", mistake: current.mistake || "", correction: current.correction || "" }); setEditConflict(null); setError(""); }}>Use saved version</button>}</div></div>}
          <div className="flex flex-wrap justify-end gap-2"><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => { setForm(null); setError(""); }}>Cancel</button><button className="btn btn-primary" disabled={busy || !!editConflict}>{busy ? "Saving…" : form.kind === "mistake" ? "Save mistake" : "Save question"}</button></div>
        </form>}
      </DialogContent>
    </Dialog>
    <Dialog open={!!deleting} onOpenChange={open => { if (!open && !busy) { setDeleting(null); setError(""); } }}>
      <DialogContent><DialogHeader><DialogTitle>Remove this practice?</DialogTitle><DialogDescription>The question will leave your practice queue. Earlier practice results will remain in Progress.</DialogDescription></DialogHeader>{error && <p role="alert" className="text-destructive text-sm">{error}</p>}<div className="flex justify-end gap-2"><button className="btn btn-ghost" disabled={busy} onClick={() => setDeleting(null)}>Keep it</button><button className="btn btn-outline" disabled={busy} onClick={remove}>Remove practice</button></div></DialogContent>
    </Dialog>
  </section>;
}
