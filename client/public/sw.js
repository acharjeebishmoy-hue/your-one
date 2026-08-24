/* Your One service worker — network-first, cache fallback */
const CACHE = "yourone-v2";

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(["/", "/logo.svg", "/logo.png", "/manifest.webmanifest"]).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Real push notifications — show a system notification when the server pushes */
self.addEventListener("push", (e) => {
  let data = {};
  try {
    data = e.data ? e.data.json() : {};
  } catch {
    /* bad payload — ignore */
  }
  const title = data.title || "Your One";
  const isCall = data.type === "call";
  const options = {
    body: data.body || "",
    icon: data.icon || "/logo.svg",
    badge: "/logo.svg",
    // Call notifications: long vibration, stay on screen until tapped, loud
    // Regular notifications: short buzz, auto-dismiss
    vibrate: isCall ? [300, 100, 300, 100, 300] : [200, 100, 200],
    requireInteraction: isCall, // call notifications STAY until farmer taps them
    tag: isCall ? "call-" + Date.now() : (data.tag || "yourone"), // calls never group — each one is unique
    renotify: isCall, // vibrate again for each new call
    data: { url: data.url || "/messages", type: data.type || "default", callId: data.callId || null, callerName: data.callerName || null },
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

/* Tap a notification → open the right page */
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  let url = (e.notification.data && e.notification.data.url) || "/";
  // For calls: append callId so the app opens DIRECTLY to the incoming call screen
  const d = e.notification.data || {};
  if (d.type === "call" && d.callId) {
    url = "/messages?call=" + d.callId + "&from=" + encodeURIComponent(d.callerName || "");
  }
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // never cache API calls

  // Network first (always fresh), fall back to cache when offline
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) => {
          // navigation fallback: serve the app shell so the app opens offline
          if (!hit && req.mode === "navigate") return caches.match("/");
          return hit;
        })
      )
  );
});
