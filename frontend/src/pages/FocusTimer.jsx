import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { http, formatError } from "@/lib/api";
import { formatTimer, formatSeconds, subjectClasses } from "@/lib/palette";
import { Play, Pause, RotateCcw, Save, Maximize2, Minimize2 } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { useSubjectsQuery } from "@/hooks/useAcademicQueries";
import { useSearchParams } from "react-router-dom";
import AcademicSelector from "@/components/AcademicSelector";
import SessionComplete from "@/components/SessionComplete";
import { useAuth } from "@/lib/auth";

const MODES = {
  pomodoro: { label: "Focus block", default: 25 * 60, presets: [25, 50, 90] },
  short: { label: "Short break", default: 5 * 60, presets: [5, 10, 15] },
  long: { label: "Long break", default: 15 * 60, presets: [15, 20, 30] },
  stopwatch: { label: "Stopwatch", default: 0 },
};
const STORAGE = "syllo.timer.v1";
const validMinutes = (value) => Number.isInteger(value) && value >= 1 && value <= 240;

function modeSeconds(mode, subject, customDurations = {}) {
  if (customDurations[mode]) return customDurations[mode] * 60;
  if (mode === "pomodoro" && subject?.focus_minutes) return subject.focus_minutes * 60;
  if (mode === "short" && subject?.break_minutes) return subject.break_minutes * 60;
  return MODES[mode].default;
}

function loadTimer(subjects) {
  const defaults = { mode: "pomodoro", subjectId: "", seconds: 1500, sessionSeconds: 1500,
    running: false, startedAt: null, customDurations: {} };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE));
    if (!saved || !Object.hasOwn(MODES, saved.mode) || !Number.isInteger(saved.seconds) || saved.seconds < 0) return defaults;
    const customDurations = Object.fromEntries(Object.entries(saved.customDurations || {})
      .filter(([mode, value]) => mode !== "stopwatch" && Object.hasOwn(MODES, mode) && validMinutes(value)));
    const subjectId = typeof saved.subjectId === "string" ? saved.subjectId : "";
    const preset = modeSeconds(saved.mode, subjects.find((s) => s.subject_id === subjectId), customDurations);
    const needsBaseline = saved.mode !== "stopwatch" && saved.sessionSeconds == null && !!subjectId;
    const sessionSeconds = saved.mode === "stopwatch" ? 0 :
      Number.isInteger(saved.sessionSeconds) && saved.sessionSeconds >= saved.seconds && saved.sessionSeconds >= 60 && saved.sessionSeconds <= 14400
        ? saved.sessionSeconds : preset;
    if (!needsBaseline && saved.mode !== "stopwatch" && saved.seconds > sessionSeconds) return defaults;
    return { mode: saved.mode, subjectId, seconds: saved.seconds, sessionSeconds, needsBaseline,
      unitId: saved.unitId || null, lessonId: saved.lessonId || null, lessonTitle: saved.lessonTitle || "", pendingRecording: saved.pendingRecording || null,
      eventId: saved.eventId || null, eventTopic: saved.eventTopic || "",
      customDurations, running: saved.running === true && (saved.mode === "stopwatch" || saved.seconds > 0),
      startedAt: typeof saved.startedAt === "string" ? saved.startedAt : null };
  } catch { return defaults; }
}

export default function FocusTimer() {
  const auth = useAuth();
  const [params, setParams] = useSearchParams();
  const { data: subjects = [], isPending: subjectsPending, isError: subjectsFailed, refetch: retrySubjects } = useSubjectsQuery();
  const [initial] = useState(() => loadTimer(subjects));
  const [baselinePending, setBaselinePending] = useState(!!initial.needsBaseline);
  const [mode, setMode] = useState(initial.mode);
  const [subjectId, setSubjectId] = useState(initial.subjectId);
  const [unitId, setUnitId] = useState(initial.unitId || null);
  const [lessonId, setLessonId] = useState(initial.lessonId || null);
  const [lessonTitle, setLessonTitle] = useState(initial.lessonTitle || "");
  const [eventId, setEventId] = useState(initial.eventId || null);
  const [eventTopic, setEventTopic] = useState(initial.eventTopic || "");
  const [eventLoading, setEventLoading] = useState(!!params.get("event") && !initial.startedAt && !initial.pendingRecording);
  const [lessonLoading, setLessonLoading] = useState(!!params.get("lesson") && !initial.running && !initial.startedAt && !initial.pendingRecording);
  const [pendingRecording, setPendingRecording] = useState(initial.pendingRecording);
  const recordingRef = useRef(initial.pendingRecording);
  const [completed, setCompleted] = useState(null);
  const [seconds, setSeconds] = useState(initial.seconds);
  const [sessionSeconds, setSessionSeconds] = useState(initial.sessionSeconds);
  const [customDurations, setCustomDurations] = useState(initial.customDurations);
  const [running, setRunning] = useState(initial.running);
  const [startedAt, setStartedAt] = useState(initial.startedAt);
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const [fallbackFullscreen, setFallbackFullscreen] = useState(false);
  const fullscreen = nativeFullscreen || fallbackFullscreen;
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [timeError, setTimeError] = useState("");
  const [minutes, setMinutes] = useState(String(initial.sessionSeconds / 60));
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const containerRef = useRef(null);
  const fallbackRef = useRef(null);
  const fullscreenButton = useRef(null);
  const wasFullscreen = useRef(false);
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const activeSubject = subjects.find((s) => s.subject_id === subjectId);
  const locked = running || !!startedAt || saving || baselinePending || eventLoading || lessonLoading || !!pendingRecording;

  useEffect(() => {
    const id = params.get("event");
    if (running || startedAt || pendingRecording) return;
    if (!id) { setEventId(null); setEventTopic(""); setEventLoading(false); return; }
    let live = true; setEventLoading(true);
    http.get(`/circle-sessions/${encodeURIComponent(id)}`).then(({ data }) => {
      if (!live) return;
      if (data.my_status !== "accepted" || data.canceled) { setEventId(null); setEventTopic(""); setErr("Confirm the current session in Circles first, or study on your own."); }
      else { setEventId(data.id); setEventTopic(data.topic); }
    }).catch(e => { if (live) { setEventId(null); setErr(`Could not open this Circle session. You can still focus on your own. ${formatError(e)}`); } }).finally(() => { if (live) setEventLoading(false); });
    return () => { live = false; };
  }, [params]);

  useEffect(() => {
    const id = params.get("lesson");
    if (!id || running || startedAt || pendingRecording) return;
    let live = true;
    setLessonLoading(true);
    http.get(`/lessons/${encodeURIComponent(id)}`).then(({ data }) => { if (live) { setSubjectId(data.subject_id); setUnitId(data.unit_id); setLessonId(data.lesson_id); setLessonTitle(data.title); } }).catch(e => { if (live) setErr(`Could not open the lesson. You can still focus without it. ${formatError(e)}`); }).finally(() => { if (live) setLessonLoading(false); });
    return () => { live = false; };
  }, [params]);

  // Older saved sessions used subject presets without storing a starting duration.
  useEffect(() => {
    if (!baselinePending || subjectsPending || subjectsFailed) return;
    const duration = Math.max(seconds, modeSeconds(mode, activeSubject, customDurations));
    setSessionSeconds(duration);
    setMinutes(String(duration / 60));
    setBaselinePending(false);
  }, [baselinePending, subjectsPending, subjectsFailed, seconds, mode, activeSubject, customDurations]);

  useEffect(() => {
    if (baselinePending) return;
    try {
      localStorage.setItem(STORAGE, JSON.stringify({ mode, subjectId, unitId, lessonId, lessonTitle, eventId, eventTopic, pendingRecording, seconds, sessionSeconds, customDurations, startedAt, running }));
    } catch {}
  }, [mode, subjectId, unitId, lessonId, lessonTitle, eventId, eventTopic, pendingRecording, seconds, sessionSeconds, customDurations, startedAt, running, baselinePending]);

  useEffect(() => {
    if (!running || baselinePending) return;
    const tick = setInterval(() => setSeconds((s) => mode === "stopwatch" ? s + 1 : Math.max(0, s - 1)), 1000);
    return () => clearInterval(tick);
  }, [running, mode, baselinePending]);

  // Log outside the state updater so StrictMode cannot submit a session twice.
  useEffect(() => {
    if (!baselinePending && running && mode !== "stopwatch" && seconds === 0) {
      setRunning(false);
      void tryLogSession(true);
    }
  }, [seconds, running, mode, baselinePending]);

  useEffect(() => {
    const syncFullscreen = () => setNativeFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", syncFullscreen);
    const container = containerRef.current;
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreen);
      if (document.fullscreenElement === container && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    if (wasFullscreen.current && !fullscreen) fullscreenButton.current?.focus();
    wasFullscreen.current = fullscreen;
    if (!fullscreen) return;
    fullscreenButton.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const background = fallbackFullscreen ? [...document.body.children]
      .filter((element) => element !== fallbackRef.current)
      .map((element) => ({ element, inert: element.getAttribute("inert") })) : [];
    background.forEach(({ element }) => element.setAttribute("inert", ""));
    const onKey = (event) => {
      if (event.key === "Tab" && fallbackFullscreen) {
        const controls = [...fallbackRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]')];
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || !fallbackRef.current.contains(document.activeElement))) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !fallbackRef.current.contains(document.activeElement))) {
          event.preventDefault(); first?.focus();
        }
      }
      if (event.key === "Escape") {
        if (document.fullscreenElement === containerRef.current) {
          document.exitFullscreen?.().catch(() => setErr("Could not exit fullscreen. Try the browser's fullscreen control."));
        } else setFallbackFullscreen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      background.forEach(({ element, inert }) => inert === null ? element.removeAttribute("inert") : element.setAttribute("inert", inert));
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [fullscreen, fallbackFullscreen]);

  const toggleFullscreen = async () => {
    if (fallbackFullscreen) { setFallbackFullscreen(false); return; }
    if (document.fullscreenElement === containerRef.current) {
      try { await document.exitFullscreen(); }
      catch { setErr("Could not exit fullscreen. Try the browser's fullscreen control."); }
      return;
    }
    if (containerRef.current?.requestFullscreen) {
      try {
        await containerRef.current.requestFullscreen();
        setNativeFullscreen(document.fullscreenElement === containerRef.current);
        return;
      } catch {}
    }
    setFallbackFullscreen(true);
  };

  const prepareTimer = (duration) => {
    recordingRef.current = null;
    setPendingRecording(null);
    setRunning(false);
    setStartedAt(null);
    setSeconds(duration);
    setSessionSeconds(duration);
    setMinutes(String(duration / 60));
    setTimeError("");
    setErr("");
  };
  const reset = () => {
    prepareTimer(modeSeconds(mode, activeSubject, customDurations));
    setEventId(null); setEventTopic("");
    if (params.has("event")) setParams(previous => { const next = new URLSearchParams(previous); next.delete("event"); return next; }, { replace: true });
  };
  const changeMode = (nextMode) => {
    setMode(nextMode);
    prepareTimer(modeSeconds(nextMode, activeSubject, customDurations));
  };
  const onPickSubject = (sid) => {
    setSubjectId(sid);
    setUnitId(null); setLessonId(null); setLessonTitle("");
    prepareTimer(modeSeconds(mode, subjects.find((s) => s.subject_id === sid), customDurations));
  };
  const applyMinutes = (value) => {
    if (locked) return;
    const duration = Number(value);
    if (!validMinutes(duration)) {
      setTimeError("Enter a whole number between 1 and 240 minutes.");
      return;
    }
    setCustomDurations((previous) => ({ ...previous, [mode]: duration }));
    prepareTimer(duration * 60);
  };
  const usePreset = () => {
    const next = { ...customDurations };
    delete next[mode];
    setCustomDurations(next);
    prepareTimer(modeSeconds(mode, activeSubject, next));
  };
  const start = () => {
    if (pendingRecording || saving || baselinePending || eventLoading || lessonLoading || (mode !== "stopwatch" && seconds === 0)) return;
    if (!startedAt) setStartedAt(new Date().toISOString());
    setRunning(true);
    setMsg("");
    setErr("");
  };
  const tryLogSession = async (auto = false) => {
    if (savingRef.current || baselinePending) return;
    if (["short", "long"].includes(mode)) { reset(); setMsg("Break finished. Breaks don't count toward study time."); return; }
    const duration = mode === "stopwatch" ? seconds : sessionSeconds - seconds;
    if (duration < 10) {
      if (!auto) setMsg("A session needs at least 10 seconds.");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setRunning(false);
    setErr("");
    try {
      const body = recordingRef.current || { request_id: crypto.randomUUID(), circle_event_id: eventId, subject_id: subjectId || null, lesson_id: lessonId || null, duration_seconds: duration, mode: ["short", "long"].includes(mode) ? "pomodoro" : mode, started_at: startedAt || new Date().toISOString(), note: "" };
      recordingRef.current = body; setPendingRecording(body);
      const { data } = await http.post("/sessions", body);
      setCompleted({ ...body, ...data });
      reset();
      setMsg(`Saved. ${formatSeconds(duration)} logged.`);
    } catch (e) { setErr(formatError(e)); }
    finally { savingRef.current = false; setSaving(false); }
  };

  const dot = activeSubject ? subjectClasses(activeSubject.color, isDark).dot : "hsl(var(--muted-foreground))";
  const subjectPreset = activeSubject && (mode === "pomodoro" || mode === "short");
  const view = (
    <div className="max-w-2xl w-full mx-auto text-center space-y-6" data-testid="focus-timer-page">
      <div>
          <h1 className="font-serif text-3xl tracking-tight">Focus</h1>
          {eventTopic && <div className="mt-2"><p className="font-medium">{eventTopic}</p><button className="btn btn-ghost text-sm" disabled={locked} onClick={reset}>Study on my own</button></div>}
          {eventLoading && <p role="status">Checking your Circle session…</p>}
          {lessonLoading && <p role="status">Opening your lesson…</p>}
        <p className="text-muted-foreground mt-1">A calm block of time. That's all it needs to be.</p>
        {lessonTitle && <p className="font-medium mt-2">{lessonTitle}</p>}
      </div>
      <div className="flex justify-center flex-wrap gap-1 p-1 rounded-lg bg-accent w-fit mx-auto">
        {Object.entries(MODES).map(([id, m]) => (
          <button key={id} onClick={() => changeMode(id)} disabled={locked} aria-pressed={mode === id}
            data-testid={`mode-${id}`}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${mode === id ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
            {m.label}
          </button>
        ))}
      </div>
      {mode !== "stopwatch" && (
        <div className="max-w-sm mx-auto rounded-xl border border-border bg-card p-4 space-y-3 text-left">
          <form noValidate onSubmit={(event) => { event.preventDefault(); applyMinutes(minutes); }}>
            <label htmlFor="timer-minutes" className="text-sm font-medium">Duration (minutes)</label>
            <div className="flex gap-2 mt-2">
              <input id="timer-minutes" type="number" min="1" max="240" step="1" inputMode="numeric"
                className="input min-w-0 flex-1" value={minutes} disabled={locked}
                onChange={(event) => { setMinutes(event.target.value); setTimeError(""); }}
                aria-invalid={!!timeError} aria-describedby={timeError ? "timer-time-error" : "timer-time-hint"} />
              <button className="btn btn-outline shrink-0" type="submit" disabled={locked}>Apply time</button>
            </div>
          </form>
          <div className="flex flex-wrap gap-2" aria-label="Quick durations">
            {MODES[mode].presets.map((value) => (
              <button key={value} className="btn btn-ghost !px-3 !py-1 text-xs" disabled={locked}
                aria-pressed={sessionSeconds === value * 60} onClick={() => applyMinutes(value)}>{value} min</button>
            ))}
          </div>
          <p id="timer-time-hint" className="text-xs text-muted-foreground">
            {baselinePending ? (subjectsFailed ? "Could not load your saved subject preset. Retry to restore your session." : "Loading your saved subject preset…") :
              running ? "Pause to change the duration. Applying a time starts a fresh block." :
              customDurations[mode] ? "Your custom time is remembered for this mode. Applying a time starts a fresh block." :
              subjectPreset ? `Using ${activeSubject.name}'s preset. Choose a time for this mode above.` :
              "Choose 1–240 minutes. Your custom time is remembered for this mode."}
          </p>
          {baselinePending && subjectsFailed && <button className="btn btn-outline" onClick={() => retrySubjects?.()}>Retry subject preset</button>}
          {customDurations[mode] && <button className="text-xs text-primary underline underline-offset-4" disabled={locked}
            onClick={usePreset}>{subjectPreset ? "Use subject preset" : "Use default time"}</button>}
          {timeError && <p id="timer-time-error" role="alert" className="text-xs text-destructive">{timeError}</p>}
        </div>
      )}
      <div className="mx-auto w-56 h-56 sm:w-64 sm:h-64 rounded-full grid place-items-center border border-border relative">
        <div className="font-mono text-5xl sm:text-6xl tabular-nums font-semibold tracking-wider" data-testid="timer-display">
          {formatTimer(seconds)}
        </div>
        <span className="absolute bottom-6 subject-dot !w-2 !h-2" style={{ background: dot }} />
      </div>
      <div className="flex justify-center flex-wrap gap-2">
        {!running ? (
          <button className="btn btn-primary !px-6" onClick={start} disabled={eventLoading || lessonLoading || !!pendingRecording || saving || baselinePending || (mode !== "stopwatch" && seconds === 0)}
            data-testid="timer-start"><Play className="w-4 h-4" /> {startedAt && seconds > 0 ? "Resume" : "Start"}</button>
        ) : (
          <button className="btn btn-outline !px-6" onClick={() => setRunning(false)} data-testid="timer-pause"><Pause className="w-4 h-4" /> Pause</button>
        )}
        <button className="btn btn-ghost" onClick={() => { if ((!pendingRecording && !startedAt) || window.confirm("Discard this unsaved session and start a new timer?")) reset(); }} disabled={saving || baselinePending} data-testid="timer-reset"><RotateCcw className="w-4 h-4" /> Reset</button>
        <button className="btn btn-outline" onClick={() => tryLogSession(false)} disabled={saving || baselinePending || eventLoading || lessonLoading} data-testid="timer-save">
          <Save className="w-4 h-4" /> {saving ? "Saving…" : pendingRecording ? "Retry save" : "Log session"}
        </button>
        <button ref={fullscreenButton} className="btn btn-ghost" onClick={toggleFullscreen} data-testid="timer-fullscreen" aria-pressed={fullscreen}>
          {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          {fullscreen ? "Exit fullscreen" : "Fullscreen"}
        </button>
      </div>
      {fullscreen && <p className="text-xs text-muted-foreground">Press Esc to exit fullscreen.</p>}
      <div className="max-w-xs mx-auto">
        <label htmlFor="timer-subject" className="text-xs text-muted-foreground">Working on</label>
        <select id="timer-subject" className="input mt-1" value={subjectId} disabled={locked}
          onChange={(e) => onPickSubject(e.target.value)} data-testid="timer-subject-select">
          <option value="">No subject</option>
          {subjects.map((s) => <option key={s.subject_id} value={s.subject_id}>{s.name}</option>)}
        </select>
      </div>
      {subjectId && <AcademicSelector hideSubject subjects={subjects} value={{ subject_id: subjectId, unit_id: unitId, lesson_id: lessonId }} disabled={locked} onChange={v => { setUnitId(v.unit_id); setLessonId(v.lesson_id); setLessonTitle(""); }} />}
      {msg && <div role="status" className="text-sm text-primary" data-testid="timer-message">{msg}</div>}
      {err && <div role="alert" className="text-destructive text-sm">{err}</div>}
    </div>
  );
  const fullscreenClass = "fixed inset-0 z-[100] bg-background overflow-y-auto overscroll-contain p-4 sm:p-6";
  return (
    <>
      {completed && <SessionComplete key={completed.session_id} timezone={auth?.user?.timezone} session={completed} lessonTitle={lessonTitle} onFinish={() => setCompleted(null)} />}
      <div ref={containerRef} className={nativeFullscreen ? fullscreenClass : undefined}
        data-testid={nativeFullscreen ? "fullscreen-timer" : undefined}>
        {!fallbackFullscreen && (nativeFullscreen ? <div className="min-h-full flex items-center py-4">{view}</div> : view)}
      </div>
      {fallbackFullscreen && createPortal(
        <div ref={fallbackRef} className={fullscreenClass} data-testid="fullscreen-timer" role="dialog" aria-modal="true" aria-label="Focus timer">
          <div className="min-h-full flex items-center py-4">{view}</div>
        </div>, document.body)}
    </>
  );
}
