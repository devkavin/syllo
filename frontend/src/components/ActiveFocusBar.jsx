import React from "react";
import { Link } from "react-router-dom";
import { Pause, Play, Timer } from "lucide-react";
import { useSharedFocusTimer } from "@/hooks/useSharedFocusTimer";

export default function ActiveFocusBar({ userId, enabled = true }) {
  const shared = useSharedFocusTimer({ userId, enabled: Boolean(userId && enabled) });
  if (!userId || !enabled) return null;
  const timer = shared.snapshot?.timer;
  if (!timer && !shared.error) return null;
  const seconds = Math.max(0, Math.floor(shared.displaySeconds));
  const time = `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
  return <section aria-label="Active focus session" className="sticky top-16 md:top-3 z-20 rounded-xl border border-primary/25 bg-card shadow-sm p-3 mb-6">
    {timer && <div className="flex flex-wrap items-center gap-3">
      <Timer className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">{timer.status === "paused" ? "Focus paused" : "Focus in progress"}</p><span className="font-mono text-lg tabular-nums">{time}</span></div>
      <button className="btn btn-outline" disabled={shared.busy || navigator.onLine === false} aria-label={timer.status === "paused" ? "Resume focus" : "Pause focus"} onClick={() => { void shared.act(timer.status === "paused" ? "resume" : "pause").catch(() => {}); }}>
        {timer.status === "paused" ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}<span>{timer.status === "paused" ? "Resume" : "Pause"}</span>
      </button>
      <Link to="/timer" className="btn btn-ghost">Open Focus</Link>
    </div>}
    {shared.error && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm mt-2"><span className="flex-1">{shared.error}</span><button className="btn btn-ghost" onClick={shared.refresh}>Sync timer</button></div>}
  </section>;
}
