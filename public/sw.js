const CACHE = "mindmap-v1";
const STATIC = ["/", "/_next/static"];

self.addEventListener("install", e => {
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);

  // Skip API calls — always network
  if (url.pathname.startsWith("/api/")) return;

  // Cache-first for static assets
  if (url.pathname.startsWith("/_next/static") || url.pathname.endsWith(".png") || url.pathname.endsWith(".json")) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        });
      })
    );
    return;
  }

  // Network-first for pages
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});