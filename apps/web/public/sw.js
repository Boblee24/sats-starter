/* Minimal service worker: cache the app shell so the app opens on a bad connection.
 * - /_next/static, icons, /voice/*: cache-first (immutable, hashed or versioned files)
 * - page navigations: network-first, fall back to the last cached copy
 * - /api/*: never cached here (apps queue writes themselves, e.g. in IndexedDB)
 * Apps extend PRECACHE (e.g. Konfam adds its voice pack).
 */
const VERSION = "v1";
const SHELL = `shell-${VERSION}`;
const PRECACHE = ["/", "/wallet", "/icon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL).then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(u)))).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  const cacheFirst =
    url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/voice/") || url.pathname === "/icon.svg";

  if (cacheFirst) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(SHELL).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("/"))),
    );
  }
});
