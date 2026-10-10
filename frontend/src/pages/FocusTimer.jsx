import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { http, formatError } from "@/lib/api";
import { formatTimer, formatSeconds, subjectClasses } from "@/lib/palette";
import { Play, Pause, RotateCcw, Save, Maximize2, Minimize2, Settings2, ChevronDown } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { useSubjectsQuery } from "@/hooks/useAcademicQueries";
import { useSearchParams } from "react-router-dom";
import AcademicSelector from "@/components/AcademicSelector";
import SessionComplete from "@/components/SessionComplete";
import { useAuth } from "@/lib/auth";
import { useSharedFocusTimer } from "@/hooks/useSharedFocusTimer";

const MODES = {
  pomodoro: { label: "Focus block", default: 25 * 60, presets: [25, 50, 90] },
  short: { label: "Short break", default: 5 * 60, presets: [5, 10, 15] },
  long: { label: "Long break", default: 15 * 60, presets: [15, 20, 30] },
  stopwatch: { label: "Stopwatch", default: 0 },
};
const STORAGE = "syllo.timer.v1";
const validMinutes = (value) => Number.isInteger(value) && value >= 1 && value <= 240;

// Callbacks only refresh the display; the clock keeps time even while suspended.
function clockValue(mode, clock) {
  const elapsed = clock.startedAt === null ? 0 : Math.max(0, Date.now() - clock.startedAt) / 1000;
  return mode === "stopwatch" ? clock.seconds + elapsed : Math.max(0, clock.seconds - elapsed);
}

function clockDisplay(mode, value) {
  return mode === "stopwatch" ? Math.floor(value) : Math.ceil(value);
}

function modeSeconds(mode, subject, customDurations = {}) {
  if (customDurations[mode]) return customDurations[mode] * 60;
  if (mode === "pomodoro" && subject?.focus_minutes) return subject.focus_minutes * 60;
  if (mode === "short" && subject?.break_minutes) return subject.break_minutes * 60;
  return MODES[mode].default;
}

function loadTimer(subjects, userId) {
  const defaults = { mode: "pomodoro", subjectId: "", seconds: 1500, sessionSeconds: 1500,
    running: false, startedAt: null, customDurations: {} };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE));
    if (saved?.ownerId && saved.ownerId !== userId) return defaults;
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
    const running = !saved.synced && saved.running === true && (saved.mode === "stopwatch" || saved.seconds > 0);
    const hasClock = Number.isFinite(saved.clockSeconds) && saved.clockSeconds >= 0
      && (saved.mode === "stopwatch" || needsBaseline || saved.clockSeconds <= sessionSeconds);
    // Legacy snapshots have no pause-aware timestamp; preserve their known time.
    const clock = {
      seconds: saved.synced ? sessionSeconds : hasClock ? saved.clockSeconds : saved.seconds,
      startedAt: running ? (hasClock && Number.isFinite(saved.clockStartedAt) ? saved.clockStartedAt : Date.now()) : null,
    };
    return { mode: saved.mode, subjectId, seconds: clockDisplay(saved.mode, clockValue(saved.mode, clock)), clock, sessionSeconds, needsBaseline,
      unitId: saved.unitId || null, lessonId: saved.lessonId || null, lessonTitle: saved.lessonTitle || "", pendingRecording: saved.pendingRecording || null,
      eventId: saved.eventId || null, eventTopic: saved.eventTopic || "",
      customDurations, running,
      startedAt: !saved.synced && typeof saved.startedAt === "string" ? saved.startedAt : null,
      synced: saved.synced === true };
  } catch { return defaults; }
}

export default function FocusTimer() {
  const auth = useAuth();
  const userId = auth?.user?.user_id;
  const shared = useSharedFocusTimer({ userId, enabled: !!userId });
  const [params, setParams] = useSearchParams();
  const { data: subjects = [], isPending: subjectsPending, isError: subjectsFailed, refetch: retrySubjects } = useSubjectsQuery();
  const [initial] = useState(() => loadTimer(subjects, userId));
  const [legacyActive, setLegacyActive] = useState(!initial.synced && !!(initial.startedAt || initial.pendingRecording));
  const synced = !!userId && !legacyActive;
  const remoteTimer = synced ? shared.snapshot?.timer : null;
  const appliedRemote = useRef(null);
  const syncPending = synced && (shared.loading || !shared.snapshot);
  const clockRef = useRef(initial.clock || { seconds: initial.seconds, startedAt: null });
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
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  const settingsButton = useRef(null);
  const wasFullscreen = useRef(false);
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const activeSubject = subjects.find((s) => s.subject_id === subjectId);
  const [subjectLinkPending, setSubjectLinkPending] = useState(!!params.get("subject") && !params.get("lesson") && !params.get("event") && !initial.running && !initial.startedAt && !initial.pendingRecording);
  const appliedSubjectLink = useRef(null);
  const locked = running || !!startedAt || saving || baselinePending || eventLoading || lessonLoading || subjectLinkPending || !!pendingRecording || syncPending || shared.busy;

  useEffect(() => {
    if (!synced || !shared.snapshot) return;
    const timer = shared.snapshot.timer;
    if (timer) {
      appliedRemote.current = timer;
      setMode(timer.mode); setSubjectId(timer.subject_id || ""); setUnitId(timer.unit_id || null);
      setLessonId(timer.lesson_id || null); setLessonTitle(timer.lesson_title || "");
      setEventId(timer.circle_event_id || null); setEventTopic(timer.event_topic || "");
      setSessionSeconds(timer.duration_seconds); setMinutes(String(timer.duration_seconds / 60));
      setStartedAt(timer.started_at); setRunning(timer.status === "running");
      setBaselinePending(false); setEventLoading(false); setLessonLoading(false); setSubjectLinkPending(false);
      setPendingRecording(null); recordingRef.current = null;
    } else if (appliedRemote.current) {
      const previous = appliedRemote.current;
      appliedRemote.current = null;
      prepareTimer(modeSeconds(previous.mode, subjects.find(subject => subject.subject_id === previous.subject_id), customDurations));
      setEventId(null); setEventTopic("");
      if (params.has("event")) setParams(previousParams => { const next = new URLSearchParams(previousParams); next.delete("event"); return next; }, { replace: true });
      if (shared.snapshot.completed_timer_id === previous.timer_id && shared.snapshot.last_session) {
        const session = shared.snapshot.last_session;
        setCompleted({ ...session, duration_seconds: shared.snapshot.finished_duration_seconds ?? session.duration_seconds });
        setMsg(`Saved. ${formatSeconds(shared.snapshot.finished_duration_seconds ?? session.duration_seconds)} logged.`);
      } else if (["short", "long"].includes(previous.mode) && shared.snapshot.completed_timer_id === previous.timer_id) {
        setMsg("Break finished. Breaks don't count toward study time.");
      }
    }
  }, [synced, shared.snapshot]);

  useEffect(() => {
    if (remoteTimer) setSeconds(shared.displaySeconds);
  }, [remoteTimer, shared.displaySeconds]);

  useEffect(() => {
    const id = params.get("subject");
    if (syncPending || remoteTimer || !id || params.get("lesson") || params.get("event") || running || startedAt || pendingRecording || appliedSubjectLink.current === id) { setSubjectLinkPending(false); return; }
    if (subjectsPending || subjectsFailed) { setSubjectLinkPending(true); return; }
    appliedSubjectLink.current = id;
    const subject = subjects.find(s => s.subject_id === id);
    if (!subject) setErr("Could not open the subject. Choose another subject, or focus without one.");
    const duration = modeSeconds(mode, subject, customDurations);
    clockRef.current = { seconds: duration, startedAt: null };
    setSubjectId(subject ? id : ""); setUnitId(null); setLessonId(null); setLessonTitle("");
    setSeconds(duration); setSessionSeconds(duration); setMinutes(String(duration / 60));
    setSubjectLinkPending(false);
  }, [params, subjects, subjectsPending, subjectsFailed, running, startedAt, pendingRecording, mode, customDurations, syncPending, remoteTimer?.timer_id]);

  useEffect(() => {
    const id = params.get("event");
    if (syncPending || remoteTimer || running || startedAt || pendingRecording) return;
    if (!id) { setEventId(null); setEventTopic(""); setEventLoading(false); return; }
    let live = true; setEventLoading(true);
    http.get(`/circle-sessions/${encodeURIComponent(id)}`).then(({ data }) => {
      if (!live) return;
      if (data.my_status !== "accepted" || data.canceled) { setEventId(null); setEventTopic(""); setErr("Confirm the current session in Circles first, or study on your own."); }
      else { setEventId(data.id); setEventTopic(data.topic); }
    }).catch(e => { if (live) { setEventId(null); setErr(`Could not open this Circle session. You can still focus on your own. ${formatError(e)}`); } }).finally(() => { if (live) setEventLoading(false); });
    return () => { live = false; };
  }, [params, syncPending, remoteTimer?.timer_id]);

  useEffect(() => {
    const id = params.get("lesson");
    if (syncPending || remoteTimer || !id || running || startedAt || pendingRecording) return;
    let live = true;
    setLessonLoading(true);
    http.get(`/lessons/${encodeURIComponent(id)}`).then(({ data }) => { if (live) { setSubjectId(data.subject_id); setUnitId(data.unit_id); setLessonId(data.lesson_id); setLessonTitle(data.title); } }).catch(e => { if (live) setErr(`Could not open the lesson. You can still focus without it. ${formatError(e)}`); }).finally(() => { if (live) setLessonLoading(false); });
    return () => { live = false; };
  }, [params, syncPending, remoteTimer?.timer_id]);

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
      localStorage.setItem(STORAGE, JSON.stringify({ ownerId: userId, synced, mode, subjectId, unitId, lessonId, lessonTitle, eventId, eventTopic, pendingRecording, seconds, sessionSeconds, customDurations, startedAt, running,
        clockSeconds: clockRef.current.seconds, clockStartedAt: clockRef.current.startedAt }));
    } catch {}
  }, [mode, subjectId, unitId, lessonId, lessonTitle, eventId, eventTopic, pendingRecording, seconds, sessionSeconds, customDurations, startedAt, running, baselinePending, userId, synced, remoteTimer]);

  useEffect(() => {
    if (!running || baselinePending || synced) return;
    const sync = () => setSeconds(clockDisplay(mode, clockValue(mode, clockRef.current)));
    sync();
    const tick = setInterval(sync, 1000);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);
    window.addEventListener("pageshow", sync);
    return () => {
      clearInterval(tick);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener("pageshow", sync);
    };
  }, [running, mode, baselinePending, synced]);

  // Log outside the state updater so StrictMode cannot submit a session twice.
  useEffect(() => {
    if (!synced && !baselinePending && running && mode !== "stopwatch" && seconds === 0) {
      setRunning(false);
      void tryLogSession(true);
    }
  }, [seconds, running, mode, baselinePending, synced]);

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
        const controls = [...fallbackRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]')]
          .filter(element => !element.closest("[hidden]"));
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
    setLegacyActive(false);
    clockRef.current = { seconds: duration, startedAt: null };
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
  const reset = async () => {
    if (remoteTimer) {
      try { await shared.act("reset"); setErr(""); }
      catch (error) { setErr(formatError(error)); }
      return;
    }
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
  const start = async () => {
    if (running || pendingRecording || saving || shared.busy || syncPending || baselinePending || eventLoading || lessonLoading || subjectLinkPending || (mode !== "stopwatch" && seconds === 0)) return;
    if (synced) {
      try {
        await shared.act(remoteTimer ? "resume" : "start", remoteTimer ? {} : { mode, duration_seconds: sessionSeconds, subject_id: subjectId || null, unit_id: unitId || null, lesson_id: lessonId || null, circle_event_id: eventId || null });
        setSettingsOpen(false); setMsg(""); setErr("");
      } catch (error) { setErr(formatError(error)); }
      return;
    }
    if (!startedAt) setStartedAt(new Date().toISOString());
    clockRef.current.startedAt = Date.now();
    setRunning(true);
    setSettingsOpen(false);
    setMsg("");
    setErr("");
  };
  const pause = async () => {
    if (synced) {
      if (!remoteTimer) return;
      try { await shared.act("pause"); setErr(""); }
      catch (error) { setErr(formatError(error)); }
      return;
    }
    const value = clockValue(mode, clockRef.current);
    clockRef.current = { seconds: value, startedAt: null };
    setSeconds(clockDisplay(mode, value));
    setRunning(false);
  };
  const tryLogSession = async (auto = false) => {
    if (savingRef.current || baselinePending || shared.busy || syncPending) return;
    if (synced) {
      if (!remoteTimer) return;
      savingRef.current = true; setSaving(true);
      try { await shared.act("finish"); setErr(""); }
      catch (error) { setErr(formatError(error)); }
      finally { savingRef.current = false; setSaving(false); }
      return;
    }
    if (["short", "long"].includes(mode)) { reset(); setMsg("Break finished. Breaks don't count toward study time."); return; }
    const currentSeconds = clockDisplay(mode, clockValue(mode, clockRef.current));
    const duration = mode === "stopwatch" ? currentSeconds : sessionSeconds - currentSeconds;
    if (duration < 10) {
      if (!auto) setMsg("A session needs at least 10 seconds.");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    pause();
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
  const closeSettings = () => { setSettingsOpen(false); settingsButton.current?.focus(); };
  const progress = mode === "stopwatch" ? 0 : Math.min(1, Math.max(0, seconds / sessionSeconds));
  const view = (
    <div className="max-w-2xl w-full mx-auto space-y-5" data-testid="focus-timer-page">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Focus</h1>
          <p className="text-sm text-muted-foreground mt-1">One thing at a time.</p>
        </div>
        <button ref={fullscreenButton} className="btn btn-ghost btn-icon" onClick={toggleFullscreen}
          data-testid="timer-fullscreen" aria-pressed={fullscreen}
          aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"} title={fullscreen ? "Exit fullscreen" : "Fullscreen"}>
          {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </header>

      <section aria-label="Focus timer" className="card text-center px-4 py-6 sm:py-8 space-y-5">
        <div className="mx-auto w-60 max-w-full aspect-square sm:w-64 relative grid place-items-center">
          <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 288 288" aria-hidden="true">
            <circle cx="144" cy="144" r="136" fill="none" stroke="currentColor" strokeWidth="2" className="text-border" />
            {mode !== "stopwatch" && <circle cx="144" cy="144" r="136" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
              className="text-primary" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - progress} />}
          </svg>
          <div className="relative space-y-3">
            <p className="text-sm text-muted-foreground">{MODES[mode].label}</p>
            <div className="font-mono text-5xl sm:text-6xl tabular-nums font-semibold tracking-tight" data-testid="timer-display">
              {formatTimer(seconds)}
            </div>
            <p className="text-xs text-muted-foreground">{running ? (["short", "long"].includes(mode) ? "Rest and recharge" : "Stay with this moment") : startedAt ? "Paused" : "Ready when you are"}</p>
          </div>
        </div>

        <div className="space-y-1 min-h-6">
          <p className="text-sm font-medium inline-flex items-center justify-center gap-2 max-w-full">
            <span aria-hidden="true" className="subject-dot shrink-0" style={{ background: dot }} />
            <span className="break-words min-w-0">{activeSubject?.name || (["short", "long"].includes(mode) ? "Taking a break" : "Personal study")}</span>
          </p>
          {lessonTitle && <p className="text-sm text-muted-foreground break-words">{lessonTitle}</p>}
          {eventTopic && <p className="text-sm text-muted-foreground break-words">{eventTopic}</p>}
          {eventLoading && <p role="status" className="text-sm text-muted-foreground">Checking your Circle session…</p>}
          {lessonLoading && <p role="status" className="text-sm text-muted-foreground">Opening your lesson…</p>}
        </div>

        <div className="space-y-3">
          {!running ? (
            <button className="btn btn-primary min-w-40 min-h-12 px-8!" onClick={start}
              disabled={eventLoading || lessonLoading || subjectLinkPending || !!pendingRecording || saving || baselinePending || syncPending || shared.busy || (mode !== "stopwatch" && seconds === 0)}
              data-testid="timer-start"><Play className="w-4 h-4" /> {startedAt && seconds > 0 ? "Resume" : "Start"}</button>
          ) : (
            <button className="btn btn-primary min-w-40 min-h-12 px-8!" onClick={pause} disabled={shared.busy} data-testid="timer-pause"><Pause className="w-4 h-4" /> Pause</button>
          )}
          <div className="flex justify-center flex-wrap gap-1">
            <button className="btn btn-ghost text-muted-foreground" onClick={() => { if ((!pendingRecording && !startedAt) || window.confirm("Discard this unsaved session and start a new timer?")) reset(); }} disabled={saving || baselinePending || syncPending || shared.busy} data-testid="timer-reset"><RotateCcw className="w-4 h-4" /> Reset</button>
            <button hidden={!startedAt && !pendingRecording && !running} className="btn btn-ghost" onClick={() => tryLogSession(false)} disabled={saving || baselinePending || eventLoading || lessonLoading || subjectLinkPending || shared.busy || syncPending} data-testid="timer-save">
              <Save className="w-4 h-4" /> {saving ? "Saving…" : pendingRecording ? "Retry save" : ["short", "long"].includes(mode) ? "End break" : "Log session"}
            </button>
          </div>
        </div>
        {fullscreen && <p className="text-xs text-muted-foreground">Press Esc to exit fullscreen.</p>}
      </section>

      <section className="card overflow-hidden">
        <button ref={settingsButton} type="button" className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-accent transition-colors"
          aria-label="Focus settings" aria-expanded={settingsOpen} aria-controls="focus-settings" onClick={() => setSettingsOpen(open => !open)}>
          <span className="inline-flex items-center gap-3 text-sm font-medium"><Settings2 aria-hidden="true" className="w-4 h-4 text-muted-foreground" />Focus settings</span>
          <ChevronDown aria-hidden="true" className={`w-4 h-4 text-muted-foreground transition-transform ${settingsOpen ? "rotate-180" : ""}`} />
        </button>
        <div id="focus-settings" hidden={!settingsOpen} role="region" aria-label="Focus settings" className="border-t border-border p-5 space-y-5">
          {(running || startedAt || pendingRecording) && <p className="text-sm text-muted-foreground">Finish or reset this session to change its settings.</p>}
          <div>
            <p className="text-sm font-medium mb-2">Timer mode</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="group" aria-label="Focus mode">
              {Object.entries(MODES).map(([id, m]) => (
                <button key={id} onClick={() => changeMode(id)} disabled={locked} aria-pressed={mode === id}
                  data-testid={`mode-${id}`} className={`btn ${mode === id ? "btn-primary" : "btn-outline"}`}>{m.label}</button>
              ))}
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-6">
            {mode !== "stopwatch" && (
              <div className="space-y-3 text-left">
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
                    <button key={value} className="btn btn-ghost px-3! py-1! text-xs" disabled={locked}
                      aria-pressed={sessionSeconds === value * 60} onClick={() => applyMinutes(value)}>{value} min</button>
                  ))}
                </div>
                <p id="timer-time-hint" className="text-xs text-muted-foreground">
                  {baselinePending ? (subjectsFailed ? "Could not load your saved subject preset. Retry to restore your session." : "Loading your saved subject preset…") :
                    startedAt ? "Your current session keeps its original duration." :
                    customDurations[mode] ? "Your custom time is remembered for this mode. Applying a time starts a fresh block." :
                    subjectPreset ? `Using ${activeSubject.name}'s preset. Choose a time for this mode above.` :
                    "Choose 1–240 minutes. Your custom time is remembered for this mode."}
                </p>
                {customDurations[mode] && <button className="text-xs text-primary action-link" disabled={locked}
                  onClick={usePreset}>{subjectPreset ? "Use subject preset" : "Use default time"}</button>}
                {timeError && <p id="timer-time-error" role="alert" className="text-xs text-destructive">{timeError}</p>}
              </div>
            )}

            <div className="space-y-3">
              <div className="space-y-2">
                <label htmlFor="timer-subject" className="text-sm font-medium">Working on</label>
                <select id="timer-subject" className="input" value={subjectId} disabled={locked}
                  onChange={(e) => onPickSubject(e.target.value)} data-testid="timer-subject-select">
                  <option value="">No subject</option>
                  {subjects.map((s) => <option key={s.subject_id} value={s.subject_id}>{s.name}</option>)}
                </select>
              </div>
              {subjectId && <AcademicSelector hideSubject subjects={subjects} value={{ subject_id: subjectId, unit_id: unitId, lesson_id: lessonId }} disabled={locked} onChange={v => { setUnitId(v.unit_id); setLessonId(v.lesson_id); setLessonTitle(""); }} />}

              {eventTopic && <button className="btn btn-ghost text-sm" disabled={locked} onClick={reset}>Study on my own</button>}
            </div>
          </div>
          <button type="button" className="btn btn-outline" onClick={closeSettings}>Done</button>
        </div>
      </section>
      <div className="text-center space-y-3">
        {syncPending && <div className="space-y-2 text-sm"><p role="status" className="text-muted-foreground">{shared.loading ? "Checking your synced timer…" : "Connect to restore your synced timer."}</p>{!shared.loading && <button className="btn btn-outline" onClick={shared.refresh}>Retry timer sync</button>}</div>}
        {userId && legacyActive && <p className="text-sm text-muted-foreground">An older timer is saved on this device. Log or reset it to use your synced timer.</p>}
        {baselinePending && <div className="space-y-2 text-sm"><p role={subjectsFailed ? "alert" : "status"} className="text-muted-foreground">{subjectsFailed ? "Could not load your saved subject preset. Retry to restore your session." : "Loading your saved subject preset…"}</p>{subjectsFailed && <button className="btn btn-outline" onClick={() => retrySubjects?.()}>Retry subject preset</button>}</div>}
        {msg && <div role="status" className="text-sm text-primary" data-testid="timer-message">{msg}</div>}
        {subjectLinkPending && <div className="space-y-2 text-sm"><p role="status" className="text-muted-foreground">{subjectsFailed ? "Your linked subject couldn't load." : "Loading your linked subject…"}</p>{subjectsFailed && <div className="flex flex-wrap justify-center gap-2"><button className="btn btn-outline" onClick={() => retrySubjects?.()}>Retry linked subject</button><button className="btn btn-ghost" onClick={() => {
          if (running || startedAt || pendingRecording) return;
          onPickSubject("");
          setParams(previous => { const next = new URLSearchParams(previous); next.delete("subject"); return next; }, { replace: true });
        }}>Focus without a subject</button></div>}</div>}
        {(err || (synced && shared.error)) && <div role="alert" className="text-destructive text-sm">{err || shared.error}</div>}

      </div>
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
