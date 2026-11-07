import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { http, formatError } from "@/lib/api";
import { ArrowRight, Check } from "lucide-react";
import AppIcon from "@/components/AppIcon";
import StudyGuidance from "@/components/StudyGuidance";

const emptyDraft = () => ({ version: 1, step: "note", title: "", content: "", prompt: "", answer: "", notebookId: null, questionId: null });
const draftKey = owner => owner ? `syllo.first-session.${encodeURIComponent(owner)}` : null;
function readDraft(key) {
  const initial = emptyDraft();
  try {
    const saved = key && JSON.parse(localStorage.getItem(key));
    if (!saved || saved.version !== 1) return initial;
    for (const [field, limit] of [["title", 240], ["content", 20000], ["prompt", 20000], ["answer", 50000]]) {
      if (typeof saved[field] === "string") initial[field] = saved[field].slice(0, limit);
    }
    for (const field of ["notebookId", "questionId"]) if (typeof saved[field] === "string" && saved[field].length <= 128 && saved[field].length) initial[field] = saved[field];
    if (initial.notebookId) initial.step = saved.step === "ready" ? "ready" : "question";
    return initial;
  } catch { return initial; }
}
function storeDraft(key, draft) {
  try { if (!key) return false; localStorage.setItem(key, JSON.stringify(draft)); return true; }
  catch { return false; }
}

export default function Onboarding() {
  const auth = useAuth();
  return <FirstSession key={auth.user?.user_id || "unavailable"} auth={auth} />;
}

function FirstSession({ auth }) {
  const nav = useNavigate();
  const owner = auth.user?.user_id;
  const key = draftKey(owner);
  const [draft, setDraft] = useState(() => readDraft(key));
  const [busy, setBusy] = useState(null), [error, setError] = useState("");
  const [draftStored, setDraftStored] = useState(true);
  const mutation = useRef(false), active = useRef(true);
  const heading = useRef(null), previousStep = useRef(draft.step);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => { setDraftStored(storeDraft(key, draft)); }, [key, draft]);
  useEffect(() => {
    if (previousStep.current !== draft.step) heading.current?.focus();
    previousStep.current = draft.step;
  }, [draft.step]);
  const progress = next => {
    storeDraft(key, next);
    if (active.current) { setDraft(next); setError(""); }
  };
  const update = (field, value) => setDraft(current => ({ ...current, [field]: value }));
  async function perform(action, work) {
    if (mutation.current || !owner) return;
    mutation.current = true; setBusy(action); setError("");
    try { await work(); }
    catch (failure) { if (active.current) setError(formatError(failure)); }
    finally { mutation.current = false; if (active.current) setBusy(null); }
  }
  const saveNote = event => {
    event.preventDefault();
    if (!draft.title.trim() || !draft.content.trim() || draft.notebookId) return;
    void perform("note", async () => {
      const { data } = await http.post("/notebooks", { title: draft.title.trim(), content: draft.content.trim(), subject_id: null, lesson_id: null });
      if (!data?.notebook_id) throw new Error("The note could not be confirmed. Check your notebooks before trying again.");
      progress({ ...draft, notebookId: data.notebook_id, step: "question" });
    });
  };
  const saveQuestion = event => {
    event.preventDefault();
    if (!draft.prompt.trim() || !draft.notebookId || draft.questionId) return;
    void perform("question", async () => {
      const { data } = await http.post("/study/questions", { notebook_id: draft.notebookId, kind: "question", format: "basic", prompt: draft.prompt.trim(), answer: draft.answer.trim() });
      if (!data?.question_id) throw new Error("The question could not be confirmed. Check your practice before trying again.");
      progress({ ...draft, questionId: data.question_id, step: "ready", prompt: "", answer: "" });
    });
  };
  const finish = explore => void perform("finish", async () => {
    if (!auth.user.onboarded) await auth.updateMe({ onboarded: true });
    if (!active.current) return;
    if (!explore) { try { if (key) localStorage.removeItem(key); } catch { /* Saved server data is unaffected. */ } }
    nav(!explore && draft.notebookId ? `/notebooks?notebook=${encodeURIComponent(draft.notebookId)}` : "/today", { replace: true });
  });
  const stepIndex = ["note", "question", "ready"].indexOf(draft.step);

  return <main className="min-h-screen bg-background text-foreground px-4 py-8 sm:py-12">
    <div className="mx-auto w-full max-w-xl space-y-5" data-testid="onboarding-page">
      <AppIcon className="h-14 w-14 mx-auto" alt="Syllo" />
      <ol aria-label="Your first study session" className="flex gap-3 text-xs text-muted-foreground">
        {["Write a note", "Try recall", "Start studying"].map((label, index) => <li key={label} aria-current={stepIndex === index ? "step" : undefined} className={`flex-1 border-t-2 pt-3 ${index <= stepIndex ? "border-primary text-primary font-medium" : "border-border"}`}>{index + 1}. {label}</li>)}
      </ol>
      <div className="card p-5 sm:p-8 space-y-5">
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {!draftStored && draft.step === "note" && <p role="status" className="text-xs text-muted-foreground">This browser cannot keep a draft after closing. Keep this page open until your note is saved.</p>}
        {draft.step === "note" && <form onSubmit={saveNote} className="space-y-4">
          <div><h1 ref={heading} tabIndex={-1} className="page-title">Start with something you're learning</h1><p className="mt-3 text-sm text-muted-foreground">One note is enough to begin. No subject setup needed yet.</p></div>
          <div><label className="field-label" htmlFor="first-note-title">Note title</label><input id="first-note-title" className="input mt-1" placeholder="What are you working on?" maxLength={240} required disabled={!!busy} value={draft.title} onChange={event => update("title", event.target.value)} /></div>
          <div><label className="field-label" htmlFor="first-note-content">Your notes</label><textarea id="first-note-content" className="input mt-1 min-h-40 resize-y" placeholder="Write an idea, explanation or a few things to remember…" maxLength={20000} required disabled={!!busy} value={draft.content} onChange={event => update("content", event.target.value)} /></div>
          <button className="btn btn-primary w-full" disabled={!!busy || !owner || !draft.title.trim() || !draft.content.trim()}>{busy === "note" ? "Saving note…" : "Save my first note"}<ArrowRight className="w-4 h-4" /></button>
        </form>}
        {draft.step === "question" && <form onSubmit={saveQuestion} className="space-y-4">
          <div><h1 ref={heading} tabIndex={-1} className="page-title">Try recalling one thing</h1><p className="mt-3 text-sm text-muted-foreground">Turn a line from your note into a question. You can practise it later.</p></div>
          <div className="rounded-lg bg-accent/40 p-3 text-sm"><p className="font-medium flex items-center gap-2"><Check className="h-4 w-4" />{draft.title} · saved</p><p className="mt-2 whitespace-pre-wrap line-clamp-4 text-muted-foreground">{draft.content}</p></div>
          <div><label className="field-label" htmlFor="first-question">Question</label><textarea id="first-question" className="input mt-1 min-h-24" required maxLength={20000} disabled={!!busy} value={draft.prompt} onChange={event => update("prompt", event.target.value)} /></div>
          <div><label className="field-label" htmlFor="first-answer">Answer</label><textarea id="first-answer" className="input mt-1 min-h-24" maxLength={50000} disabled={!!busy} value={draft.answer} onChange={event => update("answer", event.target.value)} /></div>
          <button className="btn btn-primary w-full" disabled={!!busy || !draft.prompt.trim()}>{busy === "question" ? "Saving question…" : "Save recall question"}<ArrowRight className="w-4 h-4" /></button>
          <button type="button" className="btn btn-ghost w-full" disabled={!!busy} onClick={() => progress({ ...draft, step: "ready" })}>Do this later</button>
        </form>}
        {draft.step === "ready" && <div className="space-y-5">
          <h1 ref={heading} tabIndex={-1} className="page-title">You're ready to study</h1>
          <ul className="space-y-3 text-sm"><li className="flex gap-2"><Check className="h-4 w-4 text-primary" />First note saved</li>{draft.questionId && <li className="flex gap-2"><Check className="h-4 w-4 text-primary" />First recall question ready</li>}</ul>
          <button className="btn btn-primary w-full" disabled={!!busy || !owner} onClick={() => finish(false)}>{busy === "finish" ? "Opening your notebook…" : "Continue studying"}<ArrowRight className="h-4 w-4" /></button>
          <p className="text-sm text-muted-foreground">Add subjects or a timetable whenever you need them. Your notebook's Practice tab keeps your recall questions close.</p>
        </div>}
        {draft.step !== "ready" && <button type="button" className="btn btn-ghost w-full" disabled={!!busy || !owner} onClick={() => finish(true)}>Explore on my own</button>}
      </div>
      <StudyGuidance accountId={owner} context="first-session" defaultOpen firstSessionLink={false}>
        <p>{draft.step === "note" ? "Start with a short note in your own words. Saving puts it in your notebooks, ready to continue on your other devices." : draft.step === "question" ? "Write a question you can answer without looking at your notes. Add the answer for checking your recall, or save it later in Practice." : "Your note stays editable. Open Practice to try your question, or start a focus session while you study."}</p>
      </StudyGuidance>
    </div>
  </main>;
}
