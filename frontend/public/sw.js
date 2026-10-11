/* Generated precache values are filled by the production build. No user data here. */
const CACHE = "syllo-shell-__SYLLO_VERSION__";
const PRECACHE = __SYLLO_PRECACHE__;
const staticAsset = url => url.origin === self.location.origin && !url.search && (url.pathname.startsWith("/assets/") || ["/syllo-icon.svg", "/app.webmanifest"].includes(url.pathname));

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE)));
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith("syllo-shell-") && name !== CACHE) await caches.delete(name);
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => (await caches.open(CACHE)).match("/app.html")));
  } else if (staticAsset(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && PRECACHE.includes(url.pathname)) await cache.put(request, response.clone());
      return response;
    })());
  }
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const client = clients.find(window => new URL(window.url).origin === self.location.origin);
    if (client) { await client.navigate("/today"); await client.focus(); }
    else await self.clients.openWindow("/today");
  })());
});
