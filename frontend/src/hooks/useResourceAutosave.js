import { useEffect, useMemo, useSyncExternalStore } from "react";

const resourceWrites = new Map();

function resourceStore(key, initialValue, save, { accountId, versioned }) {
  const storageKey = accountId ? `syllo.draft.account.${encodeURIComponent(accountId)}.${key}` : `syllo.draft.${key}`;
  const writeKey = accountId ? `${accountId}:${key}` : key;
  let storage;
  try { storage = accountId ? localStorage : sessionStorage; } catch { /* Some browsers block storage entirely. */ }
  // Versioned recovery is only persisted once an account is known.
  const canPersist = Boolean(key && (!versioned || accountId));
  let baseRevision = initialValue?.revision ?? 1;
  let pending = {};
  let storedValue = null;
  let inFlight = {};
  try {
    storedValue = canPersist ? storage.getItem(storageKey) : null;
    const recovery = JSON.parse(storedValue || "{}");
    pending = versioned ? (recovery?.patch || {}) : (recovery || {});
    if (versioned && Object.keys(pending).length) baseRevision = recovery.baseRevision;
    if (!storedValue && versioned && accountId && initialValue?.notebook_id && key === `notebook.${initialValue.notebook_id}`) {
      const legacyKey = `syllo.draft.${key}`;
      const legacyDraft = JSON.parse(sessionStorage.getItem(legacyKey) || "{}");
      if (legacyDraft && typeof legacyDraft === "object" && !Array.isArray(legacyDraft) && Object.keys(legacyDraft).length) {
        pending = legacyDraft;
        // Older drafts have no reliable base revision; ask for an explicit recovery choice.
        baseRevision = null;
        const migrated = JSON.stringify({ patch: pending, baseRevision });
        storage.setItem(storageKey, migrated);
        storedValue = migrated;
        sessionStorage.removeItem(legacyKey);
      }
    }
  } catch { /* Keep editing when storage is unavailable. */ }
  const recovered = Object.keys(pending).length > 0;
  const conflict = recovered && versioned && baseRevision !== (initialValue?.revision ?? 1) ? { current: initialValue } : null;
  let snapshot = { draft: { ...initialValue, ...pending }, saveState: conflict ? "conflict" : recovered ? "failed" : "idle", error: recovered ? "Recovered a draft from this device." : "", conflict };
  let timer;
  let writing;
  let generation = 0;
  let active = true;
  const listeners = new Set();
  const publish = (patch) => { snapshot = { ...snapshot, ...patch }; listeners.forEach(fn => fn()); };
  const persist = (onlyIfUnchanged = false) => {
    try {
      if (!canPersist || (onlyIfUnchanged && storage.getItem(storageKey) !== storedValue)) return;
      const recovery = { ...inFlight, ...pending };
      storedValue = Object.keys(recovery).length ? JSON.stringify(versioned ? { patch: recovery, baseRevision } : recovery) : null;
      if (storedValue) storage.setItem(storageKey, storedValue);
      else storage.removeItem(storageKey);
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
      publish({ draft: { ...snapshot.draft, ...patch }, saveState: snapshot.conflict ? "conflict" : "saving", error: "" });
      clearTimeout(timer);
      if (!snapshot.conflict) timer = setTimeout(() => { void store.flush(); }, 800);
    },
    replace(data) {
      clearTimeout(timer);
      generation += 1;
      pending = {};
      inFlight = {};
      baseRevision = data?.revision ?? 1;
      persist(true);
      publish({ draft: { ...data }, saveState: "idle", error: "", conflict: null });
    },
    conflictWith(current) {
      clearTimeout(timer);
      generation += 1;
      pending = { ...snapshot.draft, ...pending };
      inFlight = {};
      persist();
      publish({ saveState: "conflict", conflict: { current }, error: "This notebook changed elsewhere." });
    },
    async flush() {
      clearTimeout(timer);
      if (snapshot.conflict) return false;
      if (writing) { await writing; if (active && Object.keys(pending).length && !["failed", "conflict"].includes(snapshot.saveState)) return store.flush(); return !["failed", "conflict"].includes(snapshot.saveState) && !Object.keys(pending).length; }
      if (!key || !Object.keys(pending).length) return true;
      const patch = pending;
      const writeGeneration = generation;
      const expectedRevision = baseRevision;
      inFlight = patch;
      pending = {};
      publish({ saveState: "saving", error: "" });
      let success = true;
      const predecessor = resourceWrites.get(writeKey);
      writing = (async () => {
        if (predecessor) await predecessor;
        if (generation !== writeGeneration) { success = false; return; }
        try {
          const data = await store.save(versioned ? { ...patch, expected_revision: expectedRevision } : patch);
          if (generation !== writeGeneration) { success = false; return; }
          inFlight = {};
          baseRevision = data?.revision ?? baseRevision;
          publish({ draft: { ...snapshot.draft, ...data, ...pending }, saveState: Object.keys(pending).length ? "saving" : "saved" });
          persist(true);
        } catch (error) {
          if (generation !== writeGeneration) { success = false; return; }
          pending = { ...patch, ...pending };
          inFlight = {};
          persist(true);
          const current = error?.response?.status === 409 ? error.response.data?.detail?.current : null;
          publish({ saveState: current && versioned ? "conflict" : "failed", conflict: current && versioned ? { current } : null, error: "Not saved yet. Your draft is still here." });
          success = false;
        }
      })();
      const write = writing;
      resourceWrites.set(writeKey, write);
      await writing;
      if (resourceWrites.get(writeKey) === write) resourceWrites.delete(writeKey);
      writing = null;
      if (active && success && Object.keys(pending).length) return store.flush();
      return success && !Object.keys(pending).length;
    },
  };
  return store;
}

export function useResourceAutosave({ resourceKey, initialValue, save, accountId, versioned = false }) {
  const store = useMemo(() => resourceStore(resourceKey, initialValue, save, { accountId, versioned }), [resourceKey, accountId, versioned]);
  store.save = save;
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => { store.activate(); return () => store.cancel(); }, [store]);
  return { ...snapshot, update: store.update, retry: store.flush, flush: store.flush, replace: store.replace, conflictWith: store.conflictWith, getDraft: () => store.getSnapshot().draft };
}
