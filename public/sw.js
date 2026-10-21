// Service worker: shows push notifications, opens the app when one is tapped, and shows an offline page
// when a page cannot be loaded. Nothing else is cached: pages, API, auth and Supabase responses hold
// personal data and always come from the network.
const CACHE_VERSION = "v3";
const CACHE_NAME = "planner-offline-" + CACHE_VERSION;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll([OFFLINE_URL, "/icons/icon-192.png"]))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key.startsWith("planner-offline-") && key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

// Network first for page loads; the offline page only when the network fails.
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.mode !== "navigate" || request.method !== "GET") return;
  event.respondWith(
    fetch(request).catch(async () => {
      const cached = await caches.match(OFFLINE_URL);
      return cached || new Response("Du er frakoblet.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }),
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const title = typeof payload.title === "string" && payload.title ? payload.title : "Familieplanlegger";
  const options = {
    body: typeof payload.body === "string" ? payload.body : "",
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-72.png",
    data: { url: typeof payload.url === "string" ? payload.url : "/" },
  };
  if (typeof payload.tag === "string" && payload.tag) options.tag = payload.tag;
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin);
  // Only ever open pages of this app.
  const href = target.origin === self.location.origin ? target.href : self.location.origin + "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          if ("navigate" in client) await client.navigate(href);
          return;
        }
      }
      await self.clients.openWindow(href);
    }),
  );
});
