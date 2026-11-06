import { useEffect, useMemo, useSyncExternalStore } from "react";
import { formatError } from "@/lib/api";
import { getLibrary, patchLibrary } from "./libraryApi";

const empty = () => ({ revision: 0, favorites: [], recent: [], items: [] });
const copy = value => JSON.parse(JSON.stringify(value));
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function libraryStore(enabled) {
  let snapshot = { state: empty(), loading: enabled, busy: false, error: "", canDiscard: false };
  let active = false, lifetime = 0, loaded = false, loadSequence = 0;
  let loadPromise = null, processing = null, failure = null;
  const queue = [], controllers = new Set(), listeners = new Set();
  const current = life => active && life === lifetime;
  const publish = patch => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach(listener => listener());
  };
  const settle = (job, value) => { if (!job.settled) { job.settled = true; job.resolve(value); } };
  const settlePending = value => queue.forEach(job => settle(job, value));
  function accept(state, life) {
    if (!current(life)) return;
    if (!state || !Number.isInteger(state.revision) || state.revision < 0 ||
      ![state.favorites, state.recent, state.items].every(Array.isArray)) throw new Error("The library response could not be read.");
    if (state.revision >= snapshot.state.revision) publish({ state: copy(state) });
  }
  async function load() {
    if (!enabled || !active) return false;
    const life = lifetime, sequence = ++loadSequence, controller = new AbortController();
    controllers.add(controller);
    publish({ loading: true });
    const request = (async () => {
      try {
        const state = await getLibrary({ signal: controller.signal });
        if (!current(life) || sequence !== loadSequence) return false;
        accept(state, life);
        loaded = true;
        publish({ loading: false, ...(failure === "write" ? {} : { error: "" }) });
        return true;
      } catch (error) {
        if (current(life) && sequence === loadSequence) publish({ loading: false, error: `Personal library could not load. ${formatError(error)}` });
        return false;
      } finally {
        controllers.delete(controller);
        if (current(life) && sequence === loadSequence) loadPromise = null;
      }
    })();
    loadPromise = request;
    return request;
  }
  async function send(job, life) {
    if (!job.command) {
      job.command = job.create(snapshot.state);
      job.baseItem = copy(snapshot.state.items.find(item => item.id === job.command.item?.id) ?? null);
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!current(life)) return false;
      const controller = new AbortController();
      controllers.add(controller);
      try {
        const state = await patchLibrary(job.command, snapshot.state.revision, { signal: controller.signal });
        if (!current(life)) return false;
        accept(state, life);
        return true;
      } catch (error) {
        if (!current(life)) return false;
        const latest = error?.response?.status === 409 && error.response.data?.detail?.current;
        if (!latest) throw error;
        accept(latest, life);
        const remoteItem = snapshot.state.items.find(item => item.id === job.command.item?.id) ?? null;
        const safe = job.command.action !== "save" || job.explicitRetry || equal(job.baseItem, remoteItem) || equal(job.command.item, remoteItem);
        if (!safe) throw new Error("This saved item changed on another device. Review it, then retry to replace it.");
        if (attempt === 1) throw error;
      } finally {
        controllers.delete(controller);
      }
    }
    return false;
  }
  function drain() {
    if (!active || failure || !queue.length) return Promise.resolve(false);
    if (processing) return processing;
    const life = lifetime;
    publish({ busy: true, canDiscard: false });
    const work = (async () => {
      if (!loaded && loadPromise) await loadPromise;
      if (!current(life)) return false;
      if (!loaded) { failure = "load"; settlePending(false); return false; }
      while (queue.length && current(life)) {
        const job = queue[0];
        try {
          if (!await send(job, life)) return false;
          queue.shift();
          settle(job, true);
          publish({ error: "" });
        } catch (error) {
          if (current(life)) {
            failure = "write";
            settlePending(false);
            publish({ error: `Personal library could not save. ${formatError(error)}` });
          }
          return false;
        }
      }
      return current(life);
    })();
    const result = work.finally(() => {
      if (processing === result) processing = null;
      if (current(life)) publish({ busy: false, canDiscard: Boolean(failure && queue.length) });
    });
    processing = result;
    return result;
  }
  function enqueue(create) {
    if (!enabled || !active) return Promise.resolve(false);
    let resolve;
    const result = new Promise(done => { resolve = done; });
    const job = { create, resolve, settled: false, command: null };
    queue.push(job);
    if (failure || (!loaded && !snapshot.loading)) {
      if (!failure) failure = "load";
      settle(job, false);
      publish({ canDiscard: true, error: snapshot.error || "Personal library could not load. Retry library sync to save your changes." });
    } else void drain();
    return result;
  }
  async function retry() {
    if (!enabled || !active) return false;
    if (!queue.length) return load();
    queue[0].explicitRetry = true;
    failure = null;
    publish({ error: "", canDiscard: false });
    if (!loaded && !await load()) { failure = "load"; publish({ canDiscard: Boolean(queue.length) }); return false; }
    return drain();
  }
  async function retryLoad() {
    if (!await load()) return false;
    if (failure === "load") failure = null;
    return queue.length && failure !== "write" ? drain() : true;
  }
  async function discardFailed() {
    if (!active || !failure || !queue.length || processing) return false;
    const wasLoadFailure = !loaded;
    settle(queue.shift(), false);
    failure = null;
    publish({ canDiscard: false, ...(wasLoadFailure ? {} : { error: "" }) });
    if (!queue.length) return true;
    if (!loaded) { failure = "load"; publish({ canDiscard: true }); return true; }
    await drain();
    return true;
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    toggleFavorite: id => enqueue(state => ({ action: "favorite", asset_id: id, enabled: !state.favorites.includes(id) })),
    recordRecent: id => enqueue(() => ({ action: "recent", asset_id: id })),
    saveItem(item) {
      try {
        const saved = copy(item);
        return enqueue(() => ({ action: "save", item: saved }));
      } catch (error) {
        if (active) publish({ error: `Personal library could not save. ${formatError(error)}` });
        return Promise.resolve(false);
      }
    },
    removeItem: id => enqueue(() => ({ action: "remove", item_id: id })),
    retry, retryLoad, discardFailed,
    start() {
      if (!enabled) return () => {};
      active = true;
      ++lifetime;
      loaded = false;
      failure = null;
      processing = null;
      void load();
      return () => {
        active = false;
        ++lifetime;
        controllers.forEach(controller => controller.abort());
        controllers.clear();
        settlePending(false);
        queue.length = 0;
      };
    },
  };
}

/** Account-scoped library failures never throw into the document editor.
 * Mutations and retries resolve true on confirmation, false if retained/disabled.
 */
export function useStudioLibrary(accountId) {
  const store = useMemo(() => libraryStore(Boolean(accountId)), [accountId]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => store.start(), [store]);
  return { ...state, toggleFavorite: store.toggleFavorite, recordRecent: store.recordRecent,
    saveItem: store.saveItem, removeItem: store.removeItem, retry: store.retry, retryLoad: store.retryLoad, discardFailed: store.discardFailed };
}
