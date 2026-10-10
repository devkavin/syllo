import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Play, Pause, Timer, Check, Settings2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatError } from "@/lib/api";
import { formatTimer, formatSeconds } from "@/lib/palette";
import { useSharedFocusTimer } from "@/hooks/useSharedFocusTimer";
import { useSubjectsQuery } from "@/hooks/useAcademicQueries";

export default function NotebookFocus({ notebook, beforeStart }) {
  const userId = useAuth()?.user?.user_id;
  const shared = useSharedFocusTimer({ userId, enabled: !!userId });
  const { data: subjects = [], isPending: subjectsPending, isError: subjectsFailed, refetch: retrySubjects } = useSubjectsQuery();
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const timer = shared.snapshot?.timer;
  const subject = subjects.find(item => item.subject_id === notebook.subject_id);
  const minutes = subject?.focus_minutes || 25;
  const disabled = shared.busy || preparing || shared.loading || !shared.snapshot;
  const presetPending = !!notebook.subject_id && subjectsPending;
  const presetFailed = !!notebook.subject_id && subjectsFailed;
  let earlierSession = false;
  try {
    const saved = JSON.parse(localStorage.getItem("syllo.timer.v1"));
    earlierSession = !!saved && (!saved.ownerId || saved.ownerId === userId) && !saved.synced &&
      ["pomodoro", "short", "long", "stopwatch"].includes(saved.mode) && Number.isInteger(saved.seconds) && saved.seconds >= 0 && !!(saved.startedAt || saved.pendingRecording);
  } catch { /* Storage can be unavailable; the server timer remains authoritative. */ }
  const startDisabled = disabled || presetPending || presetFailed || earlierSession;
  const different = timer && (timer.lesson_id !== (notebook.lesson_id || null) || timer.subject_id !== (notebook.subject_id || null));
  const href = notebook.lesson_id ? `/timer?lesson=${encodeURIComponent(notebook.lesson_id)}` : notebook.subject_id ? `/timer?subject=${encodeURIComponent(notebook.subject_id)}` : "/timer";

  async function change(action) {
    if (disabled || (action === "start" && startDisabled)) return;
    setPreparing(true); setError(""); setMessage("");
    try {
      if (action === "start") {
        if (beforeStart && !(await beforeStart())) { setError("Save your notebook or recover its draft before starting focus."); return; }
        await shared.act("start", { mode: "pomodoro", duration_seconds: minutes * 60, subject_id: notebook.subject_id || null, lesson_id: notebook.lesson_id || null });
      } else {
        const result = await shared.act(action);
        if (action === "finish") setMessage(result.last_session ? `${formatSeconds(result.finished_duration_seconds ?? result.last_session.duration_seconds)} logged.` : "Break finished.");
      }
    } catch (failure) { setError(formatError(failure)); }
    finally { setPreparing(false); }
  }

  return <section aria-label="Notebook focus" className="rounded-lg border border-border bg-background/70 px-3 py-2 mb-5">
    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
      <Timer className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 text-sm">
        {timer ? <><span className="font-mono tabular-nums font-semibold">{formatTimer(shared.displaySeconds)}</span><span className="text-muted-foreground ml-2">{timer.status === "paused" ? "Paused" : timer.mode === "stopwatch" ? "Studying" : ["short", "long"].includes(timer.mode) ? "Break" : "Focus"}</span></> : <span className="text-muted-foreground">{presetPending ? "Loading focus preset…" : `Make room to study · ${minutes} min`}</span>}
      </div>
      <button className="btn btn-primary text-sm" disabled={timer ? disabled : startDisabled} onClick={() => change(!timer ? "start" : timer.status === "running" ? "pause" : "resume")} aria-label={!timer ? "Start focus" : timer.status === "running" ? "Pause focus" : "Resume focus"}>
        {timer?.status === "running" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}{!timer ? "Start focus" : timer.status === "running" ? "Pause" : "Resume"}
      </button>
      {timer && <button className="btn btn-ghost text-sm" disabled={disabled} onClick={() => change("finish")}><Check className="h-4 w-4" />{["short", "long"].includes(timer.mode) ? "End break" : "Finish session"}</button>}
      <Link className="btn btn-ghost btn-icon" to={href} aria-label="Open Focus settings" title="Open Focus settings"><Settings2 className="h-4 w-4" /></Link>
    </div>
    {different && <p className="text-xs text-muted-foreground mt-2">Active session: {timer.lesson_title || subjects.find(item => item.subject_id === timer.subject_id)?.name || "Personal study"}. Your notebook remains open.</p>}
    {!timer && earlierSession && <p className="text-xs text-muted-foreground mt-2">An earlier session is still saved on this device. <Link className="action-link" to="/timer">Recover earlier session</Link> before starting another.</p>}
    {!timer && presetFailed && <p role="alert" className="text-sm text-destructive mt-2">Your focus preset could not load. <button className="btn btn-ghost text-sm" onClick={retrySubjects}>Retry focus preset</button></p>}
    {(error || shared.error) && <p role="alert" className="text-sm text-destructive mt-2">{error || shared.error}{!shared.snapshot && <button className="btn btn-ghost text-sm ml-1" onClick={shared.refresh}>Retry timer sync</button>}</p>}
    {message && <p role="status" className="text-sm text-primary mt-2">{message}</p>}
  </section>;
}
