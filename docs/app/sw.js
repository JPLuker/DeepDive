/**
 * Service worker.
 *
 * Its first job is unglamorous: Android only mints a real installed app
 * (a WebAPK) when a service worker is registered. Without one, adding to
 * the home screen produces a legacy shortcut, which is why the installed
 * app was labelled "Web App" rather than DeepDive.
 *
 * STRATEGY — network-first for everything we own.
 *
 * The obvious PWA pattern is cache-first, which is faster. It is also
 * how a service worker bricks an app: a stale cached copy of app.js will
 * be served forever, and the user has no way to know why the fix you
 * just deployed hasn't arrived. Given how often this app ships, arriving
 * at the current version matters far more than shaving a few hundred
 * milliseconds off a warm load.
 *
 * So: try the network, fall back to cache only when offline. The cache
 * exists to keep the app usable on a bad connection, not to accelerate a
 * good one.
 *
 * Spotify API calls are never touched — they're authenticated, they
 * change constantly, and a cached response would be actively wrong.
 */

const VERSION = "v1";
const CACHE = `deepdive-shell-${VERSION}`;

// The minimum needed to render something useful offline.
const SHELL = [
  "./",
  "./index.html",
  "../js/app.js",
  "../assets/icon-192.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // Individual failures shouldn't abort the install — a missing
      // optional asset is not a reason to have no service worker.
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith("deepdive-shell-") && k !== CACHE)
            .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only same-origin GETs. Spotify's API and image CDN are left alone.
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache a copy for offline use, but only successful basic
        // responses — caching an error page would be worse than nothing.
        if (response && response.status === 200 && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        // A navigation with nothing cached still needs somewhere to land.
        if (request.mode === "navigate") {
          const shell = await caches.match("./index.html");
          if (shell) return shell;
        }
        throw new Error("offline and not cached");
      })
  );
});
