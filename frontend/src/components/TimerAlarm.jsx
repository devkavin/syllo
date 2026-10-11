import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, BellOff, Volume2 } from "lucide-react";
import { useSharedFocusTimer } from "@/hooks/useSharedFocusTimer";
import { createTimerSound } from "@/lib/timerSound";

const AlarmContext = createContext(null);
export function TimerAlarmProvider({ userId, children }) {
  return <DeviceAlarm key={userId || "signed-out"} userId={userId}>{children}</DeviceAlarm>;
}
function DeviceAlarm({ userId, children }) {
  const shared = useSharedFocusTimer({ userId, enabled: !!userId, background: true });
  const [enabled, setEnabled] = useState(false);
  const [alarm, setAlarm] = useState(false);
  const [error, setError] = useState("");
  const [portalTarget, setPortalTarget] = useState(() => document.fullscreenElement || document.body);
  const sound = useRef(null);
  const observed = useRef(undefined);
  const live = useRef(true);
  const busy = useRef(false);
  useEffect(() => { live.current = true; return () => { live.current = false; sound.current?.close(); }; }, []);
  useEffect(() => {
    const changed = () => setPortalTarget(document.fullscreenElement || document.body);
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);
  useEffect(() => {
    const snapshot = shared.snapshot;
    if (!snapshot) return;
    const completed = snapshot.alarm_timer_id || (snapshot.completion_automatic ? snapshot.completed_timer_id : null) || null;
    const previous = observed.current;
    observed.current = completed;
    if (previous === undefined || !completed || previous === completed) return;
    setAlarm(true);
    // Show a missed completion on return, without loudly replaying a stale alarm.
    const age = Date.parse(snapshot.server_now) - Date.parse(snapshot.alarm_completed_at || snapshot.completed_at);
    if (enabled && (!Number.isFinite(age) || age < 120_000)) {
      void sound.current.play().catch(() => { if (live.current) { setEnabled(false); setError("Sound could not play. Enable alarm sound again on this device."); } });
    }
  }, [shared.snapshot, enabled]);
  async function enable() {
    if (busy.current) return;
    busy.current = true; setError("");
    try {
      sound.current ||= createTimerSound();
      await sound.current.enable();
      if (!live.current) return;
      await sound.current.play({ test: true });
      if (live.current) setEnabled(true);
    } catch { if (live.current) { setEnabled(false); setError("Could not enable sound. Check this device's volume and browser sound permissions, then try again."); } }
    finally { busy.current = false; }
  }
  function disable() { sound.current?.stop(); setEnabled(false); setError(""); }
  function dismiss() { sound.current?.stop(); setAlarm(false); setError(""); }
  const value = { enabled, enable, disable, error: alarm || shared.snapshot?.timer ? "" : error };
  return <AlarmContext.Provider value={value}>
    {children}
    {createPortal(<>
    {userId && alarm && <section role="status" aria-label="Timer alarm" className="fixed z-50 bottom-24 md:bottom-6 inset-x-3 sm:left-auto sm:right-6 sm:max-w-sm rounded-xl border border-primary/30 bg-card shadow-lg p-4 space-y-3"><p className="font-medium flex items-center gap-2"><Bell className="w-5 h-5" />Timer finished</p><p className="text-sm text-muted-foreground">Your countdown is complete.</p><div className="flex flex-wrap gap-2"><button className="btn btn-primary" onClick={dismiss}>Dismiss alarm</button>{!enabled && <button className="btn btn-outline" onClick={enable}>Enable sound here</button>}</div>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</section>}
    {userId && shared.snapshot?.timer && !enabled && !alarm && <div className="fixed bottom-24 md:bottom-6 right-3 z-40"><button className="btn btn-outline bg-card shadow-sm text-sm" onClick={enable}><Bell className="w-4 h-4" />Enable alarm sound</button>{error && <p role="alert" className="bg-card rounded-lg p-2 max-w-xs text-sm text-destructive">{error}</p>}</div>}
    </>, portalTarget)}
  </AlarmContext.Provider>;
}
export function TimerAlarmControls() {
  const alarm = useContext(AlarmContext);
  if (!alarm) return null;
  return <div className="space-y-2"><p className="text-sm font-medium">Completion alarm</p><div className="flex flex-wrap gap-2"><button className="btn btn-outline" onClick={alarm.enable}><Volume2 className="w-4 h-4" />{alarm.enabled ? "Test alarm sound" : "Enable alarm sound"}</button>{alarm.enabled && <button className="btn btn-ghost" onClick={alarm.disable}><BellOff className="w-4 h-4" />Mute this device</button>}</div><p className="text-xs text-muted-foreground">Enable sound on each open device you want to hear. Keep the phone page active; locked or suspended browsers may delay the alarm.</p>{alarm.error && <p role="alert" className="text-sm text-destructive">{alarm.error}</p>}</div>;
}
