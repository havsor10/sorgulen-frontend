// Installed only from the snow field view. Cache its static shell after a successful online visit.
const CACHE = "sorgulen-snow-shell-20261125-1";
const assets = ["broyting.html", "admin.css", "admin-shell.css", "admin-pages.css",
  "broyting.css", "admin-shell.js", "../config.js", "broyting.js", "broyting-portal.js"];
const paths = new Set(assets.map(asset => new URL(asset, self.location.href).pathname));
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(assets)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key =>
    key.startsWith("sorgulen-snow-shell-") && key !== CACHE).map(key => caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || !paths.has(url.pathname)) return;
  event.respondWith(fetch(request).catch(async () => {
    const cache = await caches.open(CACHE);
    return await cache.match(url.pathname, { ignoreSearch: true }) || Response.error();
  }));
});
