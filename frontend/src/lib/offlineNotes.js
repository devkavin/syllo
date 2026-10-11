// Cache reads only. Draft writes continue through revision-checked autosave.
const DAY = 86_400_000;
const notePath = /^\/notebooks\/[^/?]+$/;
const readable = path => path === "/notebooks" || path === "/subjects" || notePath.test(path);
const summaryOnly = ({ content, rich_content, ...summary }) => summary;

export function indexedNoteRepository() {
  let database;
  const open = () => {
    if (!globalThis.indexedDB) return Promise.reject(new Error("Offline storage unavailable"));
    if (!database) database = new Promise((resolve, reject) => {
      const request = indexedDB.open("syllo-offline-notes", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("entries", { keyPath: "key" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Close other Syllo tabs to update offline storage"));
    }).catch(error => { database = null; throw error; });
    return database;
  };
  const run = async (mode, operation) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("entries", mode);
      const request = operation(transaction.objectStore("entries"));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  };
  return {
    available: Boolean(globalThis.indexedDB),
    all: () => run("readonly", store => store.getAll()),
    put: row => run("readwrite", store => store.put(row)),
    remove: key => run("readwrite", store => store.delete(key)),
  };
}

export function createOfflineNotes({ repository = indexedNoteRepository(), namespace = "/api", storage = globalThis.localStorage, now = Date.now, ttl = 30 * DAY, maxNotes = 25, maxBytes = 8 * 1024 * 1024 } = {}) {
  const pointer = `syllo.offline.account.${encodeURIComponent(namespace)}`;
  let owner = null;
  let epoch = 0;
  let serial = Promise.resolve();
  const mutations = new Map();
  const identity = () => ({ owner, epoch });
  const sameIdentity = token => {
    if (!token || token.owner !== owner || token.epoch !== epoch) return false;
    try { return storage.getItem(pointer) === owner; } catch { return true; }
  };
  const ownerKey = id => `${namespace}:${id}:`;
  const rowsFor = async id => (await repository.all()).filter(row => row.namespace === namespace && row.owner === id);
  const queue = action => { serial = serial.then(action, action).catch(() => null); return serial; };
  const setOwner = id => { if (id !== owner) { owner = id || null; epoch++; } };
  const clearOwner = () => {
    setOwner(null);
    epoch++; // Also invalidates a pending offline profile read.
    try { storage.removeItem(pointer); } catch { /* Storage can be disabled. */ }
  };
  const prune = async id => {
    const priority = row => row.path === "profile" ? 3 : row.path === "/notebooks" ? 2 : row.path === "/subjects" ? 1 : 0;
    const rows = (await rowsFor(id)).sort((a, b) => priority(b) - priority(a) || b.at - a.at || b.order - a.order);
    let notes = 0, bytes = 0, entries = 0;
    for (const row of rows) {
      const expired = now() - row.at > ttl;
      const isNote = notePath.test(row.path);
      if (expired || (isNote && notes >= maxNotes) || bytes + row.bytes > maxBytes || entries >= maxNotes + 3) await repository.remove(row.key);
      else { if (isNote) notes++; bytes += row.bytes; entries++; }
    }
  };
  let order = 0;
  const cache = {
    available: repository.available,
    accountPointer: pointer,
    identity, sameIdentity, setOwner, clearOwner,
    mutationVersion: path => mutations.get(ownerKey(owner) + path) || 0,
    async rememberProfile(profile) {
      if (!profile?.user_id) { clearOwner(); return; }
      setOwner(profile.user_id);
      try { storage.setItem(pointer, owner); } catch { /* Best effort. */ }
      await cache.put("profile", profile, owner);
    },
    async offlineProfile() {
      const started = epoch;
      let id;
      try { id = storage.getItem(pointer); } catch { return null; }
      if (!id) return null;
      try {
        const row = (await rowsFor(id)).find(row => row.path === "profile" && now() - row.at <= ttl);
        if (epoch !== started || !row) return null;
        setOwner(id);
        return row.data;
      } catch { return null; }
    },
    async put(path, data, id) {
      if (!id || id !== owner || (!readable(path) && path !== "profile")) return;
      const token = identity();
      const serialized = JSON.stringify(path === "/notebooks" && Array.isArray(data) ? data.map(summaryOnly) : data);
      const bytes = serialized.length * 2;
      const row = { key: ownerKey(id) + path, namespace, owner: id, path, data: JSON.parse(serialized), bytes, at: now(), order: ++order };
      return queue(async () => {
        if (!sameIdentity(token)) return;
        const old = (await rowsFor(id)).find(item => item.key === row.key);
        if (notePath.test(path) && old?.data.revision > data.revision) return;
        if (bytes > 1024 * 1024) { await repository.remove(row.key); return; } // Never reopen an old, smaller copy.
        await repository.put(row);
        await prune(id);
      });
    },
    async get(path, token = identity()) {
      if (!token.owner || !sameIdentity(token) || !readable(path)) return null;
      await serial;
      try {
        const rows = (await rowsFor(token.owner)).filter(row => now() - row.at <= ttl);
        if (!sameIdentity(token)) return null;
        const row = rows.find(row => row.path === path);
        if (!row) return null;
        if (path === "/notebooks") {
          const notes = new Map(rows.filter(row => notePath.test(row.path)).map(row => [row.data.notebook_id, row.data]));
          return Array.isArray(row.data) ? row.data.filter(note => notes.has(note.notebook_id)).map(note => ({ ...note, ...notes.get(note.notebook_id) })) : null;
        }
        return row.data;
      } catch { return null; }
    },
    async updateNotebook(data, token) {
      if (!sameIdentity(token) || !data?.notebook_id) return;
      const path = `/notebooks/${encodeURIComponent(data.notebook_id)}`;
      mutations.set(ownerKey(token.owner) + path, cache.mutationVersion(path) + 1);
      mutations.set(ownerKey(token.owner) + "/notebooks", cache.mutationVersion("/notebooks") + 1);
      await cache.put(path, data, token.owner);
      const list = await cache.get("/notebooks", token);
      if (list) await cache.put("/notebooks", [summaryOnly(data), ...list.filter(note => note.notebook_id !== data.notebook_id)], token.owner);
    },
    async removeNotebook(path, token) {
      if (!sameIdentity(token)) return;
      mutations.set(ownerKey(token.owner) + path, cache.mutationVersion(path) + 1);
      mutations.set(ownerKey(token.owner) + "/notebooks", cache.mutationVersion("/notebooks") + 1);
      await queue(async () => { if (sameIdentity(token)) await repository.remove(ownerKey(token.owner) + path); });
    },
    async clearNotes() {
      const id = owner;
      return queue(async () => {
        for (const row of await rowsFor(id)) if (row.path !== "profile") await repository.remove(row.key);
      });
    },
    async logout() {
      const id = owner;
      clearOwner();
      return queue(async () => { for (const row of await rowsFor(id)) await repository.remove(row.key); });
    },
  };
  return cache;
}

export function installOfflineNotes(client, cache, online = () => navigator.onLine !== false) {
  client.interceptors.request.use(config => ({ ...config, offlineIdentity: cache.identity(), offlineReadVersion: cache.mutationVersion(config.url) }));
  client.interceptors.response.use(async response => {
    const config = response.config;
    const token = config?.offlineIdentity;
    if (token && cache.sameIdentity(token)) {
      if (config.method === "get" && !config.params && config.offlineReadVersion === cache.mutationVersion(config.url)) await cache.put(config.url, response.data, token.owner);
      if (["patch", "post"].includes(config.method) && /^\/notebooks(?:\/|$)/.test(config.url) && response.data?.notebook_id) await cache.updateNotebook(response.data, token);
      if (config.method === "delete" && notePath.test(config.url)) await cache.removeNotebook(config.url, token);
    }
    return response;
  }, async error => {
    const config = error.config;
    const status = error.response?.status;
    if (status === 401 || (status === 403 && ["/auth/me", "/notebooks", "/subjects"].includes(config?.url))) cache.clearOwner();
    if ([403, 404].includes(status) && config?.method === "get" && notePath.test(config.url)) await cache.removeNotebook(config.url, config.offlineIdentity);
    if (!online() && !error.response && config?.method === "get" && !config.params && readable(config.url)) {
      const data = await cache.get(config.url, config.offlineIdentity);
      if (data != null) return { data, config, status: 200, statusText: "Saved on device", headers: {}, offline: true };
    }
    throw error;
  });
}
