import { useEffect, useMemo, useSyncExternalStore } from "react";

const resourceWrites = new Map();

function resourceStore(key, initialValue, save) {
  const storageKey = `syllo.draft.${key}`;
  let pending = {};
  let storedValue = null;
  let inFlight = {};
  try { storedValue = key ? sessionStorage.getItem(storageKey) : null; pending = JSON.parse(storedValue || "{}"); } catch { /* Keep editing when storage is unavailable. */ }
  let snapshot = { draft: { ...initialValue, ...pending }, saveState: Object.keys(pending).length ? "failed" : "idle", error: "" };
  let timer;
  let writing;
  let active = true;
  const listeners = new Set();
  const publish = (patch) => { snapshot = { ...snapshot, ...patch }; listeners.forEach(fn => fn()); };
  const persist = (onlyIfUnchanged = false) => {
    try {
      if (!key || (onlyIfUnchanged && sessionStorage.getItem(storageKey) !== storedValue)) return;
      const recovery = { ...inFlight, ...pending };
      storedValue = Object.keys(recovery).length ? JSON.stringify(recovery) : null;
      if (storedValue) sessionStorage.setItem(storageKey, storedValue);
      else sessionStorage.removeItem(storageKey);
    } catch { /* Server saves still work when recovery storage is unavailable. */ }
  };
  const store = {
    save,
    getSnapshot: () => snapshot,
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    activate: () => { active = true; },
    cancel: () => { active = false; clearTimeout(timer); },
    update(patch) {
      pending = { ...pending, ...patch };
      persist();
      publish({ draft: { ...snapshot.draft, ...patch }, saveState: "saving", error: "" });
      clearTimeout(timer);
      timer = setTimeout(() => { void store.flush(); }, 800);
    },
    async flush() {
      clearTimeout(timer);
      if (writing) { await writing; if (active && Object.keys(pending).length && snapshot.saveState !== "failed") return store.flush(); return snapshot.saveState !== "failed" && !Object.keys(pending).length; }
      if (!key || !Object.keys(pending).length) return true;
      const patch = pending;
      inFlight = patch;
      pending = {};
      publish({ saveState: "saving", error: "" });
      let success = true;
      const predecessor = resourceWrites.get(key);
      writing = (async () => {
        if (predecessor) await predecessor;
        try {
          const data = await store.save(patch);
          inFlight = {};
          publish({ draft: { ...snapshot.draft, ...data, ...pending }, saveState: Object.keys(pending).length ? "saving" : "saved" });
          persist(true);
        } catch (error) {
          pending = { ...patch, ...pending };
          inFlight = {};
          persist(true);
          publish({ saveState: "failed", error: "Not saved yet. Your draft is still here." });
          success = false;
        }
      })();
      const write = writing;
      resourceWrites.set(key, write);
      await writing;
      if (resourceWrites.get(key) === write) resourceWrites.delete(key);
      writing = null;
      if (active && success && Object.keys(pending).length) return store.flush();
      return success && !Object.keys(pending).length;
    },
  };
  return store;
}

export function useResourceAutosave({ resourceKey, initialValue, save }) {
  const store = useMemo(() => resourceStore(resourceKey, initialValue, save), [resourceKey]);
  store.save = save;
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => { store.activate(); return () => store.cancel(); }, [store]);
  return { ...snapshot, update: store.update, retry: store.flush, flush: store.flush };
}
