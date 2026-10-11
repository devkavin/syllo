import { describe, it, expect, vi } from "vitest";
import { createOfflineNotes, installOfflineNotes } from "./offlineNotes";

function repository() {
  const rows = new Map();
  return {
    available: true,
    all: async () => [...rows.values()],
    put: async row => rows.set(row.key, structuredClone(row)),
    remove: async key => rows.delete(key),
  };
}
const profile = id => ({ user_id: id, name: id, timezone: "Asia/Colombo" });

describe("offline recent notes", () => {
  it("keeps cached notes separate by account, and logout removes the current copy", async () => {
    const cache = createOfflineNotes({ repository: repository(), namespace: "test", storage: localStorage });
    await cache.rememberProfile(profile("one"));
    await cache.put("/notebooks/n1", { notebook_id: "n1", title: "Private" }, "one");
    await cache.rememberProfile(profile("two"));
    expect(await cache.get("/notebooks/n1")).toBeNull();
    await cache.rememberProfile(profile("one"));
    expect((await cache.get("/notebooks/n1")).title).toBe("Private");
    await cache.logout();
    expect(await cache.offlineProfile()).toBeNull();
    await cache.rememberProfile(profile("one"));
    expect(await cache.get("/notebooks/n1")).toBeNull();
  });

  it("bounds recent notes and returns only available notes from a cached list", async () => {
    const cache = createOfflineNotes({ repository: repository(), namespace: "bounded", storage: localStorage, maxNotes: 2 });
    await cache.rememberProfile(profile("one"));
    await cache.put("/notebooks", [1, 2, 3].map(n => ({ notebook_id: `n${n}` })), "one");
    for (const n of [1, 2, 3]) await cache.put(`/notebooks/n${n}`, { notebook_id: `n${n}` }, "one");
    expect(await cache.get("/notebooks/n1")).toBeNull();
    expect(await cache.get("/notebooks")).toEqual([{ notebook_id: "n2" }, { notebook_id: "n3" }]);
  });

  it("expires data and ignores a late response from a previous account", async () => {
    let now = 10;
    const cache = createOfflineNotes({ repository: repository(), namespace: "expiry", storage: localStorage, ttl: 100, now: () => now });
    await cache.rememberProfile(profile("one"));
    await cache.put("/notebooks/n1", { notebook_id: "n1" }, "one");
    now = 111;
    expect(await cache.get("/notebooks/n1")).toBeNull();
    await cache.rememberProfile(profile("two"));
    await cache.put("/notebooks/n1", { notebook_id: "n1" }, "one");
    await cache.rememberProfile(profile("one"));
    expect(await cache.get("/notebooks/n1")).toBeNull();
  });

  it("falls back only for an offline GET, never writes, queries, or server errors", async () => {
    const cache = createOfflineNotes({ repository: repository(), namespace: "policy", storage: localStorage });
    await cache.rememberProfile(profile("one"));
    await cache.put("/notebooks/n1", { notebook_id: "n1" }, "one");
    const handlers = {};
    const client = { interceptors: { request: { use: fn => { handlers.request = fn; } }, response: { use: (ok, error) => { handlers.ok = ok; handlers.error = error; } } } };
    installOfflineNotes(client, cache, () => false);
    const config = handlers.request({ method: "get", url: "/notebooks/n1" });
    const result = await handlers.error({ config });
    expect(result.data.notebook_id).toBe("n1");
    expect(result.offline).toBe(true);
    for (const error of [
      { config, response: { status: 401 } }, { config, response: { status: 404 } },
      { config: { ...config, method: "patch" } }, { config: { ...config, url: "/notebooks?trash=true" } },
      { config: { ...config, url: "/focus-timer" } },
    ]) await expect(handlers.error(error)).rejects.toBe(error);
    await expect(handlers.error({ config })).rejects.toEqual({ config });
    expect(await cache.offlineProfile()).toBeNull();
    expect(vi.isMockFunction(handlers.ok)).toBe(false);
  });

  it("updates cached notes after confirmed writes and removes confirmed deletions", async () => {
    const cache = createOfflineNotes({ repository: repository(), namespace: "writes", storage: localStorage });
    await cache.rememberProfile(profile("one"));
    await cache.put("/notebooks", [{ notebook_id: "n1", title: "Old" }], "one");
    await cache.put("/notebooks/n1", { notebook_id: "n1", title: "Old", revision: 1 }, "one");
    const handlers = {};
    const client = { interceptors: { request: { use: fn => { handlers.request = fn; } }, response: { use: (ok, error) => { handlers.ok = ok; handlers.error = error; } } } };
    installOfflineNotes(client, cache);
    const config = handlers.request({ method: "patch", url: "/notebooks/n1" });
    await handlers.ok({ config, data: { notebook_id: "n1", title: "Saved", content: "Latest", revision: 2 } });
    expect(await cache.get("/notebooks/n1")).toMatchObject({ content: "Latest", revision: 2 });
    expect(await cache.get("/notebooks")).toMatchObject([{ title: "Saved" }]);
    await handlers.ok({ config: handlers.request({ method: "delete", url: "/notebooks/n1" }), data: {} });
    expect(await cache.get("/notebooks/n1")).toBeNull();
    expect(await cache.get("/notebooks")).toEqual([]);
    const staleList = handlers.request({ method: "get", url: "/notebooks" });
    await handlers.ok({ config: handlers.request({ method: "post", url: "/notebooks" }), data: { notebook_id: "n2", title: "New", content: "New content", revision: 1 } });
    await handlers.ok({ config: staleList, data: [] });
    expect(await cache.get("/notebooks")).toMatchObject([{ notebook_id: "n2", title: "New" }]);
  });

  it("does not use or write a cache after another tab changes the account", async () => {
    const cache = createOfflineNotes({ repository: repository(), namespace: "tabs", storage: localStorage });
    await cache.rememberProfile(profile("one"));
    const token = cache.identity();
    localStorage.setItem("syllo.offline.account.tabs", "two");
    expect(cache.sameIdentity(token)).toBe(false);
    await cache.put("/notebooks/n1", { notebook_id: "n1" }, "one");
    localStorage.setItem("syllo.offline.account.tabs", "one");
    expect(await cache.get("/notebooks/n1")).toBeNull();
  });

  it("evicts a forbidden note and an oversized replacement, rather than exposing an old copy", async () => {
    const cache = createOfflineNotes({ repository: repository(), namespace: "rejected", storage: localStorage });
    await cache.rememberProfile(profile("one"));
    await cache.put("/notebooks/n1", { notebook_id: "n1", revision: 1 }, "one");
    const handlers = {};
    const client = { interceptors: { request: { use: fn => { handlers.request = fn; } }, response: { use: (ok, error) => { handlers.ok = ok; handlers.error = error; } } } };
    installOfflineNotes(client, cache, () => false);
    const config = handlers.request({ method: "get", url: "/notebooks/n1" });
    await expect(handlers.error({ config, response: { status: 403 } })).rejects.toMatchObject({ response: { status: 403 } });
    await expect(handlers.error({ config })).rejects.toEqual({ config });
    await cache.put("/notebooks/n1", { notebook_id: "n1", revision: 1 }, "one");
    await cache.put("/notebooks/n1", { notebook_id: "n1", revision: 2, content: "x".repeat(600_000) }, "one");
    expect(await cache.get("/notebooks/n1")).toBeNull();
  });
});
