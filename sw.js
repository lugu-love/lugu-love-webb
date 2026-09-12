// One-time cleanup worker. The MVP has no PWA and no offline cache.
self.addEventListener("install", function(event){ self.skipWaiting(); });
self.addEventListener("activate", function(event){
  event.waitUntil((async function(){
    var keys = await caches.keys();
    await Promise.all(keys.map(function(key){ return caches.delete(key); }));
    await self.registration.unregister();
  })());
});
self.addEventListener("fetch", function(event){ event.respondWith(fetch(event.request)); });
