// @vitest-environment node
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { expect, it } from "vitest";
import { offlineShell } from "./offline-shell";

it("prepares notebook static and lazy diagram dependencies without caching every route", async () => {
  const chunk = (fileName, properties = {}) => ({ type: "chunk", fileName, imports: [], dynamicImports: [], ...properties });
  const bundle = {
    "assets/main.js": chunk("assets/main.js", { isEntry: true, dynamicImports: ["assets/notebooks.js", "assets/admin.js"] }),
    "assets/notebooks.js": chunk("assets/notebooks.js", { name: "Notebooks", imports: ["assets/main.js"], dynamicImports: ["assets/diagram.js"] }),
    "assets/diagram.js": chunk("assets/diagram.js", { imports: ["assets/math.js"] }),
    "assets/math.js": chunk("assets/math.js"),
    "assets/admin.js": chunk("assets/admin.js"),
  };
  let worker;
  await offlineShell().generateBundle.call({ emitFile: file => { worker = file.source; } }, {}, bundle);
  expect(worker).toContain('"/assets/notebooks.js"');
  expect(worker).toContain('"/assets/diagram.js"');
  expect(worker).toContain('"/assets/math.js"');
  expect(worker).not.toContain('"/assets/admin.js"');
  expect(worker).not.toContain("__SYLLO_PRECACHE__");
});

it("serves the cached app shell offline without intercepting API reads or writes", async () => {
  const listeners = {};
  let cachedPath;
  const offlineShell = { ok: true, body: "app shell" };
  const scope = {
    URL, Response, Set,
    self: { location: { origin: "https://syllo.test" }, addEventListener: (name, listener) => { listeners[name] = listener; }, clients: { claim: async () => {} } },
    caches: { open: async () => ({ match: async path => { cachedPath = path; return offlineShell; }, put: async () => {} }), keys: async () => [], delete: async () => true },
    fetch: async () => { throw new Error("offline"); },
  };
  vm.runInNewContext(readFileSync(new URL("../public/sw.js", import.meta.url), "utf8").replace("__SYLLO_PRECACHE__", "[]").replace("__SYLLO_VERSION__", "test"), scope);
  for (const request of [{ url: "https://syllo.test/api/notebooks", method: "GET" }, { url: "https://syllo.test/api/tasks", method: "POST" }, { url: "https://other.test/assets/a.js", method: "GET" }]) {
    let intercepted = false;
    listeners.fetch({ request, respondWith: () => { intercepted = true; } });
    expect(intercepted).toBe(false);
  }
  let response;
  listeners.fetch({ request: { url: "https://syllo.test/notebooks?notebook=n", method: "GET", mode: "navigate" }, respondWith: promise => { response = promise; } });
  expect(await response).toBe(offlineShell);
  expect(cachedPath).toBe("/app.html");
});
