/* Minimal PWA service worker: network pass-through, no caching.
   Registered only to support "Add to Home screen / Install App";
   it does not change page behavior. */
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (event) { event.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request));
});
