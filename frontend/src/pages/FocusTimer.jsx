import React, { useEffect, useRef, useState } from "react";
import { http, formatError } from "@/lib/api";
import { formatTimer, formatSeconds, subjectClasses } from "@/lib/palette";
import { Play, Pause, RotateCcw, Save, Maximize2, Minimize2 } from "lucide-react";
import { useTheme } from "@/lib/theme";

const MODES = {
  pomodoro: { label: "Focus block", default: 25 * 60 },
  short:    { label: "Short break",  default: 5 * 60 },
  long:     { label: "Long break",   default: 15 * 60 },
  stopwatch:{ label: "Stopwatch",    default: 0 },
};

const STORAGE = "syllo.timer.v1";

export default function FocusTimer() {
  const [subjects, setSubjects] = useState([]);
  const [mode, setMode] = useState("pomodoro");
  const [subjectId, setSubjectId] = useState("");
  const [seconds, setSeconds] = useState(MODES.pomodoro.default);
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState(null); // ISO
  const [fullscreen, setFullscreen] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const tick = useRef(null);
  const { theme } = useTheme();
  const isDark = theme === "dark";

  // load subjects + resume state
  useEffect(() => {
    (async () => {
      try { setSubjects((await http.get("/subjects")).data); } catch {}
    })();
    const raw = localStorage.getItem(STORAGE);
    if (raw) {
      try {
        const s = JSON.parse(raw);
        setMode(s.mode); setSubjectId(s.subjectId || ""); setSeconds(s.seconds);
        setStartedAt(s.startedAt); setRunning(s.running);
      } catch {}
    }
  }, []);

  // persist state
  useEffect(() => {
    localStorage.setItem(STORAGE, JSON.stringify({ mode, subjectId, seconds, startedAt, running }));
  }, [mode, subjectId, seconds, startedAt, running]);

  // ticking
  useEffect(() => {
    if (!running) { if (tick.current) clearInterval(tick.current); return; }
    tick.current = setInterval(() => {
      setSeconds((s) => {
        if (mode === "stopwatch") return s + 1;
        if (s <= 1) { setRunning(false); tryLogSession(true); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(tick.current);
    // eslint-disable-next-line
  }, [running, mode]);

  const start = () => {
    if (!startedAt) setStartedAt(new Date().toISOString());
    setRunning(true);
    setMsg("");
  };
  const pause = () => setRunning(false);
  const reset = () => {
    setRunning(false); setStartedAt(null);
    setSeconds(MODES[mode].default);
  };
  const changeMode = (m) => {
    setMode(m); setSeconds(MODES[m].default); setRunning(false); setStartedAt(null);
  };

  const currentDuration = () => {
    if (mode === "stopwatch") return seconds;
    return MODES[mode].default - seconds;
  };

  const tryLogSession = async (auto = false) => {
    const duration = currentDuration();
    if (duration < 10) {
      if (!auto) setMsg("A session needs at least 10 seconds.");
      return;
    }
    try {
      await http.post("/sessions", {
        subject_id: subjectId || null,
        duration_seconds: duration,
        mode,
        started_at: startedAt || new Date().toISOString(),
        note: "",
      });
      setMsg(`Saved. ${formatSeconds(duration)} logged.`);
      reset();
    } catch (e) { setErr(formatError(e)); }
  };

  const activeSubject = subjects.find((s) => s.subject_id === subjectId);
  const dot = activeSubject ? subjectClasses(activeSubject.color, isDark).dot : "hsl(var(--muted-foreground))";

  const view = (
    <div className="max-w-2xl mx-auto text-center space-y-8" data-testid="focus-timer-page">
      <div>
        <h1 className="font-serif text-3xl tracking-tight">Focus</h1>
        <p className="text-muted-foreground mt-1">A calm block of time. That's all it needs to be.</p>
      </div>

      <div className="flex justify-center flex-wrap gap-1 p-1 rounded-lg bg-accent w-fit mx-auto">
        {Object.entries(MODES).map(([id, m]) => (
          <button
            key={id}
            onClick={() => changeMode(id)}
            data-testid={`mode-${id}`}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${mode === id ? "bg-card shadow-sm" : "text-muted-foreground"}`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="mx-auto w-64 h-64 rounded-full grid place-items-center border border-border relative">
        <div className="font-mono text-6xl tabular-nums font-semibold tracking-wider" data-testid="timer-display">
          {formatTimer(seconds)}
        </div>
        <span className="absolute bottom-6 subject-dot !w-2 !h-2" style={{ background: dot }} />
      </div>

      <div className="flex justify-center flex-wrap gap-2">
        {!running ? (
          <button className="btn btn-primary !px-6" onClick={start} data-testid="timer-start"><Play className="w-4 h-4" /> Start</button>
        ) : (
          <button className="btn btn-outline !px-6" onClick={pause} data-testid="timer-pause"><Pause className="w-4 h-4" /> Pause</button>
        )}
        <button className="btn btn-ghost" onClick={reset} data-testid="timer-reset"><RotateCcw className="w-4 h-4" /> Reset</button>
        <button className="btn btn-outline" onClick={() => tryLogSession(false)} data-testid="timer-save">
          <Save className="w-4 h-4" /> Log session
        </button>
        <button className="btn btn-ghost" onClick={() => setFullscreen((f) => !f)} data-testid="timer-fullscreen">
          {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          {fullscreen ? "Exit" : "Fullscreen"}
        </button>
      </div>

      <div className="max-w-xs mx-auto">
        <label className="text-xs text-muted-foreground">Working on</label>
        <select
          className="input mt-1"
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
          data-testid="timer-subject-select"
        >
          <option value="">No subject</option>
          {subjects.map((s) => <option key={s.subject_id} value={s.subject_id}>{s.name}</option>)}
        </select>
      </div>

      {msg && <div className="text-sm text-primary" data-testid="timer-message">{msg}</div>}
      {err && <div className="text-destructive text-sm">{err}</div>}
    </div>
  );

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-background grid place-items-center p-6" data-testid="fullscreen-timer">
        <div className="w-full">{view}</div>
      </div>
    );
  }
  return view;
}
