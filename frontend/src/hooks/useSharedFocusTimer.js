import { useEffect, useMemo, useSyncExternalStore } from "react";
import { formatError, http } from "@/lib/api";

function timerStore(enabled) {
  let state = { snapshot: null, loading: enabled, busy: false, error: "", displaySeconds: 0, elapsedSeconds: 0 };
  let baseline = 0;
  let active = false;
  let lifecycle = 0;
  let mutationEpoch = 0;
  let sequence = 0;
  let acceptedSequence = 0;
  let expiredKey = null;
  let refreshPending = false;
  let lastPollAt = 0;
  const listeners = new Set();
  const publish = patch => {
    state = { ...state, ...patch };
    listeners.forEach(listener => listener());
  };
  function clock(snapshot = state.snapshot) {
    const timer = snapshot?.timer;
    if (!timer) return { elapsedSeconds: 0, displaySeconds: 0 };
    let elapsed = Math.max(0, timer.elapsed_seconds || 0);
    if (timer.status === "running") elapsed += Math.max(0, performance.now() - baseline) / 1000;
    if (timer.mode !== "stopwatch") elapsed = Math.min(timer.duration_seconds, elapsed);
    return { elapsedSeconds: elapsed, displaySeconds: timer.mode === "stopwatch" ? Math.floor(elapsed) : Math.ceil(Math.max(0, timer.duration_seconds - elapsed)) };
  }
  function accept(data, requestSequence, sentAt) {
    const currentRevision = state.snapshot?.revision ?? -1;
    if (data.revision < currentRevision || (data.revision === currentRevision && requestSequence < acceptedSequence)) return false;
    acceptedSequence = Math.max(acceptedSequence, requestSequence);
    const receivedAt = performance.now();
    const serverWork = Date.parse(data.server_now) - Date.parse(data.server_received_at);
    const transit = Math.max(0, receivedAt - sentAt - (Number.isFinite(serverWork) ? Math.max(0, serverWork) : 0));
    baseline = receivedAt - transit / 2;
    publish({ snapshot: data, loading: false, error: "", ...clock(data) });
    return true;
  }
  async function refresh() {
    if (!enabled || !active) return null;
    if (state.busy) { refreshPending = true; return state.snapshot; }
    const requestSequence = ++sequence;
    const epoch = mutationEpoch;
    const lifetime = lifecycle;
    lastPollAt = performance.now();
    const sentAt = performance.now();
    try {
      const { data } = await http.get("/focus-timer", { timeout: 15000 });
      if (active && lifetime === lifecycle && epoch === mutationEpoch) accept(data, requestSequence, sentAt);
      return data;
    } catch (error) {
      if (active && lifetime === lifecycle && epoch === mutationEpoch && requestSequence >= acceptedSequence) {
        publish({ loading: false, error: `Timer could not sync. ${formatError(error)}` });
        expiredKey = null;
      }
      return null;
    }
  }
  async function act(actionOrConfig, startConfig = {}) {
    if (!enabled || !active) throw new Error("The shared timer is unavailable for this account.");
    if (state.loading || !state.snapshot) throw new Error("Wait for the timer to sync before starting or changing it.");
    if (state.busy) throw new Error("A timer action is already being saved.");
    if (navigator.onLine === false) {
      const error = new Error("You are offline. Reconnect before changing the timer.");
      publish({ error: error.message });
      throw error;
    }
    const config = typeof actionOrConfig === "string" ? { ...startConfig, action: actionOrConfig } : actionOrConfig;
    const body = { ...config, expected_revision: state.snapshot.revision, request_id: crypto.randomUUID() };
    const lifetime = lifecycle;
    const requestSequence = ++sequence;
    ++mutationEpoch; // Every earlier GET belongs to the state before this action.
    publish({ busy: true, error: "" });
    let failure;
    let response;
    let sentAt;
    try {
      // A lost response may hide a committed action. Retry its idempotency key,
      // never manufacture a second action or substitute a newer revision.
      try { sentAt = performance.now(); response = await http.post("/focus-timer/action", body, { timeout: 15000 }); }
      catch (error) {
        if (error.response || navigator.onLine === false || !active || lifetime !== lifecycle) throw error;
        sentAt = performance.now();
        response = await http.post("/focus-timer/action", body, { timeout: 15000 });
      }
      if (active && lifetime === lifecycle) accept(response.data, requestSequence, sentAt);
      return response.data;
    } catch (error) {
      failure = error;
      if (active && lifetime === lifecycle) publish({ error: `Timer action was not confirmed. ${formatError(error)}` });
      throw error;
    } finally {
      if (active && lifetime === lifecycle) {
        publish({ busy: false });
        const conflict = failure?.response?.status === 409;
        if (conflict || refreshPending) {
          refreshPending = false;
          await refresh();
          if (conflict) publish({ error: "The timer changed on another device. Review the current timer before trying again." });
        }
      }
    }
  }
  function tick() {
    if (!active || document.visibilityState === "hidden") return;
    const values = clock();
    if (values.elapsedSeconds !== state.elapsedSeconds || values.displaySeconds !== state.displaySeconds) publish(values);
    const timer = state.snapshot?.timer;
    const expired = timer?.status === "running" && timer.mode !== "stopwatch" && values.elapsedSeconds >= timer.duration_seconds;
    const key = expired ? `${state.snapshot.revision}:${timer.timer_id}` : null;
    if (key && expiredKey !== key && !state.busy) {
      expiredKey = key;
      void refresh(); // Completion and study logging belong exclusively to the server.
    } else if (!state.busy && performance.now() - lastPollAt >= (timer?.status === "running" ? 2000 : 5000)) void refresh();
  }
  return {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    refresh, act,
    start() {
      if (!enabled) return () => {};
      active = true;
      ++lifecycle;
      void refresh();
      const interval = setInterval(tick, 250);
      const resume = () => { if (document.visibilityState !== "hidden") { void refresh(); tick(); } };
      for (const event of ["focus", "pageshow", "online"]) window.addEventListener(event, resume);
      document.addEventListener("visibilitychange", resume);
      return () => {
        active = false;
        ++lifecycle;
        clearInterval(interval);
        for (const event of ["focus", "pageshow", "online"]) window.removeEventListener(event, resume);
        document.removeEventListener("visibilitychange", resume);
      };
    },
  };
}

/** Server timer: act("start", config) / act("pause" | "resume" | "reset" | "finish").
 * Actions return the server envelope or throw; refresh returns an envelope or null.
 * Pass the authenticated userId to discard old account state on an account change.
 */
export function useSharedFocusTimer({ userId, enabled = true } = {}) {
  const store = useMemo(() => timerStore(enabled), [userId, enabled]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => store.start(), [store]);
  return { ...state, refresh: store.refresh, act: store.act };
}
